import { WorkspaceEdit } from "vscode";
import { DecoratedClass, FileMetadata, MetadataCache, PropertyMetadata } from "../../cache/cache";
import { ChangeObject, IRefactorTool, ManualRefactorContext } from "../../refactor/refactorInterfaces";
import { TreeViewContext } from "../commandHelpers";
import { UserInputService } from "../../services/userInputService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { isModelFile } from "../../utils/metadata";
import * as vscode from "vscode";
import { FIELD_TYPE_OPTIONS } from "../interfaces";

export abstract class ExtractFieldsController implements IRefactorTool {
  protected userInputService: UserInputService;
  protected sourceCodeService: SourceCodeService;

  constructor() {
    this.userInputService = new UserInputService();
    this.sourceCodeService = new SourceCodeService();
  }

  // Abstract methods - must be implemented by subclasses
  abstract getCommandId(): string;
  abstract getTitle(): string;
  abstract getHandledChangeTypes(): string[];
  abstract prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<WorkspaceEdit>;
  // Abstract method for manual refactor - each tool implements its own prompting logic
  abstract initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined>;

  // Concrete methods - shared logic implemented in base class
  
  /**
   * This tool doesn't detect automatic changes.
   */
  analyze(
    oldFileMeta?: FileMetadata,
    newFileMeta?: FileMetadata,
    accumulatedChanges?: ChangeObject[]
  ): ChangeObject[] {
    return [];
  }

  /**
   * Determines if this tool can handle a manual refactor trigger.
   * Allows extraction when multiple fields are selected in a model file.
   */
  async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
    // Must be in a model file
    if (!isModelFile(context.uri)) {
      return false;
    }

    // Get the source model from context
    const sourceModel = this.getSourceModelFromContext(context);
    if (!sourceModel) {
      return false;
    }

    // For manual trigger, we allow it if there are fields in the model
    return Object.keys(sourceModel.properties || {}).length > 1; // Need at least 2 fields to extract
  }

  /**
   * Common field selection and validation logic for manual refactors.
   */
  protected async getSelectedFieldsFromContext(
    context: ManualRefactorContext,
    targetType: string
  ): Promise<{ sourceModel: DecoratedClass; selectedFields: PropertyMetadata[] } | undefined> {
    const sourceModel = this.getSourceModelFromContext(context);
    if (!sourceModel) {
      vscode.window.showErrorMessage("Could not find a model in the current context");
      return undefined;
    }

    // Get all fields in the model
    const allFields = Object.values(sourceModel.properties) as PropertyMetadata[];
    if (allFields.length < 2) {
      vscode.window.showErrorMessage(`Model must have at least 2 fields to extract some to ${targetType}`);
      return undefined;
    }

    let selectedFields: PropertyMetadata[] | undefined;

    const treeViewContext = context.treeViewContext as TreeViewContext | undefined;

    if (treeViewContext?.fieldItems && treeViewContext.fieldItems.length > 0) {
      // Tree view context: use the selected field items
      selectedFields = treeViewContext.fieldItems.map((fieldItem: any) => {
        const fieldItemName = fieldItem.label.toLowerCase();
        const field = allFields.find((prop) => prop.name === fieldItemName);
        if (!field) {
          throw new Error(`Could not find field '${fieldItem.label}' in model '${context.metadata?.name}'`);
        }
        return field;
      });
    } else {
      // Let user select which fields to extract
      selectedFields = await this.selectFieldsForExtraction(allFields, targetType);
      if (!selectedFields || selectedFields.length === 0) {
        return undefined;
      }
    }

    return { sourceModel, selectedFields };
  }

    /**
   * Shows user a quick pick to select which fields to extract.
   */
  public async selectFieldsForExtraction(allFields: PropertyMetadata[], type:string): Promise<PropertyMetadata[] | undefined> {
    const fieldItems = allFields.map((field) => ({
      label: field.name,
      description: this.getFieldTypeDescription(field),
      field: field,
    }));

    const typeUpper = type.charAt(0).toUpperCase() + type.slice(1);

    const selectedItems = await vscode.window.showQuickPick(fieldItems, {
      canPickMany: true,
      placeHolder: `Select fields to extract to the new ${type} model`,
      title: `Extract Fields to ${typeUpper}`,
    });

    return selectedItems?.map((item) => item.field);
  }

  /**
   * Gets a description of the field type for display in the quick pick.
   */
  private getFieldTypeDescription(field: PropertyMetadata): string {
    const decoratorName = this.getDecoratorName(field.decorators);
    return `@${decoratorName}`;
  }

  /**
   * Gets the decorator name for a field's type.
   */
  private getDecoratorName(decorators: any[]): string {
    const typeDecorator = decorators.find((d) => FIELD_TYPE_OPTIONS.some((o) => o.decorator === d.name));
    return typeDecorator ? typeDecorator.name : "Text";
  }

  /**
   * Gets the source model from the refactor context, handling different context types.
   */
  protected getSourceModelFromContext(context: ManualRefactorContext): DecoratedClass | null {
    // Case 1: metadata is already a DecoratedClass (model)
    if (context.metadata && "properties" in context.metadata) {
      return context.metadata as DecoratedClass;
    }

    // Case 2: metadata is a PropertyMetadata (field) - find the containing model
    if (context.metadata && "decorators" in context.metadata) {
      const fieldMetadata = context.metadata as PropertyMetadata;
      return this.findSourceModelForField(context.cache, fieldMetadata);
    }

    // Case 3: no specific metadata - try to find model at the range
    return this.findModelAtRange(context.cache, context.uri, context.range);
  }

  /**
   * Finds the model that contains the given field.
   */
  private findSourceModelForField(cache: MetadataCache, fieldMetadata: PropertyMetadata): DecoratedClass | null {
    const allModels = cache.getDataModelClasses();

    for (const model of allModels) {
      const fieldInModel = Object.values(model.properties).find(
        (prop) =>
          prop.name === fieldMetadata.name &&
          prop.declaration.uri.fsPath === fieldMetadata.declaration.uri.fsPath &&
          prop.declaration.range.start.line === fieldMetadata.declaration.range.start.line
      );

      if (fieldInModel) {
        return model;
      }
    }

    return null;
  }

  /**
   * Finds the model class that contains the given range.
   */
  private findModelAtRange(cache: MetadataCache, uri: vscode.Uri, range: vscode.Range): DecoratedClass | null {
    const allModels = cache.getDataModelClasses();

    for (const model of allModels) {
      if (model.declaration.uri.fsPath === uri.fsPath && model.declaration.range.contains(range)) {
        return model;
      }
    }

    return null;
  }

  /**
   * Generates field code directly from PropertyMetadata, preserving all decorator information.
   */
  protected generateFieldCodeFromPropertyMetadata(property: PropertyMetadata): string {
    const lines: string[] = [];

    // Add all decorators in the same order as the original
    for (const decorator of property.decorators) {
      if (decorator.name === "Field" || decorator.name === "Relationship") {
        // Handle Field and Relationship decorators with their arguments
        if (decorator.arguments && decorator.arguments.length > 0) {
          lines.push(`@${decorator.name}({`);
          const args = decorator.arguments[0]; // Usually the first argument contains the options object
          if (typeof args === "object" && args !== null) {
            // Format each property of the arguments object
            for (const [key, value] of Object.entries(args)) {
              if (typeof value === "string") {
                lines.push(`  ${key}: "${value}",`);
              } else if (typeof value === "boolean") {
                lines.push(`  ${key}: ${value},`);
              } else if (typeof value === "number") {
                lines.push(`  ${key}: ${value},`);
              } else {
                lines.push(`  ${key}: ${JSON.stringify(value)},`);
              }
            }
          }
          lines.push("})");
        } else {
          lines.push(`@${decorator.name}({})`);
        }
      } else {
        // Handle type decorators (Text, Choice, etc.) with their arguments
        if (decorator.arguments && decorator.arguments.length > 0) {
          const args = decorator.arguments[0];
          if (typeof args === "object" && args !== null && Object.keys(args).length > 0) {
            lines.push(`@${decorator.name}({`);
            for (const [key, value] of Object.entries(args)) {
              if (typeof value === "string") {
                lines.push(`  ${key}: "${value}",`);
              } else if (typeof value === "boolean") {
                lines.push(`  ${key}: ${value},`);
              } else if (typeof value === "number") {
                lines.push(`  ${key}: ${value},`);
              } else if (Array.isArray(value)) {
                lines.push(`  ${key}: ${JSON.stringify(value)},`);
              } else {
                lines.push(`  ${key}: ${JSON.stringify(value)},`);
              }
            }
            lines.push("})");
          } else {
            lines.push(`@${decorator.name}()`);
          }
        } else {
          lines.push(`@${decorator.name}()`);
        }
      }
    }

    // Add property declaration using the original type
    lines.push(`${property.name}!: ${property.type};`);

    return lines.join("\n");
  }
}

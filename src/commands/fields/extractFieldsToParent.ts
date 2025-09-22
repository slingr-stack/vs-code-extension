import * as vscode from "vscode";
import {
  IRefactorTool,
  ChangeObject,
  ManualRefactorContext,
  ExtractFieldsToParentPayload,
} from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { NewModelTool } from "../models/newModel";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import { TreeViewContext } from "../commandHelpers";
import { isModelFile } from "../../utils/metadata";
import * as path from "path";

/**
 * Refactor tool for extracting multiple fields from a model to a new abstract parent model.
 *
 * This tool allows users to select multiple fields and move them to a new abstract parent
 * model extending BaseModel. The source model will then extend from this new parent model
 * instead of its current parent. It provides preview functionality before applying changes.
 */
export class ExtractFieldsToParentTool implements IRefactorTool {
  private userInputService: UserInputService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private newModelTool: NewModelTool;
  private addFieldTool: AddFieldTool;
  private deleteFieldTool: DeleteFieldTool;

  constructor() {
    this.userInputService = new UserInputService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.newModelTool = new NewModelTool();
    this.addFieldTool = new AddFieldTool();
    this.deleteFieldTool = new DeleteFieldTool();
  }

  /**
   * Returns the VS Code command identifier for this refactor tool.
   */
  getCommandId(): string {
    return "slingr-vscode-extension.extractFieldsToParent";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Extract Fields to Parent";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["EXTRACT_FIELDS_TO_PARENT"];
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
   * This tool doesn't detect automatic changes.
   */
  analyze(): ChangeObject[] {
    return [];
  }

  /**
   * Initiates the manual refactor by prompting user for field selection and new parent model name.
   */
  async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    const sourceModel = this.getSourceModelFromContext(context);
    if (!sourceModel) {
      vscode.window.showErrorMessage("Could not find a model in the current context");
      return undefined;
    }

    // Get all fields in the model
    const allFields = Object.values(sourceModel.properties) as PropertyMetadata[];
    if (allFields.length < 2) {
      vscode.window.showErrorMessage("Model must have at least 2 fields to extract some to parent");
      return undefined;
    }

    let selectedFields: PropertyMetadata[] | undefined;

    const treeViewContext = context.treeViewContext as TreeViewContext | undefined;

    if (treeViewContext?.fieldItems && treeViewContext.fieldItems.length > 0) {
      // Tree view context: use the selected field items
      selectedFields = treeViewContext.fieldItems.map((fieldItem) => {
        const fieldItemName = fieldItem.label.toLowerCase();
        const field = allFields.find((prop) => prop.name === fieldItemName);
        if (!field) {
          throw new Error(`Could not find field '${fieldItem.label}' in model '${context.metadata?.name}'`);
        }
        return field;
      });
    } else {
      // Let user select which fields to extract
      selectedFields = await this.selectFieldsForExtraction(allFields);
      if (!selectedFields || selectedFields.length === 0) {
        return undefined;
      }
    }

    // Get the new parent model name
    const newParentModelName = await this.userInputService.showPrompt("Enter the name for the new abstract parent model:");
    if (!newParentModelName) {
      return undefined;
    }

    const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const newParentModelPath = path.join(sourceDir, `${newParentModelName}.ts`);
    const newParentModelUri = vscode.Uri.file(newParentModelPath);

    const payload: ExtractFieldsToParentPayload = {
      sourceModelName: sourceModel.name,
      newParentModelName: newParentModelName,
      fieldsToExtract: selectedFields,
      isManual: true,
      urisToCreate: [
        {
          uri: newParentModelUri,
        },
      ],
    };

    return {
      type: "EXTRACT_FIELDS_TO_PARENT",
      uri: context.uri,
      description: `Extract ${selectedFields.length} field(s) to new abstract parent model '${newParentModelName}' for model '${sourceModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ExtractFieldsToParentPayload;

    try {
      const sourceModel = cache.getModelByName(payload.sourceModelName);
      if (!sourceModel) {
        throw new Error(`Could not find source model '${payload.sourceModelName}'`);
      }

      const edit = new vscode.WorkspaceEdit();

      // Get the URI from the payload
      const newParentModelUri = payload.urisToCreate![0].uri;

      // Generate the complete file content for the abstract parent model
      const completeFileContent = this.generateCompleteParentModelFile(
        payload.newParentModelName,
        payload.fieldsToExtract,
        sourceModel,
        cache
      );

      const metadata: vscode.WorkspaceEditEntryMetadata = {
        label: `Create new abstract parent model file ${path.basename(newParentModelUri.fsPath)}`,
        description: `Creating new abstract parent model file for ${payload.newParentModelName}`,
        needsConfirmation: true,
      };

      // Create the file with content
      edit.createFile(
        newParentModelUri,
        {
          overwrite: false,
          ignoreIfExists: true,
          contents: Buffer.from(completeFileContent, "utf8"),
        },
        metadata
      );

      // Step 2: Update the source model to extend from the new parent model
      await this.updateSourceModelToExtendParent(
        edit,
        sourceModel,
        payload.newParentModelName,
        cache
      );

      // Step 3: Remove the fields from the source model
      for (const field of payload.fieldsToExtract) {
        await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache, edit);
      }

      return edit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to prepare extract fields to parent edit: ${error}`);
      throw error;
    }
  }

  /**
   * Shows user a quick pick to select which fields to extract.
   */
  private async selectFieldsForExtraction(allFields: PropertyMetadata[]): Promise<PropertyMetadata[] | undefined> {
    const fieldItems = allFields.map((field) => ({
      label: field.name,
      description: this.getFieldTypeDescription(field),
      field: field,
    }));

    const selectedItems = await vscode.window.showQuickPick(fieldItems, {
      canPickMany: true,
      placeHolder: "Select fields to extract to the new abstract parent model",
      title: "Extract Fields to Parent",
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
   * Gets the source model from the refactor context, handling different context types.
   */
  private getSourceModelFromContext(context: ManualRefactorContext): DecoratedClass | null {
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
   * Gets the decorator name for a field's type.
   */
  private getDecoratorName(decorators: any[]): string {
    const typeDecorator = decorators.find((d) => FIELD_TYPE_OPTIONS.some((o) => o.decorator === d.name));
    return typeDecorator ? typeDecorator.name : "Text";
  }

  /**
   * Generates the complete file content for the new abstract parent model, including imports.
   */
  private generateCompleteParentModelFile(
    modelName: string,
    fieldsToExtract: PropertyMetadata[],
    sourceModel: DecoratedClass,
    cache: MetadataCache
  ): string {
    const lines: string[] = [];

    // Generate imports
    const requiredImports = new Set(["BaseModel", "Field"]);
    for (const field of fieldsToExtract) {
      for (const decorator of field.decorators) {
        requiredImports.add(decorator.name);
      }
    }

    // Add the import statement
    const importList = Array.from(requiredImports).sort();
    lines.push(`import { ${importList.join(", ")} } from 'slingr-framework';`);
    lines.push(""); // Empty line after imports

    // Add model decorator
    lines.push(`@Model()`);

    // Add abstract model class extending BaseModel
    lines.push(`export abstract class ${modelName} extends BaseModel {`);
    lines.push("");

    // Add each field using PropertyMetadata to preserve all decorator information
    for (const field of fieldsToExtract) {
      const fieldCode = this.generateFieldCodeFromPropertyMetadata(field);
      lines.push(...fieldCode.split("\n").map((line) => (line ? `  ${line}` : "")));
      lines.push("");
    }

    lines.push("}");
    lines.push(""); // Empty line at end

    return lines.join("\n");
  }

  /**
   * Generates field code directly from PropertyMetadata, preserving all decorator information.
   */
  private generateFieldCodeFromPropertyMetadata(property: PropertyMetadata): string {
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

  /**
   * Updates the source model to extend from the new parent model instead of its current parent.
   */
  private async updateSourceModelToExtendParent(
    edit: vscode.WorkspaceEdit,
    sourceModel: DecoratedClass,
    newParentModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);

    // Add import for the parent model
    await this.sourceCodeService.addModelImport(document, newParentModelName, edit, cache);

    // Find the class declaration line and update it to extend from the new parent
    const lines = document.getText().split("\n");
    const classLine = this.findClassDeclarationLine(lines, sourceModel.name);
    
    if (classLine === -1) {
      throw new Error(`Could not find class declaration for ${sourceModel.name}`);
    }

    const currentLine = lines[classLine];
    const newLine = this.updateClassExtension(currentLine, sourceModel.name, newParentModelName);

    const lineRange = new vscode.Range(
      new vscode.Position(classLine, 0),
      new vscode.Position(classLine, currentLine.length)
    );

    const metadata: vscode.WorkspaceEditEntryMetadata = {
      label: `Update ${sourceModel.name} to extend ${newParentModelName}`,
      description: `Changing class inheritance for ${sourceModel.name}`,
      needsConfirmation: true,
    };

    edit.replace(sourceModel.declaration.uri, lineRange, newLine, metadata);
  }

  /**
   * Finds the line number of the class declaration.
   */
  private findClassDeclarationLine(lines: string[], className: string): number {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes(`class ${className}`) && line.includes("extends")) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Updates the class extension to use the new parent model.
   */
  private updateClassExtension(currentLine: string, className: string, newParentModelName: string): string {
    // Replace the current extends clause with the new parent
    const extendsPattern = /extends\s+\w+/;
    return currentLine.replace(extendsPattern, `extends ${newParentModelName}`);
  }
}
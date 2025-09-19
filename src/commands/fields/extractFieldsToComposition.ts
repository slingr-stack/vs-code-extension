import * as vscode from "vscode";
import {
  IRefactorTool,
  ChangeObject,
  ManualRefactorContext,
  ExtractFieldsToCompositionPayload,
} from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { AddCompositionTool } from "../models/addComposition";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import { TreeViewContext } from "../commandHelpers";
import { isModelFile } from "../../utils/metadata";
import { detectIndentation, applyIndentation } from "../../utils/detectIndentation";

/**
 * Refactor tool for extracting multiple fields from a model to a new composition model.
 *
 * This tool allows users to select multiple fields and move them to a new composition
 * model, creating a composition relationship between the source and new models.
 * It provides preview functionality before applying changes.
 */
export class ExtractFieldsToCompositionTool implements IRefactorTool {
  private userInputService: UserInputService;
  private sourceCodeService: SourceCodeService;
  private addCompositionTool: AddCompositionTool;
  private addFieldTool: AddFieldTool;
  private deleteFieldTool: DeleteFieldTool;

  constructor() {
    this.userInputService = new UserInputService();
    this.sourceCodeService = new SourceCodeService();
    this.addCompositionTool = new AddCompositionTool();
    this.addFieldTool = new AddFieldTool();
    this.deleteFieldTool = new DeleteFieldTool();
  }

  /**
   * Returns the VS Code command identifier for this refactor tool.
   */
  getCommandId(): string {
    return "slingr-vscode-extension.extractFieldsToComposition";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Extract Fields to Composition";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["EXTRACT_FIELDS_TO_COMPOSITION"];
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
   * Initiates the manual refactor by prompting user for field selection and composition name.
   */
  async initiateManualRefactor(
    context: ManualRefactorContext,
  ): Promise<ChangeObject | undefined> {
    const sourceModel = this.getSourceModelFromContext(context);
    if (!sourceModel) {
      vscode.window.showErrorMessage("Could not find a model in the current context");
      return undefined;
    }

    // Get all fields in the model
    const allFields = Object.values(sourceModel.properties) as PropertyMetadata[];
    if (allFields.length < 2) {
      vscode.window.showErrorMessage("Model must have at least 2 fields to extract some to composition");
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

    // Get the composition field name
    const compositionFieldName = await this.userInputService.showPrompt(
      "Enter the name for the new composition field (e.g., 'address', 'contactInfo'):"
    );
    if (!compositionFieldName) {
      return undefined;
    }

    const payload: ExtractFieldsToCompositionPayload = {
      sourceModelName: sourceModel.name,
      compositionFieldName: compositionFieldName,
      fieldsToExtract: selectedFields,
      isManual: true,
    };

    return {
      type: "EXTRACT_FIELDS_TO_COMPOSITION",
      uri: context.uri,
      description: `Extract ${selectedFields.length} field(s) to new composition '${compositionFieldName}' in model '${sourceModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ExtractFieldsToCompositionPayload;

    try {
      const sourceModel = cache.getModelByName(payload.sourceModelName);
      if (!sourceModel) {
        throw new Error(`Could not find source model '${payload.sourceModelName}'`);
      }

      const combinedEdit = new vscode.WorkspaceEdit();

      // Step 1: Create the composition field and new model WITH the extracted fields already included
      // Use PropertyMetadata directly to preserve all decorator information
      const fieldsToAdd = payload.fieldsToExtract; // These are already PropertyMetadata objects

      // Create the composition with the fields included
      const { edit: compositionEdit, innerModelName } = await this.createCompositionWithFields(
        cache,
        payload.sourceModelName,
        payload.compositionFieldName,
        fieldsToAdd
      );

      // Merge composition edit
      this.mergeWorkspaceEdits(combinedEdit, compositionEdit);

      // Step 2: Remove the fields from the source model
      for (const field of payload.fieldsToExtract) {
        const deleteEdit = await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache);
        this.mergeWorkspaceEdits(combinedEdit, deleteEdit);
      }

      return combinedEdit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to prepare extract fields to composition edit: ${error}`);
      throw error;
    }
  }

  /**
   * Creates a composition relationship with the extracted fields already included in the inner model.
   */
  private async createCompositionWithFields(
    cache: MetadataCache,
    sourceModelName: string,
    compositionFieldName: string,
    fieldsToAdd: PropertyMetadata[]
  ): Promise<{ edit: vscode.WorkspaceEdit; innerModelName: string }> {
    const sourceModel = cache.getModelByName(sourceModelName);
    if (!sourceModel) {
      throw new Error(`Could not find source model '${sourceModelName}'`);
    }

    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    const edit = new vscode.WorkspaceEdit();

    // Determine inner model name and check if it should be an array
    const { innerModelName, isArray } = this.determineInnerModelInfo(compositionFieldName);

    // Step 1: Add the inner model WITH the extracted fields already included
    await this.addInnerModelWithFieldsToWorkspace(edit, document, innerModelName, sourceModelName, fieldsToAdd, cache);

    // Step 2: Add the composition field to the outer model
    await this.addCompositionFieldToWorkspace(
      edit,
      document,
      sourceModelName,
      compositionFieldName,
      innerModelName,
      isArray,
      cache
    );

    return { edit, innerModelName };
  }

  /**
   * Generates inner model code with the specified fields already included.
   */
  private generateInnerModelCodeWithFields(
    innerModelName: string,
    outerModelName: string,
    dataSource: string | undefined,
    fields: PropertyMetadata[]
  ): string {
    const lines: string[] = [];

    // Add model decorator
    if (dataSource) {
      lines.push(`@Model({`);
      lines.push(`\tdataSource: ${dataSource}`);
      lines.push(`})`);
    } else {
      lines.push(`@Model()`);
    }

    // Add class declaration
    lines.push(`class ${innerModelName} extends PersistentComponentModel<${outerModelName}> {`);
    lines.push(``);

    // Add each field using the enhanced method that preserves all decorator information
    for (const property of fields) {
      const fieldCode = this.generateFieldCodeFromPropertyMetadata(property);
      lines.push(...fieldCode.split("\n").map((line) => (line ? `\t${line}` : "")));
      lines.push(``); // Empty line between fields
    }

    lines.push(`}`);

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
   * Extracts the dataSource from a model using the cache.
   */
  private extractDataSourceFromModel(model: DecoratedClass, cache: MetadataCache): string | undefined {
    const modelDecorator = model.decorators.find((d) => d.name === "Model");
    return modelDecorator?.arguments?.[0]?.dataSource;
  }

  /**
   * Generates an enum name from a field name for Choice fields.
   */
  private generateEnumName(fieldName: string): string {
    const pascalCase = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    return pascalCase;
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
      placeHolder: "Select fields to extract to the new composition model",
      title: "Extract Fields to Composition",
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
   * Determines the inner model name and whether the field should be an array.
   */
  private determineInnerModelInfo(fieldName: string): { innerModelName: string; isArray: boolean } {
    const singularName = this.toSingular(fieldName);
    const innerModelName = this.toPascalCase(singularName);
    const isArray = fieldName !== singularName; // If we converted from plural to singular, it's an array

    return { innerModelName, isArray };
  }

  /**
   * Converts a potentially plural field name to singular using basic rules.
   */
  private toSingular(fieldName: string): string {
    if (!fieldName) {
      return "";
    }

    // Rule 1: Handle "...ies" -> "...y" (e.g., "cities" -> "city")
    if (fieldName.toLowerCase().endsWith("ies")) {
      return fieldName.slice(0, -3) + "y";
    }

    // Rule 2: Handle "...es" -> "..." (e.g., "boxes" -> "box", "wishes" -> "wish")
    if (fieldName.toLowerCase().endsWith("es")) {
      const base = fieldName.slice(0, -2);
      // Check if the base word ends in s, x, z, ch, sh
      if (["s", "x", "z"].some((char) => base.endsWith(char)) || ["ch", "sh"].some((pair) => base.endsWith(pair))) {
        return base;
      }
    }

    // Rule 3: Handle simple "...s" -> "..." (e.g., "cats" -> "cat")
    if (fieldName.toLowerCase().endsWith("s") && !fieldName.toLowerCase().endsWith("ss")) {
      return fieldName.slice(0, -1);
    }

    // If no plural pattern was found, return the original string
    return fieldName;
  }

  /**
   * Converts camelCase to PascalCase.
   */
  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Adds inner model with fields to workspace edit.
   */
  private async addInnerModelWithFieldsToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    innerModelName: string,
    outerModelName: string,
    fieldsToAdd: PropertyMetadata[],
    cache: MetadataCache
  ): Promise<void> {
    // Check if inner model already exists
    const existingModel = cache.getModelByName(innerModelName);
    if (existingModel) {
      throw new Error(`A model named '${innerModelName}' already exists in the project`);
    }

    // Get data source from outer model
    const outerModelClass = cache.getModelByName(outerModelName);
    if (!outerModelClass) {
      throw new Error(`Could not find model metadata for '${outerModelName}'`);
    }

    const dataSource = this.extractDataSourceFromModel(outerModelClass, cache);

    // Generate the inner model code with fields
    const innerModelCode = this.generateInnerModelCodeWithFields(
      innerModelName,
      outerModelName,
      dataSource,
      fieldsToAdd
    );

    // Add required imports - collect from the PropertyMetadata decorators
    const requiredImports = new Set(["Model", "Field", "PersistentComponentModel", "Composition"]);
    // Add field-specific imports based on the decorators in PropertyMetadata
    for (const property of fieldsToAdd) {
      for (const decorator of property.decorators) {
        requiredImports.add(decorator.name);
      }
    }
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

    // Find insertion point after the outer model
    const lines = document.getText().split("\n");
    let insertionLine = lines.length; // Default to end of file

    try {
      const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, outerModelName);
      insertionLine = classEndLine + 1;
    } catch (error) {
      console.warn(`Could not find model ${outerModelName}, inserting at end of file`);
    }

    // Insert the inner model with appropriate spacing
    const spacing = insertionLine < lines.length ? "\n\n" : "\n";
    edit.insert(document.uri, new vscode.Position(insertionLine, 0), `${spacing}${innerModelCode}\n`);
  }

  /**
   * Adds composition field to the outer model workspace edit.
   */
  private async addCompositionFieldToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    outerModelName: string,
    fieldName: string,
    innerModelName: string,
    isArray: boolean,
    cache: MetadataCache
  ): Promise<void> {
    // Check if composition field already exists
    const outerModelClass = cache.getModelByName(outerModelName);
    if (!outerModelClass) {
      throw new Error(`Could not find model metadata for '${outerModelName}'`);
    }

    const existingFields = Object.keys(outerModelClass.properties || {});
    if (existingFields.includes(fieldName)) {
      throw new Error(`Field '${fieldName}' already exists in model ${outerModelName}`);
    }

    // Create field info for the composition field
    const fieldType = {
      label: "Relationship",
      decorator: "Composition",
      tsType: isArray ? `${innerModelName}[]` : innerModelName,
      description: "Composition relationship",
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // Compositions are typically optional
    };

    // Generate the field code
    const fieldCode = this.generateCompositionFieldCode(fieldInfo, innerModelName, isArray);

    // Add required imports
    const requiredImports = new Set(["Field", "Composition"]);
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

    // Find class boundaries and add field
    const lines = document.getText().split("\n");
    const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, outerModelName);
    const indentation = detectIndentation(lines, 0, lines.length);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    edit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`);
  }

  /**
   * Generates the composition field code.
   */
  private generateCompositionFieldCode(fieldInfo: FieldInfo, innerModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    if (fieldInfo.required) {
      lines.push("@Field({");
      lines.push("  required: true");
      lines.push("})");
    } else {
      lines.push("@Field({})");
    }

    // Add Composition decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeAnnotation = isArray ? `${innerModelName}[]` : innerModelName;
    lines.push(`${fieldInfo.name}!: ${typeAnnotation};`);

    return lines.join("\n");
  }

  /**
   * Merges two workspace edits into one.
   */
  private mergeWorkspaceEdits(target: vscode.WorkspaceEdit, source: vscode.WorkspaceEdit): void {
    // Merge text edits
    source.entries().forEach(([uri, edits]) => {
      const existing = target.get(uri) || [];
      target.set(uri, [...existing, ...edits]);
    });

    // Merge file operations if any
    if (source.size > 0) {
      // Copy any file operations from source to target
      // This is a simplified merge - in practice you might need more sophisticated merging
    }
  }
}

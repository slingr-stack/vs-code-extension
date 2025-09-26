import * as vscode from "vscode";
import { ChangeObject, ManualRefactorContext, ExtractFieldsToCompositionPayload } from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { AddCompositionTool } from "../models/addComposition";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_REGISTRY } from "../../utils/fieldTypeRegistry";
import { detectIndentation, applyIndentation } from "../../utils/detectIndentation";
import { ExtractFieldsController } from "./extractFieldsController";
import { ModelService } from "../../services/modelService";

/**
 * Refactor tool for extracting multiple fields from a model to a new composition model.
 *
 * This tool allows users to select multiple fields and move them to a new composition
 * model, creating a composition relationship between the source and new models.
 * It provides preview functionality before applying changes.
 */
export class ExtractFieldsToCompositionTool extends ExtractFieldsController {
  private addCompositionTool: AddCompositionTool;
  private addFieldTool: AddFieldTool;
  private deleteFieldTool: DeleteFieldTool;
  private modelService: ModelService;

  constructor() {
    super();
    this.addCompositionTool = new AddCompositionTool();
    this.addFieldTool = new AddFieldTool();
    this.deleteFieldTool = new DeleteFieldTool();
    this.modelService = new ModelService();
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
   * Initiates the manual refactor by prompting user for field selection and composition name.
   */
  async initiateManualRefactor(
    context: ManualRefactorContext,
  ): Promise<ChangeObject | undefined> {
    const fieldSelection = await this.getSelectedFieldsFromContext(context, "composition");
    if (!fieldSelection) {
      return undefined;
    }

    const { sourceModel, selectedFields } = fieldSelection;

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
    let edit = new vscode.WorkspaceEdit();
    let innerModelName = "";

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
      const result = await this.createCompositionWithFields(
        cache,
        payload.sourceModelName,
        payload.compositionFieldName,
        fieldsToAdd
      );
      edit = result.edit;
      innerModelName = result.innerModelName;


      // Step 2: Remove the fields from the source model
      for (const field of payload.fieldsToExtract) {
        await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache,edit);
      }

      return edit;
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
   * Extracts the dataSource from a model using the cache.
   */
  private extractDataSourceFromModel(model: DecoratedClass, cache: MetadataCache): string | undefined {
    const modelDecorator = model.decorators.find((d) => d.name === "Model");
    return modelDecorator?.arguments?.[0]?.dataSource;
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

    // Generate class body from fields
    const classBodyLines: string[] = [];
    for (const property of fieldsToAdd) {
      const fieldCode = this.generateFieldCodeFromPropertyMetadata(property);
      classBodyLines.push(fieldCode);
      classBodyLines.push(""); // Empty line between fields
    }
    
    // Add owner field
    const ownerFieldCode = this.generateOwnerFieldCode(outerModelName);
    classBodyLines.push(ownerFieldCode);
    
    const classBody = classBodyLines.join("\n");

    // Collect required imports from PropertyMetadata decorators
    const existingImports = new Set<string>();
    for (const property of fieldsToAdd) {
      for (const decorator of property.decorators) {
        existingImports.add(decorator.name);
      }
    }
    // Add OwnerReference import for the owner field
    existingImports.add("OwnerReference");

    // Ensure required imports are added to the document
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, existingImports);

    // Generate the model content without imports (since we're adding to existing file)
    const modelContent = await this.modelService.generateModelFileContent(
      innerModelName,
      classBody,
      dataSource,
      existingImports,
      true, // isComponent = true since it's an inner model
      document.uri.fsPath,
      cache,
      undefined, // no docs
      false // includeImports = false since we're adding to existing file
    );

    // Find insertion point after the outer model
    const lines = document.getText().split("\n");
    let insertionLine = lines.length; // Default to end of file

    try {
      const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, outerModelName);
      insertionLine = classEndLine + 1;
    } catch (error) {
      console.warn(`Could not find model ${outerModelName}, inserting at end of file`);
    }

    // Add the model content at the correct position with proper spacing
    const spacing = insertionLine < lines.length ? "\n\n" : "\n";
    edit.insert(document.uri, new vscode.Position(insertionLine, 0), `\n${modelContent}\n`);
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

    // Create field info for the composition field using registry
    const compositionType = FIELD_TYPE_REGISTRY['Composition'];
    const fieldType = {
      ...compositionType,
      tsType: isArray ? `${innerModelName}[]` : innerModelName,
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // Compositions are typically optional
    };

    // Generate the field code
    const fieldCode = this.generateCompositionFieldCode(fieldInfo, innerModelName, isArray);

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
      lines.push("@Field()");
    }

    // Add Composition decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeAnnotation = isArray ? `${innerModelName}[]` : innerModelName;
    lines.push(`${fieldInfo.name}!: ${typeAnnotation};`);

    return lines.join("\n");
  }

  /**
   * Generates the TypeScript code for the owner field.
   */
  private generateOwnerFieldCode(ownerModelName: string): string {
    const lines: string[] = [];
    
    // Add Field decorator
    lines.push("@Field()");
    
    // Add OwnerReference decorator
    lines.push("@OwnerReference()");
    
    // Add property declaration
    lines.push(`owner!: ${ownerModelName};`);
    
    return lines.join("\n");
  }

}

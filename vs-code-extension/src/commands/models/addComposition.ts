import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../../cache/cache";
import { FieldInfo, FieldTypeDefinition, FIELD_TYPE_REGISTRY } from "../../utils/fieldTypeRegistry";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { ModelService } from "../../services/modelService";
import { detectIndentation, applyIndentation } from "../../utils/detectIndentation";

/**
 * Tool for adding composition relationships to existing Model classes.
 *
 */
export class AddCompositionTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private modelService: ModelService;

  constructor() {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.modelService = new ModelService();
  }

  /**
   * Adds a composition relationship to an existing model file.
   *
   * @param cache - The metadata cache for context about existing models
   * @param modelName - The name of the model to which the composition is being added
   * @returns Promise that resolves when the composition is added
   */
  public async addComposition(cache: MetadataCache, modelName: string): Promise<void> {
    try {
      // Step 1: Validate target file
      const { modelClass, document } = await this.validateAndPrepareTarget(modelName, cache);

      // Step 2: Get field name from user
      const fieldName = await this.getCompositionFieldName(modelClass);
      if (!fieldName) {
        return; // User cancelled
      }

      await this.addCompositionProgrammatically(cache, modelName, fieldName);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add composition: ${error}`);
      console.error("Error adding composition:", error);
    }
  }

  /**
   * Adds a composition relationship programmatically with a predefined field name.
   * This method is used by other tools that need to create compositions without user interaction.
   *
   * @param cache - The metadata cache for context about existing models
   * @param modelName - The name of the model to which the composition is being added
   * @param fieldName - The predefined field name for the composition
   * @returns Promise that resolves with the created inner model name when the composition is added
   */
  public async addCompositionProgrammatically(
    cache: MetadataCache,
    modelName: string,
    fieldName: string
  ): Promise<string> {
    const edit = new vscode.WorkspaceEdit();
    try {
      // Step 1: Validate target file
      const { modelClass, document } = await this.validateAndPrepareTarget(modelName, cache);

      // Step 2: Determine inner model name and array status
      const { innerModelName, isArray } = this.determineInnerModelInfo(fieldName);

      // Step 3: Check if inner model already exists
      await this.validateInnerModelName(cache, innerModelName);

      // Step 4: Create the inner model
      await this.createInnerModel(document, innerModelName, modelClass.name, cache);

      // Step 5: Add composition field to outer model
      await this.addCompositionField(document, modelClass.name, fieldName, innerModelName, isArray, cache);

      // Add required imports
      const requiredImports = new Set(["Model", "Field", "Relationship", "BaseModel", "UUID", "PrimaryKey"]);
      await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

      // Apply the edit
      await vscode.workspace.applyEdit(edit);

      // Step 6: Focus on the newly created field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 7: Show success message
      vscode.window.showInformationMessage(
        `Composition relationship created successfully! Added ${innerModelName} model and ${fieldName} field.`
      );

      return innerModelName;
    } catch (error) {
      console.error("Error adding composition programmatically:", error);
      throw error;
    }
  }

  /**
   * Creates a WorkspaceEdit for adding a composition relationship programmatically without applying it.
   * This method prepares all the necessary changes (inner model creation and composition field addition)
   * and returns them as a WorkspaceEdit that can be applied later or combined with other edits.
   *
   * @param cache - The metadata cache for context about existing models
   * @param modelName - The name of the model to which the composition is being added
   * @param fieldName - The predefined field name for the composition
   * @returns Promise that resolves to a WorkspaceEdit containing all necessary changes and the inner model name
   * @throws Error if validation fails or models already exist
   *
   */
  public async createAddCompositionWorkspaceEdit(
    cache: MetadataCache,
    modelName: string,
    fieldName: string
  ): Promise<{ edit: vscode.WorkspaceEdit; innerModelName: string }> {
    // Step 1: Validate target file
    const { modelClass, document } = await this.validateAndPrepareTarget(modelName, cache);

    // Step 2: Determine inner model name and array status
    const { innerModelName, isArray } = this.determineInnerModelInfo(fieldName);

    // Step 3: Check if inner model already exists
    await this.validateInnerModelName(cache, innerModelName);

    // Step 4: Check if composition field already exists
    const existingFields = Object.keys(modelClass.properties || {});
    if (existingFields.includes(fieldName)) {
      throw new Error(`Field '${fieldName}' already exists in model ${modelClass.name}`);
    }

    // Step 5: Create the workspace edit
    const edit = new vscode.WorkspaceEdit();

    // Step 6: Add inner model creation edit
    await this.addInnerModelEditToWorkspace(edit, document, innerModelName, modelClass.name, cache);

    // Step 7: Add composition field edit
    await this.addCompositionFieldEditToWorkspace(
      edit,
      document,
      modelClass.name,
      fieldName,
      innerModelName,
      isArray,
      cache
    );

    return { edit, innerModelName };
  }

  /**
   * Adds inner model creation edits to the provided WorkspaceEdit.
   */
  private async addInnerModelEditToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    innerModelName: string,
    outerModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    // Determine data source from outer model
    const outerModelClass = cache.getModelByName(outerModelName);
    if (!outerModelClass) {
      throw new Error(`Could not find model metadata for '${outerModelName}'`);
    }

    const outerModelDecorator = cache.getModelDecoratorByName("Model", outerModelClass);
    const dataSource = outerModelDecorator?.arguments?.[0]?.dataSource;

    // Generate the inner model code using ModelService
    const innerModelCode = await this.generateInnerModelCodeWithService(innerModelName, dataSource, document.uri.fsPath, outerModelName);

    // Add required imports
    const requiredImports = new Set(["Model", "Field", "Relationship", "BaseModel", "OwnerReference"]);
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

    // Find insertion point after the outer model
    const lines = document.getText().split("\n");
    let insertionLine = lines.length; // Default to end of file

    try {
      const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, outerModelName);
      insertionLine = classEndLine + 1;
    } catch (error) {
      // If we can't find the specified model, fall back to end of file
      console.warn(`Could not find model ${outerModelName}, inserting at end of file`);
    }

    // Insert the inner model with appropriate spacing
    const spacing = insertionLine < lines.length ? "\n\n" : "\n";
    edit.insert(document.uri, new vscode.Position(insertionLine, 0), `${spacing}${innerModelCode}\n`);
  }

  /**
   * Adds composition field creation edits to the provided WorkspaceEdit.
   */
  private async addCompositionFieldEditToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    outerModelName: string,
    fieldName: string,
    innerModelName: string,
    isArray: boolean,
    cache: MetadataCache
  ): Promise<void> {
    // Create field info for the composition field using registry
    const compositionType = FIELD_TYPE_REGISTRY['Composition'];
    const fieldType: FieldTypeDefinition = {
      ...compositionType,
      tsType: isArray ? `${innerModelName}[]` : innerModelName,
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // Compositions are typically optional
      additionalConfig: {
        relationshipType: "composition",
        targetModel: innerModelName,
        targetModelPath: document.uri.fsPath,
      },
    };

    // Generate the field code
    const fieldCode = this.generateCompositionFieldCode(fieldInfo, innerModelName, isArray);

    // Add field insertion edits using the source code service approach
    const lines = document.getText().split("\n");
    //const requiredImports = new Set(["Field", "Composition", "BaseModel"]);

    // Add imports
    //await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

    // Find class boundaries and add field
    const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, outerModelName);
    const indentation = detectIndentation(lines, 0, lines.length);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    edit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`);
  }

  /**
   * Validates the target file and prepares it for composition addition.
   */
  private async validateAndPrepareTarget(
    modelName: string,
    cache: MetadataCache
  ): Promise<{ modelClass: DecoratedClass; document: vscode.TextDocument }> {
    // Get model information from cache
    const modelClass = cache.getModelByName(modelName);
    if (!modelClass) {
      throw new Error(`Model '${modelName}' not found in the project`);
    }

    const document = await vscode.workspace.openTextDocument(modelClass.declaration.uri);
    if (!document) {
      throw new Error(`Could not open document for model '${modelName}'`);
    }

    return { modelClass, document };
  }

  /**
   * Gets the composition field name from the user.
   */
  private async getCompositionFieldName(modelClass: DecoratedClass): Promise<string | null> {
    const fieldName = await vscode.window.showInputBox({
      prompt: "Enter the composition field name (camelCase)",
      placeHolder: "e.g., addresses, phoneNumbers, tasks",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Field name is required";
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
          return "Field name must be in camelCase (e.g., addresses, phoneNumbers)";
        }

        // Check if field already exists in the model
        const existingFields = Object.keys(modelClass.properties || {});
        if (existingFields.includes(value.trim())) {
          return `Field '${value.trim()}' already exists in this model`;
        }

        return null;
      },
    });

    return fieldName?.trim() || null;
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
   * @param fieldName The plural string to convert.
   * @returns The singular form of the string.
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
    // This is more specific than a simple "s", so it should be checked first.
    if (fieldName.toLowerCase().endsWith("es")) {
      const base = fieldName.slice(0, -2);
      // Check if the base word ends in s, x, z, ch, sh
      if (["s", "x", "z"].some((char) => base.endsWith(char)) || ["ch", "sh"].some((pair) => base.endsWith(pair))) {
        return base;
      }
    }

    // Rule 3: Handle simple "...s" -> "..." (e.g., "cats" -> "cat")
    // Avoids changing words that end in "ss" (e.g., "address")
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
   * Validates that the inner model name doesn't already exist.
   */
  private async validateInnerModelName(cache: MetadataCache, innerModelName: string): Promise<void> {
    const existingModel = cache.getModelByName(innerModelName);
    if (existingModel) {
      throw new Error(`A model named '${innerModelName}' already exists in the project`);
    }
  }

  /**
   * Creates the inner model in the same file.
   */
  private async createInnerModel(
    document: vscode.TextDocument,
    innerModelName: string,
    outerModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    // Determine data source from outer model
    const outerModelClass = cache.getModelByName(outerModelName);
    if (!outerModelClass) {
      throw new Error(`Could not find model metadata for '${outerModelName}'`);
    }

    const outerModelDecorator = cache.getModelDecoratorByName("Model", outerModelClass);
    const dataSource = outerModelDecorator?.arguments?.[0]?.dataSource;

    // Generate the inner model code using ModelService
    const innerModelCode = await this.generateInnerModelCodeWithService(innerModelName, dataSource, document.uri.fsPath, outerModelName);

    // Use the new insertModel method to insert after the outer model
    await this.sourceCodeService.insertModel(
      document,
      innerModelCode,
      outerModelName, // Insert after the outer model
      new Set(["Model", "Field", "Relationship", "UUID", "OwnerReference"]) // Ensure required decorators are imported
    );
  }

  /**
   * Generates the TypeScript code for the inner model using ModelService.
   */
  private async generateInnerModelCodeWithService(
    innerModelName: string, 
    dataSource: string | undefined, 
    targetFilePath: string,
    outerModelName: string
  ): Promise<string> {
    // Generate owner field code
    const ownerFieldCode = this.generateOwnerFieldCode(outerModelName);
    
    // Use ModelService to generate the complete model content
    // Inner models are components (not exported) and need the default ID field
    return await this.modelService.generateModelFileContent(
      innerModelName,
      ownerFieldCode, // include owner field in the class body
      dataSource,
      new Set(["OwnerReference"]), // add OwnerReference to imports
      true, // isComponent = true since it's an inner model
      targetFilePath,
      undefined, // no cache needed
      undefined, // no docs
      false, // includeImports = false since we're adding to existing file
      true // includeDefaultId = true for inner models
    );
  }

  /**
   * Adds the composition field to the outer model.
   */
  private async addCompositionField(
    document: vscode.TextDocument,
    outerModelName: string,
    fieldName: string,
    innerModelName: string,
    isArray: boolean,
    cache: MetadataCache
  ): Promise<void> {
    // Create field info for the composition field using registry
    const compositionType = FIELD_TYPE_REGISTRY['Composition'];
    const fieldType: FieldTypeDefinition = {
      ...compositionType,
      tsType: isArray ? `${innerModelName}[]` : innerModelName,
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // Compositions are typically optional
      additionalConfig: {
        relationshipType: "composition",
        targetModel: innerModelName,
        targetModelPath: document.uri.fsPath,
      },
    };

    // Generate the field code
    const fieldCode = this.generateCompositionFieldCode(fieldInfo, innerModelName, isArray);

    // Insert the field
    await this.sourceCodeService.insertField(document, outerModelName, fieldInfo, fieldCode, cache, false);
  }

  /**
   * Generates the TypeScript code for the composition field.
   */
  private generateCompositionFieldCode(fieldInfo: FieldInfo, innerModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field()");

    // Add Relationship decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeDeclaration = isArray ? `${innerModelName}[]` : innerModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }

  /**
   * Generates the TypeScript code for the owner field.
   */
  private generateOwnerFieldCode(ownerModelName: string): string {
    const lines: string[] = [];
    
    // Add Field decorator
    lines.push("@Field({})");
    
    // Add OwnerReference decorator
    lines.push("@OwnerReference()");
    
    // Add property declaration
    lines.push(`owner!: ${ownerModelName};`);
    
    return lines.join("\n");
  }
}

import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { DefineFieldsTool } from "../fields/defineFields";
import { AIEnhancedTool, FIELD_TYPE_OPTIONS, FieldTypeOption, FieldInfo } from "../interfaces";
import { detectIndentation, applyIndentation } from "../../utils/detectIndentation";
import { AIService } from "../../services/aiService";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";

/**
 * Tool for adding new fields to existing Model classes.
 *
 * This tool provides both manual field creation and AI-enhanced field generation.
 * It analyzes the target model, gathers user input, creates the basic field structure,
 * and optionally enhances it with AI assistance based on user descriptions.
 *
 * @example
 * ```typescript
 * // Manual field addition:
 * @Field()
 * @Text()
 * title: string;
 *
 * // AI-enhanced with description "user's full name with validation":
 * @Field({
 *     required: true
 * })
 * @Text({
 *     maxLength: 100
 * })
 * fullName: string;
 * ```
 */
export class AddFieldTool implements AIEnhancedTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private defineFieldsTool: DefineFieldsTool;

  constructor() {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.defineFieldsTool = new DefineFieldsTool();
  }

  /**
   * Processes user input with AI enhancement for field addition.
   * This method is used when AI assistance is requested for adding a field.
   * @param userInput - Description of the field to create
   * @param targetUri - Target model file for the new field
   * @param cache - Metadata cache instance
   * @param additionalContext - Additional context for field creation
   */
  async processWithAI(
    userInput: string,
    targetUri: vscode.Uri,
    modelName: string,
    cache: MetadataCache,
    additionalContext?: any
  ): Promise<void> {
    // The current addField method handles user interaction internally,
    // so we just call it with the provided parameters
    await this.addField(targetUri, modelName, cache);
  }

  /**
   * Adds a new field to an existing model file.
   *
   * @param targetUri - The URI of the model file where the field should be added
   * @param modelName - The name of the model class to which the field will be added
   * @param cache - The metadata cache for context about existing models (optional)
   * @returns Promise that resolves when the field is added
   */
  public async addField(targetUri: vscode.Uri, modelName: string, cache?: MetadataCache): Promise<void> {
    try {
      // Step 1: Validate target file
      const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, modelName, cache);

      if (!modelClass) {
        throw new Error("No model class found in this file. Make sure the class has a @Model decorator.");
      }

      // Step 2: Get field information from user
      const fieldInfo = await this.gatherFieldInformation(modelClass, cache);
      if (!fieldInfo) {
        return; // User cancelled
      }

      // Step 3: Get optional AI description
      const aiDescription = await this.getAIDescription();

      // Step 4: Generate basic field structure
      const fieldCode = this.generateFieldCode(fieldInfo);

      // Step 5: Insert field into model class
      await this.sourceCodeService.insertField(document, modelClass.name, fieldInfo, fieldCode, cache);

      // Step 5.5: If it's a Choice field, also create the enum
      if (fieldInfo.type.decorator === "Choice") {
        await this.insertEnumForChoiceField(document, fieldInfo);
      } // Step 6: Apply AI enhancement if description was provided
      if (aiDescription?.trim() && cache) {
        try {
          // Give the cache a moment to process the new field
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Create a specific prompt for the newly added field
          const enhancementPrompt = this.createFieldEnhancementPrompt(fieldInfo, aiDescription.trim(), modelClass.name);

          await this.defineFieldsTool.processFieldDescriptions(enhancementPrompt, targetUri, cache, modelClass.name);
        } catch (aiError) {
          console.warn("Failed to apply AI enhancement:", aiError);
          vscode.window.showWarningMessage(
            `Field added successfully, but AI enhancement failed: ${aiError}. You can manually enhance the field later.`
          );
        }
      }

      // Step 7: Show success message
      const successMessage =
        aiDescription?.trim() && cache
          ? `Field ${fieldInfo.name} added and enhanced successfully!`
          : `Field ${fieldInfo.name} added successfully!`;
      vscode.window.showInformationMessage(successMessage);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add field: ${error}`);
      console.error("Error adding field:", error);
    }
  }

  /**
   * Adds a field with predefined information (programmatic field addition).
   * This method bypasses user input and directly adds the field with the provided configuration.
   *
   * @param targetUri - The URI of the model file where the field should be added
   * @param fieldInfo - Predefined field information
   * @param modelName - The name of the model class to which the field will be added
   * @param cache - The metadata cache for context about existing models
   * @param silent - If true, suppresses success/error messages (defaults to false)
   * @returns Promise that resolves when the field is added
   */
  public async addFieldProgrammatically(
    targetUri: vscode.Uri,
    fieldInfo: FieldInfo,
    modelName: string,
    cache: MetadataCache,
    silent: boolean = false
  ): Promise<void> {
    try {
      // Step 1: Validate target file
      const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, modelName, cache);

      // Step 2: Check if field already exists
      if (modelClass) {
        const existingFields = Object.keys(modelClass.properties || {});
        if (existingFields.includes(fieldInfo.name)) {
          const message = `Field '${fieldInfo.name}' already exists in model ${modelClass.name}`;
          if (!silent) {
            vscode.window.showWarningMessage(message);
          }
          return;
        }
      }

      // Step 3: Generate basic field structure
      const fieldCode = this.generateFieldCode(fieldInfo);

      // Step 4: Insert field into model class
      await this.sourceCodeService.insertField(document, modelName, fieldInfo, fieldCode, cache);

      // Step 5: If it's a Choice field, also create the enum
      if (fieldInfo.type.decorator === "Choice") {
        await this.insertEnumForChoiceField(document, fieldInfo);
      }

      // Step 6: Show success message (if not silent)
      if (!silent) {
        vscode.window.showInformationMessage(`Field ${fieldInfo.name} added successfully!`);
      }
    } catch (error) {
      const message = `Failed to add field: ${error}`;
      if (!silent) {
        vscode.window.showErrorMessage(message);
      }
      console.error("Error adding field programmatically:", error);
      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Creates a WorkspaceEdit for adding a field programmatically without applying it.
   * This method prepares all the necessary changes (field insertion, imports, enums) 
   * and returns them as a WorkspaceEdit that can be applied later or combined with other edits.
   *
   * @param targetUri - The URI of the model file where the field should be added
   * @param fieldInfo - Predefined field information
   * @param modelName - The name of the model class to which the field will be added
   * @param cache - The metadata cache for context about existing models
   * @param enumValues - For Choice fields, the enum values to use (if not provided, default values will be used)
   * @returns Promise that resolves to a WorkspaceEdit containing all necessary changes
   * @throws Error if validation fails or field already exists
   * 
   */
  public async createAddFieldWorkspaceEdit(
    targetUri: vscode.Uri,
    fieldInfo: FieldInfo,
    modelName: string,
    cache: MetadataCache,
    enumValues?: string[]
  ): Promise<vscode.WorkspaceEdit> {
    // Step 1: Validate target file
    const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, modelName, cache);

    // Step 2: Check if field already exists
    if (modelClass) {
      const existingFields = Object.keys(modelClass.properties || {});
      if (existingFields.includes(fieldInfo.name)) {
        throw new Error(`Field '${fieldInfo.name}' already exists in model ${modelClass.name}`);
      }
    }

    // Step 3: Generate basic field structure
    const fieldCode = this.generateFieldCode(fieldInfo);

    // Step 4: Create the workspace edit
    const edit = new vscode.WorkspaceEdit();

    // Step 5: Add field insertion edit (delegate to source code service but intercept the edit)
    await this.addFieldEditToWorkspace(edit, document, modelName, fieldInfo, fieldCode, cache);

    // Step 6: If it's a Choice field, also add enum creation edit
    if (fieldInfo.type.decorator === "Choice") {
      await this.addEnumEditToWorkspace(edit, document, fieldInfo, enumValues);
    }

    return edit;
  }

  /**
   * Adds field insertion edits to the provided WorkspaceEdit.
   * This mirrors the logic from sourceCodeService.insertField but adds to the edit instead of applying.
   */
  private async addFieldEditToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    modelClassName: string,
    fieldInfo: FieldInfo,
    fieldCode: string,
    cache?: MetadataCache
  ): Promise<void> {
    const lines = document.getText().split("\n");
    const newImports = new Set<string>(["Field", fieldInfo.type.decorator]);

    // Add imports using source code service logic (we need to call a helper method)
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, newImports);

    // Add model import if needed
    if (fieldInfo.additionalConfig?.targetModel) {
      await this.sourceCodeService.addModelImport(document, fieldInfo.additionalConfig.targetModel, edit, cache);
    }

    // Find class boundaries and add field
    const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, modelClassName);
    const indentation = detectIndentation(lines, 0, lines.length);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    edit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`);
  }

  /**
   * Adds enum creation edits to the provided WorkspaceEdit for Choice fields.
   */
  private async addEnumEditToWorkspace(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    fieldInfo: FieldInfo,
    enumValues?: string[]
  ): Promise<void> {
    const enumName = this.generateEnumName(fieldInfo.name);

    // Use provided enum values or generate default ones
    let values = enumValues;
    if (!values || values.length === 0) {
      values = this.generateDefaultEnumValues(fieldInfo.name);
    }

    // Normalize the values
    const normalizedValues = values.map(value => this.normalizeEnumValue(value));

    // Generate enum code
    const enumCode = this.generateEnumCode(enumName, normalizedValues);

    // Find insertion point at the end of the file
    const content = document.getText();
    const lines = content.split("\n");

    let insertionLine = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        insertionLine = i + 1;
        break;
      }
    }

    const insertPosition = new vscode.Position(insertionLine, 0);
    const codeToInsert = "\n" + enumCode + "\n";

    edit.insert(document.uri, insertPosition, codeToInsert);
  }

  /**
   * Generates default enum values for a Choice field when none are provided.
   */
  private generateDefaultEnumValues(fieldName: string): string[] {
    const fieldLower = fieldName.toLowerCase();

    // Generate context-appropriate default values
    if (fieldLower.includes("status")) {
      return ["Active", "Inactive", "Pending"];
    }
    if (fieldLower.includes("type")) {
      return ["TypeA", "TypeB", "TypeC"];
    }
    if (fieldLower.includes("category")) {
      return ["General", "Important", "Urgent"];
    }
    if (fieldLower.includes("state")) {
      return ["Open", "InProgress", "Closed"];
    }
    if (fieldLower.includes("priority")) {
      return ["Low", "Medium", "High"];
    }
    if (fieldLower.includes("level")) {
      return ["Basic", "Intermediate", "Advanced"];
    }

    // Default generic values
    return ["Option1", "Option2", "Option3"];
  }

  /**
   * Validates the target file and prepares it for field addition.
   */
  private async validateAndPrepareTarget(
    targetUri: vscode.Uri,
    modelName: string,
    cache?: MetadataCache
  ): Promise<{ modelClass: DecoratedClass | null; document: vscode.TextDocument }> {
    // Ensure the file is a TypeScript file
    if (!targetUri.fsPath.endsWith(".ts")) {
      throw new Error("Target file must be a TypeScript file (.ts)");
    }

    // Open the document
    const document = await vscode.workspace.openTextDocument(targetUri);

    // Get model information from cache
    if (!cache) {
      throw new Error("Metadata cache is required for field addition");
    }

    const modelClass = cache.getModelByName(modelName);

    return { modelClass, document };
  }

  /**
   * Gathers field information from the user through interactive prompts.
   */
  private async gatherFieldInformation(modelClass: DecoratedClass, cache?: MetadataCache): Promise<FieldInfo | null> {
    // Step 1: Get field name
    const fieldName = await vscode.window.showInputBox({
      prompt: "Enter the field name (camelCase)",
      placeHolder: "e.g., userName, projectTitle, isActive",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Field name is required";
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
          return "Field name must be in camelCase (e.g., userName, projectTitle)";
        }

        // Check if field already exists in the model
        const existingFields = Object.keys(modelClass.properties || {});
        if (existingFields.includes(value.trim())) {
          return `Field '${value.trim()}' already exists in this model`;
        }

        return null;
      },
    });

    if (!fieldName) {
      return null; // User cancelled
    }

    // Step 2: Get field type
    const fieldType = await this.selectFieldType();
    if (!fieldType) {
      return null; // User cancelled
    }

    // Step 3: Get required status
    const isRequired = await this.getRequiredStatus();
    if (isRequired === undefined) {
      return null; // User cancelled
    }

    // Step 4: Handle special field types
    let additionalConfig: Record<string, any> = {};

    if (fieldType.decorator === "Relationship") {
      const relationshipConfig = await this.getRelationshipConfiguration(cache);
      if (!relationshipConfig) {
        return null; // User cancelled
      }
      additionalConfig = relationshipConfig;
    }

    return {
      name: fieldName.trim(),
      type: fieldType,
      required: isRequired,
      additionalConfig: additionalConfig,
    };
  }

  /**
   * Shows a quick pick for field type selection.
   */
  private async selectFieldType(): Promise<FieldTypeOption | null> {
    const items = FIELD_TYPE_OPTIONS.map((option) => ({
      label: option.label,
      description: option.description,
      detail: `@${option.decorator}() : ${option.tsType}`,
      option: option,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select the field type",
      matchOnDescription: true,
      matchOnDetail: true,
    });

    return selected?.option || null;
  }

  /**
   * Gets the required status from the user.
   */
  private async getRequiredStatus(): Promise<boolean | undefined> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Required", description: "Field must have a value", value: true },
        { label: "Optional", description: "Field can be empty", value: false },
      ],
      {
        placeHolder: "Is this field required?",
      }
    );

    return choice?.value;
  }

  /**
   * Gets optional AI description for field enhancement.
   */
  private async getAIDescription(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: "Enter a description for AI enhancement (optional - press Enter to skip)",
      placeHolder: "e.g., user's full name with validation, email with domain restrictions",
    });
  }

  /**
   * Gets relationship configuration for Relationship fields.
   */
  private async getRelationshipConfiguration(cache?: MetadataCache): Promise<Record<string, any> | null> {
    // Step 1: Get available models
    const availableModels = this.getAvailableModels(cache);
    if (availableModels.length === 0) {
      vscode.window.showWarningMessage(
        "No models found for relationship. Make sure you have other model classes defined."
      );
      return null;
    }

    // Step 2: Let user select target model
    const targetModel = await vscode.window.showQuickPick(
      availableModels.map((model) => ({
        label: model,
        description: `Reference to ${model} model`,
      })),
      {
        placeHolder: "Select the target model for this relationship",
      }
    );

    if (!targetModel) {
      return null; // User cancelled
    }

    // Step 3: Let user select relationship type
    const relationshipType = await vscode.window.showQuickPick(
      [
        {
          label: "Reference",
          description: "Reference relationship - points to another entity",
          value: "reference",
        },
        {
          label: "Composition",
          description: "Composition relationship - contains/owns another entity",
          value: "composition",
        },
      ],
      {
        placeHolder: "Select the relationship type",
      }
    );

    if (!relationshipType) {
      return null; // User cancelled
    }

    return {
      targetModel: targetModel.label,
      relationshipType: relationshipType.value,
    };
  }
  /**
   * Gets available models from the cache.
   */
  private getAvailableModels(cache?: MetadataCache): string[] {
    if (!cache) {
      return [];
    }

    const dataModels = cache.getDataModelClasses();
    return dataModels.map((model) => model.name).sort();
  }

  /**
   * Generates the TypeScript code for the field.
   */
  private generateFieldCode(fieldInfo: FieldInfo): string {
    const lines: string[] = [];

    // Add Field decorator (without indentation - will be applied later)
    if (fieldInfo.required) {
      lines.push("@Field({");
      lines.push("  required: true");
      lines.push("})");
    } else {
      lines.push("@Field()");
    }

    // Add type-specific decorator
    if (fieldInfo.type.decorator === "Relationship" && fieldInfo.additionalConfig?.relationshipType) {
      lines.push(`@${fieldInfo.type.decorator}({`);
      lines.push(`  type: '${fieldInfo.additionalConfig.relationshipType}'`);
      lines.push(`})`);
    } else {
      lines.push(`@${fieldInfo.type.decorator}()`);
    }

    // Add property declaration
    // For Choice fields, use enum type instead of string
    if (fieldInfo.type.decorator === "Choice") {
      const enumName = this.generateEnumName(fieldInfo.name);
      lines.push(`${fieldInfo.name}!: ${enumName};`);
    } else if (fieldInfo.type.decorator === "Relationship") {
      // For Relationship fields, use the target model type
      const targetModel = fieldInfo.additionalConfig?.targetModel || "any";
      // Check if it's a composition relationship to determine if it should be an array
      const isComposition = fieldInfo.additionalConfig?.relationshipType === "composition";
      const typeDeclaration = isComposition ? `${targetModel}[]` : targetModel;
      lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);
    } else {
      lines.push(`${fieldInfo.name}!: ${fieldInfo.type.tsType};`);
    }

    return lines.join("\n");
  }

  /**
   * Generates an enum name from a field name.
   * Converts camelCase field name to PascalCase enum name.
   */
  private generateEnumName(fieldName: string): string {
    // Convert camelCase to PascalCase and add appropriate suffix
    const pascalCase = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

    // Add descriptive suffix based on common patterns
    const fieldLower = fieldName.toLowerCase();

    if (fieldLower.includes("status")) {
      return pascalCase.replace(/status/i, "Status");
    }
    if (fieldLower.includes("type")) {
      return pascalCase.replace(/type/i, "Type");
    }
    if (fieldLower.includes("category")) {
      return pascalCase.replace(/category/i, "Category");
    }
    if (fieldLower.includes("state")) {
      return pascalCase.replace(/state/i, "State");
    }
    if (fieldLower.includes("mode")) {
      return pascalCase.replace(/mode/i, "Mode");
    }
    if (fieldLower.includes("level")) {
      return pascalCase.replace(/level/i, "Level");
    }

    // Default: add "Type" suffix if no pattern matches
    return pascalCase + "Type";
  }

  /**
   * Creates and inserts an enum definition for a Choice field at the end of the file.
   */
  private async insertEnumForChoiceField(document: vscode.TextDocument, fieldInfo: FieldInfo): Promise<void> {
    const enumName = this.generateEnumName(fieldInfo.name);

    // Ask user for enum values
    const enumValues = await this.getEnumValues(fieldInfo.name, enumName);
    if (!enumValues || enumValues.length === 0) {
      return; // User cancelled or provided no values
    }

    // Generate enum code
    const enumCode = this.generateEnumCode(enumName, enumValues);

    // Insert enum at the end of the file
    const content = document.getText();
    const lines = content.split("\n");

    // Find the last non-empty line
    let insertionLine = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        insertionLine = i + 1;
        break;
      }
    }

    const edit = new vscode.WorkspaceEdit();
    const insertPosition = new vscode.Position(insertionLine, 0);

    // Add spacing before enum
    const codeToInsert = "\n" + enumCode + "\n";

    edit.insert(document.uri, insertPosition, codeToInsert);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  }

  /**
   * Prompts user for enum values.
   */
  private async getEnumValues(fieldName: string, enumName: string): Promise<string[] | null> {
    const enumValuesInput = await vscode.window.showInputBox({
      prompt: `Enter enum values for ${enumName} (comma-separated)`,
      placeHolder: "e.g. in-progress, completed",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "At least one enum value is required";
        }
        return null;
      },
    });

    if (!enumValuesInput) {
      return null;
    }

    // Parse and clean up the values
    return enumValuesInput
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => this.normalizeEnumValue(value));
  }

  /**
   * Normalizes an enum value to follow PascalCase conventions.
   */
  private normalizeEnumValue(value: string): string {
    // If it's already in PascalCase, return as is
    if (/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
      return value;
    }

    // Convert to PascalCase
    return value
      .replace(/[-_\s]+/g, " ") // Replace hyphens, underscores, and spaces with spaces
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Generates the enum code.
   */
  private generateEnumCode(enumName: string, values: string[]): string {
    const lines: string[] = [];

    lines.push(`export enum ${enumName} {`);

    values.forEach((value, index) => {
      const isLast = index === values.length - 1;
      // Use PascalCase for enum key, kebab-case for string value
      const kebabValue = value.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      const enumEntry = `  ${value} = '${kebabValue}'${isLast ? "" : ","}`;
      lines.push(enumEntry);
    });

    lines.push("}");

    return lines.join("\n");
  }

  /**
   * Creates a specific prompt for enhancing the newly added field.
   */
  private createFieldEnhancementPrompt(fieldInfo: FieldInfo, description: string, modelName: string): string {
    return (
      `Enhance the field '${fieldInfo.name}' of type ${fieldInfo.type.label} in model ${modelName}. ` +
      `Current field structure: @Field(${fieldInfo.required ? "{required: true}" : ""}) @${
        fieldInfo.type.decorator
      }() ${fieldInfo.name}: ${fieldInfo.type.tsType}. ` +
      `Enhancement description: ${description}`
    );
  }
}

import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../../cache/cache";
import { AIEnhancedTool, FieldInfo, FieldTypeOption } from "../interfaces";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { ExplorerProvider } from "../../explorer/explorerProvider";

/**
 * Tool for adding composition relationships to existing Model classes.
 *
 */
export class AddCompositionTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private explorerProvider: ExplorerProvider;

  constructor(explorerProvider: ExplorerProvider) {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.explorerProvider = explorerProvider;
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

      // Step 3: Determine inner model name and array status
      const { innerModelName, isArray } = this.determineInnerModelInfo(fieldName);

      // Step 4: Check if inner model already exists
      await this.validateInnerModelName(cache, innerModelName);

      // Step 5: Create the inner model
      await this.createInnerModel(document, innerModelName, modelClass.name, cache);

      // Step 6: Add composition field to outer model
      await this.addCompositionField(document, modelClass.name, fieldName, innerModelName, isArray, cache);

      // Step 7: Focus on the newly created field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 8: Show success message
      vscode.window.showInformationMessage(
        `Composition relationship created successfully! Added ${innerModelName} model and ${fieldName} field.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add composition: ${error}`);
      console.error("Error adding composition:", error);
    }
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

    // Generate the inner model code
    const innerModelCode = this.generateInnerModelCode(innerModelName, outerModelName, dataSource);

    // Use the new insertModel method to insert after the outer model
    await this.sourceCodeService.insertModel(
      document,
      innerModelCode,
      outerModelName, // Insert after the outer model
      new Set(["Model", "Field", "Relationship"]) // Ensure required decorators are imported
    );
  }

  /**
   * Generates the TypeScript code for the inner model.
   */
  private generateInnerModelCode(innerModelName: string, outerModelName: string, dataSource: string): string {
    const lines: string[] = [];

    if (dataSource) {
      lines.push(`@Model({`);
      lines.push(`\tdataSource: ${dataSource}`);
    } else {
      lines.push(`@Model()`);
    }
    lines.push(`})`);
    lines.push(`class ${innerModelName} extends PersistentComponentModel<${outerModelName}> {`);
    lines.push(``);
    lines.push(`}`);

    return lines.join("\n");
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
    // Create field info for the composition field
    const fieldType: FieldTypeOption = {
      label: "Relationship",
      decorator: "Composition",
      tsType: isArray ? `${innerModelName}[]` : innerModelName,
      description: "Composition relationship",
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
    lines.push("@Field({})");

    // Add Relationship decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeDeclaration = isArray ? `${innerModelName}[]` : innerModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }


}

import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../../cache/cache";
import { FieldInfo, FieldTypeDefinition, FIELD_TYPE_REGISTRY } from "../../utils/fieldTypeRegistry";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { ModelService } from "../../services/modelService";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import * as path from "path";

/**
 * Tool for adding reference relationships to existing Model classes.
 * 
 * Allows users to create references to either existing models or new models.
 * When referencing a new model, it creates the model in a new file with the same datasource.
 */
export class AddReferenceTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private modelService: ModelService;
  private explorerProvider: ExplorerProvider;

  constructor(explorerProvider: ExplorerProvider) {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.modelService = new ModelService();
    this.explorerProvider = explorerProvider;
  }

  /**
   * Adds a reference relationship to an existing model file.
   *
   * @param cache - The metadata cache for context about existing models
   * @param modelName - The name of the model to which the reference is being added
   * @returns Promise that resolves when the reference is added
   */
  public async addReference(cache: MetadataCache, modelName: string): Promise<void> {
    try {
      // Step 1: Validate target file
      const { modelClass, document } = await this.validateAndPrepareTarget(modelName, cache);

      // Step 2: Get field name from user
      const fieldName = await this.getReferenceFieldName(modelClass);
      if (!fieldName) {
        return; // User cancelled
      }

      // Step 3: Ask if reference is to existing or new model
      const referenceType = await this.askReferenceType();
      if (!referenceType) {
        return; // User cancelled
      }

      let targetModelName: string;
      let targetModelPath: string;

      if (referenceType === 'existing') {
        // Step 4a: Let user pick existing model on same datasource
        const selectedModel = await this.selectExistingModel(modelClass, cache, fieldName);
        if (!selectedModel) {
          return; // User cancelled
        }
        targetModelName = selectedModel.name;
        targetModelPath = selectedModel.declaration.uri.fsPath;
      } else {
        // Step 4b: Create new model
        const newModelInfo = await this.createNewReferencedModel(modelClass, fieldName, cache);
        if (!newModelInfo) {
          return; // User cancelled or failed
        }
        targetModelName = newModelInfo.name;
        targetModelPath = newModelInfo.path;
      }

      // Step 5: Add reference field to source model
      await this.addReferenceField(document, modelClass.name, fieldName, targetModelName, targetModelPath, cache);

      // Step 6: Focus on the newly created field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 7: Show success message
      vscode.window.showInformationMessage(
        `Reference relationship created successfully! Added ${fieldName} field referencing ${targetModelName}.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add reference: ${error}`);
      console.error("Error adding reference:", error);
    }
  }

  /**
   * Validates the target file and prepares it for reference addition.
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
   * Gets the reference field name from the user.
   */
  private async getReferenceFieldName(modelClass: DecoratedClass): Promise<string | null> {
    const fieldName = await vscode.window.showInputBox({
      prompt: "Enter the reference field name (camelCase)",
      placeHolder: "e.g., user, category, parentTask",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Field name is required";
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
          return "Field name must be in camelCase (e.g., user, category, parentTask)";
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
   * Asks the user whether they want to reference an existing model or create a new one.
   */
  private async askReferenceType(): Promise<'existing' | 'new' | null> {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: "Reference existing model",
          description: "Select from existing models in the same datasource",
          value: 'existing'
        },
        {
          label: "Create new model",
          description: "Create a new model file and reference it",
          value: 'new'
        }
      ],
      {
        placeHolder: "Do you want to reference an existing model or create a new one?",
        matchOnDescription: true
      }
    );

    return choice?.value as 'existing' | 'new' | null;
  }

  /**
   * Lets the user select an existing model from the same datasource.
   */
  private async selectExistingModel(
    sourceModel: DecoratedClass, 
    cache: MetadataCache, 
    fieldName: string
  ): Promise<DecoratedClass | null> {
    // Get all models with the same datasource
    const sameDataSourceModels = cache.getModelsByDataSource(sourceModel);

    if (sameDataSourceModels.length === 0) {
      vscode.window.showWarningMessage(
        `No other models found with the same datasource as ${sourceModel.name}. Consider creating a new model instead.`
      );
      return null;
    }

    // Create suggestions based on field name
    const suggestions = this.generateSuggestions(fieldName, sameDataSourceModels);

    // Create quick pick items
    const quickPickItems = sameDataSourceModels.map(model => ({
      label: model.name,
      description: this.getModelDescription(model, cache),
      detail: suggestions.includes(model.name) ? "⭐ Suggested based on field name" : undefined,
      model: model
    })).sort((a, b) => {
      // Sort suggestions first
      const aIsSuggested = suggestions.includes(a.model.name);
      const bIsSuggested = suggestions.includes(b.model.name);
      
      if (aIsSuggested && !bIsSuggested) {
        return -1;
      }
      if (!aIsSuggested && bIsSuggested) {
        return 1;
      }
      
      // Then alphabetically
      return a.label.localeCompare(b.label);
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: `Select the model to reference from field '${fieldName}'`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selected?.model || null;
  }

  /**
   * Generates model name suggestions based on the field name.
   */
  private generateSuggestions(fieldName: string, availableModels: DecoratedClass[]): string[] {
    const suggestions: string[] = [];
    const fieldLower = fieldName.toLowerCase();
    
    // Direct match (e.g., "user" -> "User")
    const directMatch = this.toPascalCase(fieldName);
    if (availableModels.some(m => m.name === directMatch)) {
      suggestions.push(directMatch);
    }

    // Partial matches (e.g., "parentTask" -> "Task")
    availableModels.forEach(model => {
      const modelLower = model.name.toLowerCase();
      if (fieldLower.includes(modelLower) || modelLower.includes(fieldLower)) {
        if (!suggestions.includes(model.name)) {
          suggestions.push(model.name);
        }
      }
    });

    return suggestions;
  }

  /**
   * Gets a description for a model based on its properties or decorators.
   */
  private getModelDescription(model: DecoratedClass, cache: MetadataCache): string {
    const modelDecorator = cache.getModelDecoratorByName("Model", model);
    const dataSource = modelDecorator?.arguments?.[0]?.dataSource || "default";
    const fieldCount = Object.keys(model.properties || {}).length;
    
    return `${fieldCount} fields • datasource: ${dataSource}`;
  }

  /**
   * Creates a new model to be referenced.
   */
  private async createNewReferencedModel(
    sourceModel: DecoratedClass,
    fieldName: string,
    cache: MetadataCache
  ): Promise<{ name: string; path: string } | null> {
    // Suggest model name based on field name
    const suggestedName = this.toPascalCase(fieldName);
    
    const modelName = await vscode.window.showInputBox({
      prompt: "Enter the name for the new model",
      value: suggestedName,
      placeHolder: "e.g., User, Category, Task",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Model name is required";
        }
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(value.trim())) {
          return "Model name must be in PascalCase (e.g., User, Category, Task)";
        }
        
        // Check if model already exists
        const existingModel = cache.getModelByName(value.trim());
        if (existingModel) {
          return `Model '${value.trim()}' already exists`;
        }

        return null;
      },
    });

    if (!modelName?.trim()) {
      return null; // User cancelled
    }

    const finalModelName = modelName.trim();

    // Get datasource from source model
    const sourceModelDecorator = cache.getModelDecoratorByName("Model", sourceModel);
    const dataSource = sourceModelDecorator?.arguments?.[0]?.dataSource;

    // Determine target directory (same as source model's directory or data folder)
    const sourceModelDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const targetDir = sourceModelDir;

    const targetFilePath = path.join(targetDir, `${finalModelName}.ts`);

    // Generate model content
    const modelContent = await this.modelService.generateModelFileContent(finalModelName, '', dataSource, undefined, false, targetFilePath, cache, undefined, true, true);

    // Create the file
    const fileName = `${finalModelName}.ts`;
    const filePath = path.join(targetDir, fileName);
    
    try {
      const targetFileUri = await this.fileSystemService.createFile(finalModelName, filePath, modelContent, false);

      return {
        name: finalModelName,
        path: targetFileUri.fsPath
      };
    } catch (error) {
      throw new Error(`Failed to create new model file: ${error}`);
    }
  }






  /**
   * Adds the reference field to the source model.
   */
  private async addReferenceField(
    document: vscode.TextDocument,
    sourceModelName: string,
    fieldName: string,
    targetModelName: string,
    targetModelPath: string,
    cache: MetadataCache
  ): Promise<void> {
    // Create field info for the reference field using registry
    const referenceType = FIELD_TYPE_REGISTRY['Reference'];
    const fieldType: FieldTypeDefinition = {
      ...referenceType,
      tsType: targetModelName,
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // References are typically optional
      additionalConfig: {
        relationshipType: "reference",
        targetModel: targetModelName,
        targetModelPath: targetModelPath,
      },
    };

    // Generate the field code
    const fieldCode = this.generateReferenceFieldCode(fieldInfo, targetModelName);

    // Insert the field
    await this.sourceCodeService.insertField(document, sourceModelName, fieldInfo, fieldCode, cache);
  }

  /**
   * Generates the TypeScript code for the reference field.
   */
  private generateReferenceFieldCode(fieldInfo: FieldInfo, targetModelName: string): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field()");

    // Add Relationship decorator for reference
    lines.push("@Reference()");

    // Add property declaration
    lines.push(`${fieldInfo.name}!: ${targetModelName};`);

    return lines.join("\n");
  }

  /**
   * Converts camelCase to PascalCase.
   */
  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

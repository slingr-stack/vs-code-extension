import * as vscode from "vscode";
import { AppTreeItem } from "../../explorer/appTreeItem";
import { DefineFieldsTool } from "../fields/defineFields";
import { AddFieldTool } from "../fields/addField";
import { MetadataCache } from "../../cache/cache";
import { AIEnhancedTool, FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import { FileSystemService } from "../../services/fileSystemService";
import path from "path";

/**
 * Tool for creating new Model classes with the @Model decorator and extending BaseModel.
 *
 * This is a standalone creation tool that doesn't participate in the refactoring system.
 * It provides a simple interface for generating new model files with proper structure.
 *
 * When executed from a model context (e.g., from a model tree item), it automatically
 * creates a composition relationship field in the parent model pointing to the new model
 * using the AddFieldTool for consistent field generation.
 *
 * @example
 * ```typescript
 * // Generated model example:
 * @Model()
 * class Task extends BaseModel {
 *     @Field()
 *     name: string;
 * }
 *
 * // If created from a Project model context, automatically adds to Project:
 * @Field({})
 * @Relationship({
 *   type: 'composition'
 * })
 * tasks!: Task[];
 * ```
 */
export class NewModelTool implements AIEnhancedTool {
  private fileSystemService: FileSystemService;
  private defineFieldsTool: DefineFieldsTool;
  private addFieldTool: AddFieldTool;

  constructor() {
    this.fileSystemService = new FileSystemService();
    this.defineFieldsTool = new DefineFieldsTool();
    this.addFieldTool = new AddFieldTool();

  }

  /**
   * Processes user input with AI enhancement for model creation.
   * This method is used when AI assistance is requested for creating a new model.
   * @param userInput - Description of the model to create
   * @param targetUri - Target directory for the new model
   * @param cache - Metadata cache instance
   * @param additionalContext - Additional context for model creation
   */
  async processWithAI(
    userInput: string,
    targetUri: vscode.Uri,
    modelName: string,
    cache: MetadataCache,
    additionalContext?: any
  ): Promise<void> {
    // The current createNewModel method handles user interaction internally,
    // so we just call it with the provided parameters
    await this.createNewModel(targetUri, cache);
  }

  /**
   * Creates a new model file in the specified directory.
   *
   * @param targetUri - The URI where the new model should be created (file, folder, or AppTreeItem) - optional
   * @param cache - The metadata cache for context about existing models (optional)
   * @returns Promise that resolves when the model is created
   */
  public async createNewModel(targetUri?: vscode.Uri | AppTreeItem, cache?: MetadataCache): Promise<void> {
    let finalTargetUri: vscode.Uri;
    let parentModelInfo: { name: string; filePath: string } | null = null;

    // Handle different types of input 
    if (targetUri instanceof AppTreeItem) {
      // Detect if we're coming from a model context
      parentModelInfo = this.detectParentModel(targetUri, cache);
      finalTargetUri = this.fileSystemService.resolveTargetUri(targetUri);
    } else if (targetUri) {
      // Handle vscode.Uri case
      finalTargetUri = this.fileSystemService.resolveTargetUri(targetUri);
    } else {
      // Handle undefined case - use workspace folder or a default location
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        // Try to use src/data folder if it exists, otherwise create it or use workspace root
        const srcDataPath = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'data');
        try {
          await vscode.workspace.fs.stat(srcDataPath);
          finalTargetUri = srcDataPath;
        } catch {
          // src/data doesn't exist, try to create it
          try {
            await vscode.workspace.fs.createDirectory(srcDataPath);
            finalTargetUri = srcDataPath;
          } catch {
            // Can't create src/data, use workspace root
            finalTargetUri = workspaceFolder.uri;
          }
        }
      } else {
        throw new Error('No workspace folder is open. Please open a workspace folder first.');
      }
    }
    try {
      // Step 1: Get model name from user
      const modelName = await vscode.window.showInputBox({
        prompt: "Enter the name of the new model (PascalCase)",
        placeHolder: "e.g., Task, User, Project",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Model name is required";
          }
          if (!/^[A-Z][a-zA-Z0-9]*$/.test(value.trim())) {
            return "Model name must be in PascalCase (e.g., Task, UserProfile)";
          }
          return null;
        },
      });

      if (!modelName) {
        return; // User cancelled
      }

      // Check if model name already exists in cache
      if (cache) {
        const existingModels = cache.getDataModelClasses().map((m) => m.name);
        if (existingModels.includes(modelName)) {
          vscode.window.showErrorMessage(`A model named ${modelName} already exists. Please choose a different name.`);
          return; // Stop the process if model already exists
        }
      }

      // Step 2: Get optional documentation
      const docs = await vscode.window.showInputBox({
        prompt: "Enter optional documentation for the model (press Enter to skip)",
        placeHolder: "e.g., Represents a task in the project management system",
      });

      // Check if user cancelled
      if (docs === undefined) {
        return; // User pressed Esc
      }

      // Step 3: Get optional fields information
      const fieldsInfo = await vscode.window.showInputBox({
        prompt: "Enter field information (free text, press Enter to skip)",
        placeHolder: "e.g., title (string), description (text), project (relationship to Project), status (enum)",
      });

      // Check if user cancelled
      if (fieldsInfo === undefined) {
        return; // User pressed Esc
      }

      // Step 4: Determine target directory 
      let targetDirectory = this.fileSystemService.determineTargetDirectory(finalTargetUri);

      // Step 5: Check if file already exists and handle overwrite
      const filePath = path.join(targetDirectory, `${modelName}.ts`);
      const fileUri = vscode.Uri.file(filePath);
      const fileExists = await this.fileSystemService.fileExists(fileUri);
      if (fileExists) {
        const overwrite = await vscode.window.showWarningMessage(
          `File ${modelName}.ts already exists. Do you want to overwrite it?`,
          "Overwrite",
          "Cancel"
        );
        if (overwrite !== "Overwrite") {
          return;
        }
      }

      // Step 6: Generate model content
      const modelContent = this.generateModelContent(
        modelName,
        docs?.trim() || null,
        fieldsInfo?.trim() || null,
        targetDirectory
      );

      // Step 7: Create the file  (without handling overwrite since we already did)
      const targetFileUri = await this.fileSystemService.createFile(modelName, filePath, modelContent, false);

      // Step 8: Open the new file
      const document = await vscode.workspace.openTextDocument(targetFileUri);
      await vscode.window.showTextDocument(document);

      // Step 9: Process field descriptions if provided and cache is available
      if (fieldsInfo?.trim() && cache) {
        try {
          // Give the cache a moment to process the new file
          await new Promise((resolve) => setTimeout(resolve, 500));

          await this.defineFieldsTool.processFieldDescriptions(fieldsInfo.trim(), targetFileUri, cache, modelName, true);
        } catch (fieldError) {
          console.warn("Failed to process field descriptions:", fieldError);
          vscode.window.showWarningMessage(
            `Model created successfully, but field processing failed: ${fieldError}. You can manually use the Define Fields tool later.`
          );
        }
      }

      // Step 10: Handle parent model relationship if applicable
      if (parentModelInfo && cache) {
        try {
          await this.addCompositionRelationshipToParent(parentModelInfo, modelName, cache);
        } catch (relationshipError) {
          console.warn("Failed to add composition relationship to parent model:", relationshipError);
          vscode.window.showWarningMessage(
            `Model created successfully, but failed to add composition relationship to parent model: ${relationshipError}`
          );
        }
      }

      // Step 11: Show success message
      let successMessage =
        fieldsInfo?.trim() && cache
          ? `Model ${modelName} created and fields processed successfully!`
          : `Model ${modelName} created successfully!`;

      if (parentModelInfo) {
        successMessage += ` Composition relationship added to ${parentModelInfo.name}.`;
      }

      vscode.window.showInformationMessage(successMessage);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create model: ${error}`);
      console.error("Error creating new model:", error);
    }
  }

  /**
   * Generates the TypeScript content for a new model class.
   *
   * @param modelName - The name of the model class
   * @param docs - Optional documentation string
   * @param fieldsInfo - Optional field information (to be processed later by AI)
   * @param targetDirectory - The directory where the model file will be created
   * @returns The complete TypeScript content for the model file
   */
  private generateModelContent(
    modelName: string,
    docs?: string | null,
    fieldsInfo?: string | null,
    targetDirectory?: string
  ): string {
    const lines: string[] = [];

    // Add imports with dynamically calculated relative paths
    lines.push(`import { Model, Field } from 'slingr-framework';`);
    lines.push("import { BaseModel } from 'slingr-framework';");
    lines.push("");

    // Add Model decorator with docs if provided
    if (docs) {
      // Escape single quotes in the docs string to prevent breaking the code
      const escapedDocs = docs.replace(/'/g, "\\'");
      lines.push(`@Model({`);
      lines.push(`  docs: '${escapedDocs}'`);
      lines.push(`})`);
    }
    else {
      // Add Model decorator
      lines.push(`@Model()`);
    }

    // Add class declaration
    lines.push(`export class ${modelName} extends BaseModel {`);

    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Detects if the command is being executed from a model context.
   * @param targetUri - The AppTreeItem where the command was triggered
   * @param cache - The metadata cache for model lookup
   * @returns Information about the parent model or null if not in a model context
   */
  private detectParentModel(targetUri: AppTreeItem, cache?: MetadataCache): { name: string; filePath: string } | null {
    if (!cache) {
      return null;
    }

    // Check if the current item is a model or if we need to traverse up the tree
    let currentItem: AppTreeItem | undefined = targetUri;

    while (currentItem) {
      // Check if this item represents a model
      if (currentItem.itemType === "model" && currentItem.metadata) {
        // This is a model item, get its information
        const modelMetadata = currentItem.metadata as any;
        const modelName = modelMetadata.name || currentItem.label;

        // Try to find the file path for this model
        const modelFilePath = this.findModelFilePath(modelName, cache);

        if (modelFilePath) {
          return {
            name: modelName,
            filePath: modelFilePath,
          };
        }
      }

      // Move to parent item
      currentItem = currentItem.parent;
    }

    return null;
  }

  /**
   * Finds the file path for a given model name in the cache.
   * @param modelName - The name of the model to find
   * @param cache - The metadata cache
   * @returns The file path of the model or null if not found
   */
  private findModelFilePath(modelName: string, cache: MetadataCache): string | null {
    // Get all data models and find the one we're looking for
    const modelClasses = cache.getDataModelClasses();
    const targetModel = modelClasses.find((model) => model.name === modelName);

    if (!targetModel) {
      return null;
    }

    // Get the model's declaration location to determine the file path
    if (targetModel.declaration && targetModel.declaration.uri) {
      return targetModel.declaration.uri.fsPath;
    }

    // Fallback: check if we can find it in the cache's file metadata
    // Iterate through all cached files to find the model
    const dataModels = cache.getDataModelClasses();
    for (const model of dataModels) {
      if (model.name === modelName && model.declaration) {
        return model.declaration.uri.fsPath;
      }
    }

    return null;
  }

  /**
   * Automatically adds a composition relationship field to the parent model.
   * @param parentModelInfo - Information about the parent model
   * @param newModelName - Name of the newly created model
   * @param cache - The metadata cache
   */
  private async addCompositionRelationshipToParent(
    parentModelInfo: { name: string; filePath: string },
    newModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    // Generate field name 
    const fieldName = this.generateCompositionFieldName(newModelName);

    // Create the parent model URI
    const parentModelUri = vscode.Uri.file(parentModelInfo.filePath);

    // Find the Relationship field type option
    const relationshipFieldType = FIELD_TYPE_OPTIONS.find((option) => option.decorator === "Relationship");
    if (!relationshipFieldType) {
      throw new Error("Relationship field type not found in FIELD_TYPE_OPTIONS");
    }

    // Create the field info for the composition relationship
    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: relationshipFieldType,
      required: false, // Composition relationships are typically optional
      additionalConfig: {
        targetModel: newModelName,
        relationshipType: "composition",
      },
    };

    // Use AddFieldTool to add the field programmatically
    await this.addFieldTool.addFieldProgrammatically(
      parentModelUri,
      fieldInfo,
      newModelName,
      cache,
      true // silent mode - suppress success/error messages
    );
  }

  /**
   * Creates a new model file programmatically without user interaction.
   *
   * @param modelName - The name of the model to create
   * @param targetFilePath - The full file path where the model should be created
   * @param docs - Optional documentation for the model
   * @param dataSource - Optional datasource configuration
   * @returns Promise that resolves when the model is created
   */
  public async createModelProgrammatically(
    modelName: string,
    targetFilePath: string,
    docs?: string,
    dataSource?: string
  ): Promise<vscode.Uri> {
    try {
      // Generate model content
      const modelContent = this.generateModelContent(modelName, docs);

      // Modify the content to include datasource if provided
      let finalContent = modelContent;
      if (dataSource) {
        finalContent = finalContent.replace(
          '@Model()',
          `@Model({\n\tdataSource: ${dataSource}\n})`
        );
      }

      // Create the file
      const targetFileUri = await this.fileSystemService.createFile(
        modelName, 
        targetFilePath, 
        finalContent, 
        false // Don't handle overwrite since we control the path
      );

      return targetFileUri;
    } catch (error) {
      throw new Error(`Failed to create model programmatically: ${error}`);
    }
  }

  public toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

    /**
   * Generates a field name for composition relationships.
   * Converts the model name to camelCase and makes it plural.
   * @param modelName - The name of the target model
   * @returns The generated field name
   */
  public generateCompositionFieldName(modelName: string): string {
    // Convert to camelCase
    const camelCase = this.toCamelCase(modelName);

    // Make it plural (simple pluralization)
    if (camelCase.endsWith("y")) {
      return camelCase.slice(0, -1) + "ies";
    } else if (
      camelCase.endsWith("s") ||
      camelCase.endsWith("x") ||
      camelCase.endsWith("ch") ||
      camelCase.endsWith("sh")
    ) {
      return camelCase + "es";
    } else {
      return camelCase + "s";
    }
  }
}

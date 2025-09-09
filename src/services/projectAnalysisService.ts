import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../cache/cache";
import { FileSystemService } from "./fileSystemService";
import * as path from "path";
import { PropertyMetadata } from "../cache/cache";
import { fieldTypeConfig } from "../utils/fieldTypes";

export class ProjectAnalysisService {

  private fileSystemService: FileSystemService;

  constructor() {
    this.fileSystemService = new FileSystemService();
  }

  public async findModelClass(
    document: vscode.TextDocument,
    cache: MetadataCache
  ): Promise<DecoratedClass | undefined> {
    const fileMetadata = cache.getMetadataForFile(document.uri.fsPath);
    if (!fileMetadata) {
      return undefined;
    }

    const modelClasses = Object.values(fileMetadata.classes).filter((cls: DecoratedClass) =>
      cls.decorators.some((d) => d.name === "Model")
    );

    if (modelClasses.length === 1) {
      return modelClasses[0];
    }

    if (modelClasses.length > 1) {
      const selected = await vscode.window.showQuickPick(
        modelClasses.map((c) => c.name),
        { placeHolder: 'Select a model class from this file' }
      );
      return modelClasses.find((c) => c.name === selected);
    }
    return undefined;
  }

  /**
   * Gathers comprehensive application context including existing models,
   * common field patterns, and project structure.
   */
  public async gatherApplicationContext(cache: MetadataCache, targetUri: vscode.Uri): Promise<ApplicationContext> {
    const context: ApplicationContext = {
      existingModels: [],
      commonFieldPatterns: new Map(),
      availableFieldTypes: Object.keys(fieldTypeConfig),
      projectStructure: await this.analyzeProjectStructure(),
      relationshipTargets: [],
    };

    // Get all data models (models with @Model decorator)
    const dataModels = cache.getDataModelClasses();

    for (const model of dataModels) {
      const modelInfo: ModelInfo = {
        name: model.name,
        fields: [],
        filePath: model.declaration.uri.fsPath,
        documentation: this.extractModelDocumentation(model),
      };

      // Extract field information
      for (const [fieldName, field] of Object.entries(model.properties)) {
        const fieldInfo: FieldInfo = {
          name: fieldName,
          type: (field as PropertyMetadata).type,
          decorators: (field as PropertyMetadata).decorators.map((d: any) => d.name),
          documentation: this.extractFieldDocumentation(field as PropertyMetadata),
        };
        modelInfo.fields.push(fieldInfo);

        // Track common field patterns
        const pattern = `${fieldInfo.name}:${fieldInfo.type}`;
        const count = context.commonFieldPatterns.get(pattern) || 0;
        context.commonFieldPatterns.set(pattern, count + 1);
      }

      context.existingModels.push(modelInfo);
      context.relationshipTargets.push(model.name);
    }

    return context;
  }

  /**
   * Extracts documentation from model decorators.
   */
  private extractModelDocumentation(model: DecoratedClass): string | undefined {
    const modelDecorator = model.decorators.find((d) => d.name === "Model");
    if (modelDecorator?.arguments) {
      const docsArg = modelDecorator.arguments.find((arg) => arg.docs);
      return docsArg?.docs;
    }
    return undefined;
  }

  /**
   * Extracts documentation from field decorators.
   */
  public extractFieldDocumentation(field: PropertyMetadata): string | undefined {
    for (const decorator of field.decorators) {
      if (decorator.arguments) {
        const docsArg = decorator.arguments.find((arg: any) => arg.docs);
        if (docsArg) {
          return docsArg.docs;
        }
      }
    }
    return undefined;
  }

  /**
   * Analyzes the current model context including existing fields and their patterns.
   */
  public async analyzeModelContext(
    modelUri: vscode.Uri,
    modelName: string,
    cache: MetadataCache
  ): Promise<ModelContext> {
    const context: ModelContext = {
      modelName,
      existingFields: [],
      filePath: modelUri.fsPath,
      imports: [],
      usedEnums: [],
    };

    // Try to get existing model metadata from cache
    const fileMetadata = cache.getMetadataForFile(modelUri.fsPath);
    if (fileMetadata) {
      const modelClass = fileMetadata.classes[modelName];
      if (modelClass) {
        context.existingFields = Object.values(modelClass.properties).map((prop: PropertyMetadata) => ({
          name: prop.name,
          type: prop.type,
          decorators: prop.decorators.map((d: any) => d.name),
          documentation: this.extractFieldDocumentation(prop),
        }));
      }
    }

    // Analyze current file content for imports and enums
    const document = await vscode.workspace.openTextDocument(modelUri);
    const content = document.getText();

    context.imports = this.extractImports(content);
    context.usedEnums = this.extractEnums(content);

    return context;
  }

  /**
   * Extracts import statements from file content.
   */
  public extractImports(content: string): string[] {
    const importRegex = /import\s+.*?\s+from\s+['"][^'"]+['"];?/g;
    const matches = content.match(importRegex);
    return matches || [];
  }

  /**
   * Extracts enum definitions from file content.
   */
  public extractEnums(content: string): string[] {
    const enumRegex = /export\s+enum\s+(\w+)/g;
    const enums: string[] = [];
    let match;
    while ((match = enumRegex.exec(content)) !== null) {
      enums.push(match[1]);
    }
    return enums;
  }

  /**
   * Analyzes project structure to understand patterns and conventions.
   */
  public async analyzeProjectStructure(): Promise<ProjectStructure> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { dataFolderPath: "", frameworkPath: "", hasCustomTypes: false };
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const dataPath = path.join(rootPath, "src", "data");
    const frameworkPath = path.join(rootPath, "src", "framework");

    return {
      dataFolderPath: dataPath,
      frameworkPath: frameworkPath,
      hasCustomTypes: await this.checkForCustomTypes(dataPath),
    };
  }

  /**
   * Checks if the project has custom field types or enums.
   */
  public async checkForCustomTypes(dataPath: string): Promise<boolean> {
    try {
      const files = await vscode.workspace.findFiles("src/data/**/*.ts");
      for (const file of files) {
        const document = await vscode.workspace.openTextDocument(file);
        const content = document.getText();
        if (content.includes("export enum ") || content.includes("export type ")) {
          return true;
        }
      }
    } catch (error) {
      console.warn("Could not analyze custom types:", error);
    }
    return false;
  }

  /**
   * Finds all models within a specific directory and its subdirectories.
   *
   * @param cache - The metadata cache to search through
   * @param directoryPath - The absolute path of the directory to search
   * @returns An array of model metadata found in the directory
   */
  public findModelsInDirectory(cache: MetadataCache, directoryPath: string): any[] {
    const models: any[] = [];
    const normalizedDirectoryPath = path.resolve(directoryPath);

    // Use the public findMetadata method to get all models, then filter by directory
    const allModels = cache.findMetadata(
      (item) => "decorators" in item && item.decorators.some((d) => d.name === "Model")
    );

    // Filter models that are within the target directory
    for (const model of allModels) {
      if ("declaration" in model && model.declaration) {
        const modelFilePath = path.resolve(model.declaration.uri.fsPath);

        // Check if this model file is within the target directory
        if (modelFilePath.startsWith(normalizedDirectoryPath)) {
          models.push(model);
        }
      }
    }

    return models;
  }

  /**
   * Finds all TypeScript files that have imports from the specified folder.
   *
   * @param cache - The metadata cache
   * @param folderPath - The folder path to search for imports from
   * @returns Array of files with imports from the folder
   */
  public async findFilesWithImportsFromFolder(
    cache: MetadataCache,
    folderPath: string
  ): Promise<{ uri: vscode.Uri; relativePath: string }[]> {
    const results: { uri: vscode.Uri; relativePath: string }[] = [];

    // Get all TypeScript files in the workspace
    const files = await vscode.workspace.findFiles("**/*.ts", "**/node_modules/**");

    for (const fileUri of files) {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();

        // Look for import statements that reference files in the folder
        const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1];

          // Check if this import references the folder we're renaming
          if (this.importReferencesFolder(fileUri, importPath, folderPath)) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
              const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
              results.push({ uri: fileUri, relativePath });
              break; // Found at least one import, no need to check more in this file
            }
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  /**
   * Checks if an import path references files within the specified folder.
   *
   * @param fileUri - The URI of the file containing the import
   * @param importPath - The import path to check
   * @param folderPath - The folder path to check against
   * @returns True if the import references the folder
   */
  public importReferencesFolder(fileUri: vscode.Uri, importPath: string, folderPath: string): boolean {
    // Skip external modules (those without relative paths)
    if (!importPath.startsWith(".")) {
      return false;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return false;
    }

    // Resolve the import path relative to the importing file
    const fileDir = path.dirname(fileUri.fsPath);
    const resolvedImportPath = path.resolve(fileDir, importPath);

    // Get the path to the folder we're checking
    const dataDir = path.join(workspaceFolder.uri.fsPath, "src", "data");
    const targetFolderPath = path.join(dataDir, folderPath);

    // Check if the resolved import path is within the target folder
    const normalizedImport = path.normalize(resolvedImportPath);
    const normalizedTarget = path.normalize(targetFolderPath);

    return normalizedImport.startsWith(normalizedTarget);
  }
}

export interface ProjectStructure {
  dataFolderPath: string;
  frameworkPath: string;
  hasCustomTypes: boolean;
}

export interface ApplicationContext {
  existingModels: ModelInfo[];
  commonFieldPatterns: Map<string, number>;
  availableFieldTypes: string[];
  projectStructure: ProjectStructure;
  relationshipTargets: string[];
}

export interface ModelContext {
  modelName: string;
  existingFields: FieldInfo[];
  filePath: string;
  imports: string[];
  usedEnums: string[];
}

export interface ModelInfo {
  name: string;
  fields: FieldInfo[];
  filePath: string;
  documentation?: string;
}

export interface FieldInfo {
  name: string;
  type: string;
  decorators: string[];
  documentation?: string;
}

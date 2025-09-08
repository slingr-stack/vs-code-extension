import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { MetadataCache, DecoratedClass } from "../cache/cache";
import { detectIndentation, applyIndentation } from "../utils/detectIndentation";
import { PropertyMetadata } from "../cache/cache";
import { fieldTypeConfig } from "../utils/fieldTypes";

export class WorkspaceService {
  public async createModelFile(
    targetDir: string, 
    modelName: string, 
    content: string, 
    handleOverwrite: boolean = true
  ): Promise<vscode.Uri> {
    const filePath = path.join(targetDir, `${modelName}.ts`);
    const fileUri = vscode.Uri.file(filePath);

    if (handleOverwrite) {
      try {
        await vscode.workspace.fs.stat(fileUri);
        const overwrite = await vscode.window.showWarningMessage(
          `File ${path.basename(filePath)} already exists. Overwrite?`,
          "Overwrite",
          "Cancel"
        );
        if (overwrite !== "Overwrite") {
          throw new Error("User cancelled file overwrite.");
        }
      } catch {
        // File does not exist, proceed
      }
    }

    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
    return fileUri;
  }

  /**
   * Checks if a file already exists.
   * @param targetDir - The target directory
   * @param fileName - The model name
   * @returns True if the file exists, false otherwise
   */
  public async fileExists(targetDir: string, fileName: string): Promise<boolean> {
    const filePath = path.join(targetDir, `${fileName}.ts`);
    const fileUri = vscode.Uri.file(filePath);
    
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Determines the appropriate target directory for a new model file.
   * @param targetUri - The target URI (can be a file or directory)
   * @returns The target directory path
   */
  public determineTargetDirectory(targetUri: vscode.Uri): string {
    let targetDirectory = targetUri.fsPath;

    // If the context URI is a file, get its directory
    if (path.extname(targetUri.fsPath)) {
      targetDirectory = path.dirname(targetUri.fsPath);
    }

    // If we're not in src/data, default to src/data
    if (!targetDirectory.includes("/src/data/")) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
      if (workspaceFolder) {
        targetDirectory = path.join(workspaceFolder.uri.fsPath, "src", "data");
      }
    }

    return targetDirectory;
  }

  /**
   * Resolves AppTreeItem to a target URI for model creation.
   * @param targetUri - The input URI or AppTreeItem
   * @returns The resolved target URI
   */
  public resolveTargetUri(targetUri: vscode.Uri | any): vscode.Uri {
    if (targetUri instanceof vscode.Uri) {
      // Handle vscode.Uri case
      if (path.extname(targetUri.fsPath)) {
        // If it's a file, use its directory
        return vscode.Uri.file(path.dirname(targetUri.fsPath));
      }
      return targetUri;
    } else {
      // Handle AppTreeItem case
      if (targetUri.folderPath) {
        if (targetUri.itemType === "dataRoot") {
          return vscode.Uri.file(targetUri.folderPath);
        } else {
          // Construct the full path: workspace + src/data + folderPath
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            throw new Error("No workspace folder found");
          }
          const fullFolderPath = path.join(workspaceFolder.uri.fsPath, "src", "data", targetUri.folderPath);
          return vscode.Uri.file(fullFolderPath);
        }
      } else {
        // Fallback to src/data if folderPath is not available
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          throw new Error("No workspace folder found");
        }
        return vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, "src", "data"));
      }
    }
  }

  /**
   * Simple field insertion method (legacy).
   * Use insertFieldIntoModelAdvanced for more sophisticated field insertion.
   */
  public async insertFieldIntoModelSimple(
    document: vscode.TextDocument,
    modelClassName: string,
    fieldCode: string
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const content = document.getText();
    const lines = content.split("\n");

    let classStartLine = -1,
      classEndLine = -1,
      braceCount = 0,
      inClass = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`class ${modelClassName}`)) {
        classStartLine = i;
        inClass = true;
        if (lines[i].includes("{")) {
          braceCount++;
        }
      } else if (inClass) {
        if (lines[i].includes("{")) {
          braceCount++;
        }
        if (lines[i].includes("}")) {
          braceCount--;
        }
        if (braceCount === 0) {
          classEndLine = i;
          break;
        }
      }
    }

    if (classStartLine === -1 || classEndLine === -1) {
      throw new Error(`Could not find class boundaries for ${modelClassName}.`);
    }

    const indentation = detectIndentation(lines, classStartLine, classEndLine);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    edit.insert(document.uri, new vscode.Position(classEndLine, 0), "\n" + indentedFieldCode + "\n");
    await vscode.workspace.applyEdit(edit);
  }

  /**
   * Enhanced field insertion method that handles imports, positioning, and proper formatting.
   */
  public async insertFieldIntoModelAdvanced(
    document: vscode.TextDocument,
    modelClassName: string,
    fieldCode: string,
    fieldInfo: any,
    cache?: MetadataCache
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const content = document.getText();
    const lines = content.split('\n');

    // Handle decorator imports
    const decoratorImports = new Set<string>();
    decoratorImports.add('Field');
    decoratorImports.add(fieldInfo.type.decorator);
    
    // Handle model imports for Relationship fields
    if (fieldInfo.type.decorator === 'Relationship' && fieldInfo.additionalConfig?.targetModel) {
      await this.addModelImport(document, fieldInfo.additionalConfig.targetModel, edit, cache);
    }
    
    // Add or update slingr-framework imports
    await this.ensureSlingrFrameworkImports(document, edit, decoratorImports);
    
    // Find the model class boundaries
    const { classStartLine, classEndLine } = this.findClassBoundaries(lines, modelClassName);
    
    // Detect existing indentation pattern
    const detectedIndentation = detectIndentation(lines, classStartLine, classEndLine);
    
    // Find the best insertion point
    const insertionLine = this.findBestInsertionPoint(lines, classStartLine, classEndLine);
    
    // Apply detected indentation to the field code
    const indentedFieldCode = applyIndentation(fieldCode, detectedIndentation);
    
    // Prepare the insertion with proper spacing
    const codeToInsert = this.prepareFieldInsertion(indentedFieldCode, insertionLine, classEndLine);
    
    // Insert the field
    edit.insert(document.uri, new vscode.Position(insertionLine, 0), codeToInsert);
    
    // Apply the edit
    await vscode.workspace.applyEdit(edit);
    
    // Save the document
    await document.save();
  }

  /**
   * Finds class boundaries for a given class name.
   */
  private findClassBoundaries(lines: string[], modelClassName: string): { classStartLine: number, classEndLine: number } {
    let classStartLine = -1;
    let classEndLine = -1;
    let braceCount = 0;
    let inClass = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for class declaration
      if (line.includes(`class ${modelClassName}`) && line.includes('extends')) {
        classStartLine = i;
        inClass = true;
        if (line.includes('{')) {
          braceCount = 1;
        }
        continue;
      }
      
      if (inClass) {
        // Count braces to find class end
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        braceCount += openBraces - closeBraces;
        
        if (braceCount === 0) {
          classEndLine = i;
          break;
        }
      }
    }
    
    if (classStartLine === -1 || classEndLine === -1) {
      throw new Error(`Could not find class ${modelClassName} boundaries`);
    }
    
    return { classStartLine, classEndLine };
  }

  /**
   * Finds the best insertion point for a new field.
   */
  private findBestInsertionPoint(lines: string[], classStartLine: number, classEndLine: number): number {
    // Look for existing fields to insert after them
    let insertionLine = classEndLine; // Default: insert at closing brace
    
    for (let i = classEndLine - 1; i > classStartLine; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('}') && !line.startsWith('//') && !line.startsWith('*')) {
        insertionLine = i + 1;
        break;
      }
    }
    
    return insertionLine;
  }

  /**
   * Prepares the field insertion with proper spacing.
   */
  private prepareFieldInsertion(indentedFieldCode: string, insertionLine: number, classEndLine: number): string {
    let codeToInsert = indentedFieldCode;
    
    // Always add a newline before the field if we're inserting at the closing brace
    // or if there's existing content above
    if (insertionLine === classEndLine) {
      codeToInsert = "\n" + codeToInsert;
    }
    
    // Always add a newline after the field to separate it from the closing brace
    codeToInsert = codeToInsert + "\n";
    
    return codeToInsert;
  }

  /**
   * Ensures that the required slingr-framework imports are present.
   */
  private async ensureSlingrFrameworkImports(
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit,
    decoratorImports: Set<string>
  ): Promise<void> {
    const content = document.getText();
    const lines = content.split('\n');
    
    const slingrFrameworkImportLine = lines.findIndex(line => 
      line.includes('from') && line.includes('slingr-framework')
    );
    
    if (slingrFrameworkImportLine !== -1) {
      // Update existing import
      const currentImport = lines[slingrFrameworkImportLine];
      const importMatch = currentImport.match(/import\s+\{([^}]+)\}\s+from\s+['"]slingr-framework['"];?/);
      
      if (importMatch) {
        const currentImports = importMatch[1]
          .split(',')
          .map(imp => imp.trim())
          .filter(imp => imp.length > 0);
        
        // Add new imports that aren't already present
        const allImports = new Set([...currentImports, ...decoratorImports]);
        const newImportString = `import { ${Array.from(allImports).sort().join(', ')} } from 'slingr-framework';`;
        
        edit.replace(
          document.uri,
          new vscode.Range(slingrFrameworkImportLine, 0, slingrFrameworkImportLine, currentImport.length),
          newImportString
        );
      }
    } else {
      // Add new import if no slingr-framework import exists
      const newImportString = `import { ${Array.from(decoratorImports).sort().join(', ')} } from 'slingr-framework';\n`;
      edit.insert(document.uri, new vscode.Position(0, 0), newImportString);
    }
  }

  /**
   * Adds an import for a target model type.
   */
  private async addModelImport(
    document: vscode.TextDocument,
    targetModel: string,
    edit: vscode.WorkspaceEdit,
    cache?: MetadataCache
  ): Promise<void> {
    const content = document.getText();
    const lines = content.split('\n');
    
    // Check if the model is already imported
    const existingImport = lines.find(line => 
      line.includes('import') && 
      line.includes(targetModel) && 
      !line.includes('slingr-framework')
    );
    
    if (existingImport) {
      return; // Already imported
    }
    
    // Find the best place to insert the import (after existing imports)
    let insertLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        insertLine = i + 1;
      } else if (lines[i].trim() === '' && insertLine > 0) {
        break; // Found end of import section
      }
    }
    
    // Determine the import path
    let importPath = `./${targetModel}`;
    
    if (cache) {
      // Find the file path for the target model
      const targetModelFilePath = this.findModelFilePath(cache, targetModel);
      
      if (targetModelFilePath) {
        // Calculate relative path from current file to target model file
        const currentFilePath = document.uri.fsPath;
        const relativePath = path.relative(path.dirname(currentFilePath), targetModelFilePath);
        importPath = relativePath.replace(/\.ts$/, '').replace(/\\/g, '/');
        if (!importPath.startsWith('.')) {
          importPath = './' + importPath;
        }
      }
    }
    
    // Create the import statement
    const importStatement = `import { ${targetModel} } from '${importPath}';`;
    
    edit.insert(document.uri, new vscode.Position(insertLine, 0), importStatement + '\n');
  }

  /**
   * Finds the file path for a given model name in the cache.
   */
  private findModelFilePath(cache: MetadataCache, modelName: string): string | undefined {
    // Get all data models and find the one we're looking for
    const modelClasses = cache.getDataModelClasses();
    const targetModel = modelClasses.find(model => model.name === modelName);
    
    if (!targetModel) {
      return undefined;
    }
    
    // Get the model's declaration location to determine the file path
    if (targetModel.declaration && targetModel.declaration.uri) {
      return targetModel.declaration.uri.fsPath;
    }
    
    return undefined;
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
      const selected = await vscode.window.showQuickPick(modelClasses.map((c) => c.name));
      return modelClasses.find((c) => c.name === selected);
    }
    return undefined;
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
   * Validates a target file and prepares it for field addition.
   * @param targetUri - The URI of the target file
   * @param cache - The metadata cache
   * @returns The model class and document
   */
  public async validateAndPrepareTargetForFieldAddition(
    targetUri: vscode.Uri, 
    cache?: MetadataCache
  ): Promise<{ modelClass: DecoratedClass, document: vscode.TextDocument }> {
    // Ensure the file is a TypeScript file
    if (!targetUri.fsPath.endsWith('.ts')) {
      throw new Error('Target file must be a TypeScript file (.ts)');
    }
    
    // Open the document
    const document = await vscode.workspace.openTextDocument(targetUri);
    
    // Get model information from cache
    if (!cache) {
      throw new Error('Metadata cache is required for field addition');
    }
    
    const modelClass = await this.findModelClass(document, cache);
    if (!modelClass) {
      throw new Error('No model class found in this file. Make sure the class has a @Model decorator.');
    }
    
    return { modelClass, document };
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

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { MetadataCache, DecoratedClass } from "../cache/cache";
import { detectIndentation, applyIndentation } from "../utils/detectIndentation";
import { PropertyMetadata } from "../cache/cache";
import { fieldTypeConfig } from "../utils/fieldTypes";

export class WorkspaceService {
  public async createModelFile(targetDir: string, modelName: string, content: string): Promise<vscode.Uri> {
    const filePath = path.join(targetDir, `${this.toCamelCase(modelName)}.ts`);
    const fileUri = vscode.Uri.file(filePath);

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

    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
    return fileUri;
  }

  public async insertFieldIntoModel(
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
        if (lines[i].includes("{")) braceCount++;
      } else if (inClass) {
        if (lines[i].includes("{")) braceCount++;
        if (lines[i].includes("}")) braceCount--;
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

  public async findModelClass(
    document: vscode.TextDocument,
    cache: MetadataCache
  ): Promise<DecoratedClass | undefined> {
    const fileMetadata = cache.getMetadataForFile(document.uri.fsPath);
    if (!fileMetadata) return undefined;

    const modelClasses = Object.values(fileMetadata.classes).filter((cls: DecoratedClass) =>
      cls.decorators.some((d) => d.name === "Model")
    );

    if (modelClasses.length === 1) return modelClasses[0];

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

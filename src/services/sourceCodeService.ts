import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache } from "../cache/cache";
import { FieldInfo } from "../commands/interfaces";
import { detectIndentation, applyIndentation } from "../utils/detectIndentation";
import { FileSystemService } from "./fileSystemService";
import { ProjectAnalysisService } from "./projectAnalysisService";

export class SourceCodeService {
  private fileSystemService: FileSystemService;
  private projectAnalysisService: ProjectAnalysisService;
  constructor() {
    this.fileSystemService = new FileSystemService();
    this.projectAnalysisService = new ProjectAnalysisService();
  }

  public async insertField(
    document: vscode.TextDocument,
    modelClassName: string,
    fieldInfo: FieldInfo,
    fieldCode: string,
    cache?: MetadataCache
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const lines = document.getText().split("\n");

    await this.ensureSlingrFrameworkImports(document, edit, new Set(["Field", fieldInfo.type.decorator]));

    if (fieldInfo.type.decorator === "Relationship" && fieldInfo.additionalConfig?.targetModel) {
      await this.addModelImport(document, fieldInfo.additionalConfig.targetModel, edit, cache);
    }

    const { classEndLine } = this.findClassBoundaries(lines, modelClassName);
    const indentation = detectIndentation(lines, 0, lines.length);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    edit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`);

    await vscode.workspace.applyEdit(edit);
  }

  public findClassBoundaries(
    lines: string[],
    modelClassName: string
  ): { classStartLine: number; classEndLine: number } {
    let classStartLine = -1;
    let classEndLine = -1;
    let braceCount = 0;
    let inClass = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(`class ${modelClassName}`)) {
        classStartLine = i;
        inClass = true;
      }
      if (inClass) {
        if (line.includes("{")) braceCount++;
        if (line.includes("}")) braceCount--;
        if (braceCount === 0 && classStartLine !== -1) {
          classEndLine = i;
          break;
        }
      }
    }
    if (classStartLine === -1 || classEndLine === -1) {
      throw new Error(`Could not find class boundaries for ${modelClassName}.`);
    }
    return { classStartLine, classEndLine };
  }

  /**
   * Ensures that the required slingr-framework imports are present.
   */
  public async ensureSlingrFrameworkImports(
    document: vscode.TextDocument,
    edit: vscode.WorkspaceEdit,
    newImports: Set<string>
  ): Promise<void> {
    const content = document.getText();
    const lines = content.split("\n");

    const slingrFrameworkImportLine = lines.findIndex(
      (line) => line.includes("from") && line.includes("slingr-framework")
    );

    if (slingrFrameworkImportLine !== -1) {
      // Update existing import
      const currentImport = lines[slingrFrameworkImportLine];
      const importMatch = currentImport.match(/import\s+\{([^}]+)\}\s+from\s+['"]slingr-framework['"];?/);

      if (importMatch) {
        const currentImports = importMatch[1]
          .split(",")
          .map((imp) => imp.trim())
          .filter((imp) => imp.length > 0);

        // Add new imports that aren't already present
        const allImports = new Set([...currentImports, ...newImports]);
        const newImportString = `import { ${Array.from(allImports).sort().join(", ")} } from 'slingr-framework';`;

        edit.replace(
          document.uri,
          new vscode.Range(slingrFrameworkImportLine, 0, slingrFrameworkImportLine, currentImport.length),
          newImportString
        );
      }
    } else {
      // Add new import if no slingr-framework import exists
      const newImportString = `import { ${Array.from(newImports).sort().join(", ")} } from 'slingr-framework';\n`;
      edit.insert(document.uri, new vscode.Position(0, 0), newImportString);
    }
  }

  /**
   * Adds an import for a target model type.
   */
  public async addModelImport(
    document: vscode.TextDocument,
    targetModel: string,
    edit: vscode.WorkspaceEdit,
    cache?: MetadataCache
  ): Promise<void> {
    const content = document.getText();
    const lines = content.split("\n");

    // Check if the model is already imported
    const existingImport = lines.find(
      (line) => line.includes("import") && line.includes(targetModel) && !line.includes("slingr-framework")
    );

    if (existingImport) {
      return; // Already imported
    }

    // Find the best place to insert the import (after existing imports)
    let insertLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) {
        insertLine = i + 1;
      } else if (lines[i].trim() === "" && insertLine > 0) {
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
        importPath = relativePath.replace(/\.ts$/, "").replace(/\\/g, "/");
        if (!importPath.startsWith(".")) {
          importPath = "./" + importPath;
        }
      }
    }

    // Create the import statement
    const importStatement = `import { ${targetModel} } from '${importPath}';`;

    edit.insert(document.uri, new vscode.Position(insertLine, 0), importStatement + "\n");
  }

  /**
   * Updates import statements in a file to reflect a folder rename.
   *
   * @param workspaceEdit - The workspace edit to add changes to
   * @param fileUri - The URI of the file to update
   * @param oldFolderPath - The old folder path
   * @param newFolderPath - The new folder path
   */
  public async updateImportsInFile(
    workspaceEdit: vscode.WorkspaceEdit,
    fileUri: vscode.Uri,
    oldFolderPath: string,
    newFolderPath: string
  ): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const content = document.getText();

      // Find and replace import statements
      const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        if (this.projectAnalysisService.importReferencesFolder(fileUri, importPath, oldFolderPath)) {
          // Calculate the new import path
          const newImportPath = this.calculateNewImportPath(fileUri, importPath, oldFolderPath, newFolderPath);

          if (newImportPath !== importPath) {
            // Find the exact position of the import string
            const fullMatch = match[0];
            const importStringStart =
              fullMatch.indexOf(`'${importPath}'`) !== -1
                ? fullMatch.indexOf(`'${importPath}'`) + 1
                : fullMatch.indexOf(`"${importPath}"`) + 1;

            const start = document.positionAt(match.index + importStringStart);
            const end = document.positionAt(match.index + importStringStart + importPath.length);

            workspaceEdit.replace(fileUri, new vscode.Range(start, end), newImportPath);
          }
        }
      }
    } catch (error) {
      // Skip files that can't be processed
    }
  }

  /**
   * Calculates the new import path after a folder rename.
   *
   * @param fileUri - The URI of the file containing the import
   * @param currentImportPath - The current import path
   * @param oldFolderPath - The old folder path
   * @param newFolderPath - The new folder path
   * @returns The updated import path
   */
  public calculateNewImportPath(
    fileUri: vscode.Uri,
    currentImportPath: string,
    oldFolderPath: string,
    newFolderPath: string
  ): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return currentImportPath;
    }

    // Resolve the current import to an absolute path
    const fileDir = path.dirname(fileUri.fsPath);
    const resolvedCurrentPath = path.resolve(fileDir, currentImportPath);

    // Replace the old folder path with the new one
    const dataDir = path.join(workspaceFolder.uri.fsPath, "src", "data");
    const oldFolderAbsPath = path.join(dataDir, oldFolderPath);
    const newFolderAbsPath = path.join(dataDir, newFolderPath);

    const updatedAbsolutePath = resolvedCurrentPath.replace(oldFolderAbsPath, newFolderAbsPath);

    // Convert back to a relative path
    const newRelativePath = path.relative(fileDir, updatedAbsolutePath);

    // Ensure the path starts with './' if it's a relative path to the same or subdirectory
    if (!newRelativePath.startsWith(".") && !path.isAbsolute(newRelativePath)) {
      return "./" + newRelativePath;
    }

    return newRelativePath.replace(/\\/g, "/"); // Normalize path separators for imports
  }

  /**
   * Finds the file path for a given model name in the cache.
   */
  private findModelFilePath(cache: MetadataCache, modelName: string): string | undefined {
    // Get all data models and find the one we're looking for
    const modelClasses = cache.getDataModelClasses();
    const targetModel = modelClasses.find((model) => model.name === modelName);

    if (!targetModel) {
      return undefined;
    }

    // Get the model's declaration location to determine the file path
    if (targetModel.declaration && targetModel.declaration.uri) {
      return targetModel.declaration.uri.fsPath;
    }

    return undefined;
  }
}

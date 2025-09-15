import * as vscode from "vscode";
import * as path from "path";
import { DecoratedClass, MetadataCache } from "../cache/cache";
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
    cache?: MetadataCache,
    importModel: boolean = true
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const lines = document.getText().split("\n");
    const newImports = new Set<string>(["Field", fieldInfo.type.decorator]);
    if(fieldInfo.type.decorator === "Composition") {
      newImports.add("PersistentComponentModel");
    }

    await this.ensureSlingrFrameworkImports(document, edit, newImports);

    if (importModel && fieldInfo.additionalConfig) {
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
        if (line.includes("{")) {
          braceCount++;
        }
        if (line.includes("}")) {
          braceCount--;
        }
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
   * Inserts a new model class into a document at the appropriate location.
   *
   * @param document - The document to insert the model into
   * @param modelCode - The complete model code to insert
   * @param afterModelName - Optional name of existing model to insert after (defaults to end of file)
   * @param requiredImports - Set of imports to ensure are present
   */
  public async insertModel(
    document: vscode.TextDocument,
    modelCode: string,
    afterModelName?: string,
    requiredImports?: Set<string>
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const lines = document.getText().split("\n");

    // Ensure required imports are present
    if (requiredImports && requiredImports.size > 0) {
      await this.ensureSlingrFrameworkImports(document, edit, requiredImports);
    }

    // Determine insertion point
    let insertionLine = lines.length; // Default to end of file

    if (afterModelName) {
      try {
        const { classEndLine } = this.findClassBoundaries(lines, afterModelName);
        insertionLine = classEndLine + 1;
      } catch (error) {
        // If we can't find the specified model, fall back to end of file
        console.warn(`Could not find model ${afterModelName}, inserting at end of file`);
      }
    }

    // Detect indentation from the file
    //const indentation = detectIndentation(lines, 0, lines.length);
    //const indentedModelCode = applyIndentation(modelCode, indentation);

    // Insert the model with appropriate spacing
    const spacing = insertionLine < lines.length ? "\n\n" : "\n";
    edit.insert(document.uri, new vscode.Position(insertionLine, 0), `${spacing}${modelCode}\n`);

    await vscode.workspace.applyEdit(edit);
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

  /**
   * Extracts the datasource import from the source model file.
   */
  public async extractImport(sourceModel: DecoratedClass, importName: string): Promise<string | null> {
    try {
      // Read the source model file to extract datasource imports
      const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
      const content = document.getText();
      const lines = content.split("\n");

      // Clean up the importName (remove quotes if it's a string literal)
      const cleanImportName = importName.replace(/['"]/g, "");

      // Look for import lines that might contain the datasource
      for (const line of lines) {
        if (
          line.includes("import") &&
          (line.includes(cleanImportName) ||
            line.includes(`'${cleanImportName}'`) ||
            line.includes(`"${cleanImportName}"`))
        ) {
          return line;
        }
      }

      // Look for import lines from dataSources directory
      for (const line of lines) {
        if (line.includes("import") && line.includes("dataSources")) {
          // Check if this import contains our datasource
          if (line.includes(cleanImportName)) {
            return line;
          }
        }
      }

      // If no specific import found, create a generic datasource import
      // Calculate relative path to dataSources directory
      const sourceModelDir = path.dirname(sourceModel.declaration.uri.fsPath);
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(sourceModel.declaration.uri)?.uri.fsPath;

      if (workspaceRoot) {
        const relativePath = path.relative(sourceModelDir, path.join(workspaceRoot, "src", "dataSources"));
        const importPath = relativePath.replace(/\\/g, "/");
        return `import { ${cleanImportName} } from '${
          importPath.startsWith(".") ? importPath : "./" + importPath
        }/${cleanImportName}';`;
      }

      // Fallback
      return `import { ${cleanImportName} } from '../dataSources/${cleanImportName}';`;
    } catch (error) {
      console.warn("Could not extract datasource import:", error);
      return null;
    }
  }

  /**
   * Extracts the complete class body (everything between the class braces) from a model.
   * 
   * @param document - The document containing the model
   * @param className - The name of the class to extract from
   * @returns The class body content including proper indentation
   */
  public extractClassBody(document: vscode.TextDocument, className: string): string {
    const lines = document.getText().split("\n");
    const { classStartLine, classEndLine } = this.findClassBoundaries(lines, className);
    
    // Find the opening brace of the class
    let openBraceIndex = -1;
    for (let i = classStartLine; i <= classEndLine; i++) {
      if (lines[i].includes("{")) {
        openBraceIndex = i;
        break;
      }
    }
    
    if (openBraceIndex === -1) {
      throw new Error(`Could not find opening brace for class ${className}`);
    }
    
    // Extract content between the braces (excluding the braces themselves)
    const classBodyLines = lines.slice(openBraceIndex + 1, classEndLine);
    
    // Remove any empty lines at the end
    while (classBodyLines.length > 0 && classBodyLines[classBodyLines.length - 1].trim() === "") {
      classBodyLines.pop();
    }
    
    return classBodyLines.join("\n");
  }

  /**
   * Creates a complete model file with the given class body content.
   * 
   * @param modelName - The name of the new model class
   * @param classBody - The complete class body content
   * @param baseClass - The base class to extend (default: "PersistentModel")
   * @param dataSource - Optional datasource for the model
   * @param existingImports - Set of imports that should be included
   * @param isComponent - Whether this is a component model (affects export and class declaration)
   * @returns The complete model file content
   */
  public generateModelFileContent(
    modelName: string,
    classBody: string,
    baseClass: string = "PersistentModel",
    dataSource?: string,
    existingImports?: Set<string>,
    isComponent: boolean = false
  ): string {
    const lines: string[] = [];
    
    // Determine required imports
    const imports = new Set(["Model", "Field"]);
    
    // Add base class to imports (handle complex base classes like PersistentComponentModel<ParentModel>)
    const baseClassCore = baseClass.split('<')[0]; // Extract base class name before generic
    imports.add(baseClassCore);
    
    // Add existing imports if provided
    if (existingImports) {
      existingImports.forEach(imp => imports.add(imp));
    }
    
    // Analyze the class body to determine additional needed imports
    const bodyImports = this.extractImportsFromClassBody(classBody);
    bodyImports.forEach(imp => imports.add(imp));
    
    // Add import statement
    const sortedImports = Array.from(imports).sort();
    lines.push(`import { ${sortedImports.join(", ")} } from "slingr-framework";`);
    lines.push('');
    
    // Add model decorator
    if (dataSource) {
      lines.push(`@Model({`);
      lines.push(`\tdataSource: ${dataSource}`);
      lines.push(`})`);
    } else {
      lines.push(`@Model()`);
    }
    
    // Add class declaration (export only if not a component model)
    const exportKeyword = isComponent ? "" : "export ";
    lines.push(`${exportKeyword}class ${modelName} extends ${baseClass} {`);
    
    // Add class body (if not empty)
    if (classBody.trim()) {
      lines.push('');
      lines.push(classBody);
      lines.push('');
    }
    
    lines.push(`}`);
    
    return lines.join("\n");
  }

  /**
   * Analyzes class body content to determine which imports are needed.
   * 
   * @param classBody - The class body content to analyze
   * @returns Set of import names that should be included
   */
  private extractImportsFromClassBody(classBody: string): Set<string> {
    const imports = new Set<string>();
    
    // Look for decorator patterns
    const decoratorPatterns = [
      /@Text\b/g, /@LongText\b/g, /@Email\b/g, /@Html\b/g,
      /@Integer\b/g, /@Money\b/g, /@Number\b/g, /@Boolean\b/g,
      /@Date\b/g, /@DateRange\b/g, /@Choice\b/g,
      /@Reference\b/g, /@Composition\b/g, /@Relationship\b/g
    ];
    
    const decoratorNames = [
      "Text", "LongText", "Email", "Html",
      "Integer", "Money", "Number", "Boolean", 
      "Date", "DateRange", "Choice",
      "Reference", "Composition", "Relationship"
    ];
    
    decoratorPatterns.forEach((pattern, index) => {
      if (pattern.test(classBody)) {
        imports.add(decoratorNames[index]);
      }
    });
    
    // Always include Field if there are any field declarations
    if (classBody.includes("!:") || classBody.includes(":")) {
      imports.add("Field");
    }
    
    return imports;
  }

  /**
   * Extracts all model imports from a document (excluding slingr-framework imports).
   * 
   * @param document - The document to extract imports from
   * @returns Array of import statements for other models
   */
  public extractModelImports(document: vscode.TextDocument): string[] {
    const content = document.getText();
    const lines = content.split("\n");
    const modelImports: string[] = [];
    
    for (const line of lines) {
      // Look for import statements that are not from slingr-framework
      if (line.includes("import") && 
          line.includes("from") && 
          !line.includes("slingr-framework") &&
          !line.includes("vscode") &&
          !line.includes("path") &&
          line.trim().startsWith("import")) {
        modelImports.push(line);
      }
    }
    
    return modelImports;
  }

  /**
   * Focuses on an element in a document navigating to it and highlighting it.
   * This method can find and focus on various types of elements including:
   * - Class properties (fields with !: or :)
   * - Method names
   * - Class names
   * - Variable declarations
   */
  public async focusOnElement(document: vscode.TextDocument, elementName: string): Promise<void> {
    try {
      // Ensure the document is visible and active
      const editor = await vscode.window.showTextDocument(document, { preview: false });

      // Find the line containing the element
      const content = document.getText();
      const lines = content.split("\n");

      let elementLine = -1;
      let elementIndex = -1;

      // Look for different patterns in order of specificity
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Pattern 1: Property declarations (fieldName!: Type or fieldName: Type)
        if (line.includes(`${elementName}!:`) || line.includes(`${elementName}:`)) {
          elementLine = i;
          elementIndex = line.indexOf(elementName);
          break;
        }
        
        // Pattern 2: Method declarations (methodName() or methodName(
        if (line.includes(`${elementName}(`) && (line.includes('function') || line.includes('){') || line.includes(') {'))) {
          elementLine = i;
          elementIndex = line.indexOf(elementName);
          break;
        }
        
        // Pattern 3: Class declarations (class ClassName)
        if (line.includes(`class ${elementName}`)) {
          elementLine = i;
          elementIndex = line.indexOf(elementName);
          break;
        }
        
        // Pattern 4: Variable declarations (const elementName, let elementName, var elementName)
        if ((line.includes(`const ${elementName}`) || line.includes(`let ${elementName}`) || line.includes(`var ${elementName}`)) && 
            (line.includes('=') || line.includes(';'))) {
          elementLine = i;
          elementIndex = line.indexOf(elementName);
          break;
        }
        
        // Pattern 5: General word boundary match (as fallback)
        const wordBoundaryRegex = new RegExp(`\\b${elementName}\\b`);
        if (wordBoundaryRegex.test(line)) {
          const match = line.match(wordBoundaryRegex);
          if (match && match.index !== undefined) {
            elementLine = i;
            elementIndex = match.index;
            break;
          }
        }
      }

      if (elementLine !== -1 && elementIndex !== -1) {
        // Position the cursor at the element name
        const startPosition = new vscode.Position(elementLine, elementIndex);
        const endPosition = new vscode.Position(elementLine, elementIndex + elementName.length);

        // Set selection to highlight the element name
        editor.selection = new vscode.Selection(startPosition, endPosition);

        // Reveal the line in the center of the editor
        editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      console.warn("Could not focus on element:", error);
      // Fallback: just make sure the document is visible
      await vscode.window.showTextDocument(document, { preview: false });
    }
  }
}

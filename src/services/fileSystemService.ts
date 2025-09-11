import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class FileSystemService {
  public async createFile(
    fileName: string,
    filePath: string,
    content: string,
    handleOverwrite: boolean = true
  ): Promise<vscode.Uri> {
    const fileUri = vscode.Uri.file(filePath);

    if (handleOverwrite && (await this.fileExists(fileUri))) {
      const overwrite = await vscode.window.showWarningMessage(
        `File ${fileName} already exists. Overwrite?`,
        "Overwrite",
        "Cancel"
      );
      if (overwrite !== "Overwrite") {
        throw new Error("User cancelled file overwrite.");
      }
    }

    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
    return fileUri;
  }

  public async fileExists(fileUri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(fileUri);
      return true;
    } catch {
      return false;
    }
  }

  public determineTargetDirectory(targetUri: vscode.Uri): string {
    let targetDirectory = targetUri.fsPath;

    if (path.extname(targetUri.fsPath)) {
      targetDirectory = path.dirname(targetUri.fsPath);
    }

    if (!targetDirectory.includes(path.join("src", "data"))) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(targetUri);
      if (workspaceFolder) {
        targetDirectory = path.join(workspaceFolder.uri.fsPath, "src", "data");
      }
    }
    return targetDirectory;
  }

  /**
   * Determines the target directory to delete based on the provided context.
   *
   * @param targetUri - The provided target URI (can be AppTreeItem or vscode.Uri)
   * @returns The absolute path to the directory to delete, or null if invalid
   */
  public getTargetDirectoryToDelete(targetUri?: vscode.Uri | any): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    if (!targetUri) {
      throw new Error("No target folder specified for deletion");
    }

    if (targetUri.itemType) {
      // Handle AppTreeItem cases
      if (targetUri.itemType === "folder" && targetUri.folderPath) {
        // Get the absolute path of the folder
        const basePath = path.join(workspaceFolder.uri.fsPath, "src", "data");
        return path.join(basePath, ...targetUri.folderPath.split(/[\/\\]/));
      } else if (targetUri.itemType === "dataRoot") {
        // Cannot delete the data root folder
        throw new Error("Cannot delete the data root folder");
      }
    } else if (targetUri.scheme === "file") {
      // Handle vscode.Uri cases
      const targetPath = targetUri.fsPath;
      if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
        return targetPath;
      }
    }

    return null;
  }

  /**
   * Determines if a path is within a specific subdirectory of the workspace.
   *
   * @param targetPath - The path to check
   * @param subDirectory - The subdirectory to check against (e.g., 'src/data')
   * @returns True if the path is within the specified subdirectory
   */
  public isWithinSubDirectory(targetPath: string, subDirectory: string): boolean {
    const relativePath = this.getWorkspaceRelativePath(targetPath);
    if (!relativePath) {
      return false;
    }

    const normalizedSubDir = subDirectory.replace(/[\/\\]/g, path.sep);
    const normalizedRelative = relativePath.replace(/[\/\\]/g, path.sep);

    return normalizedRelative.startsWith(normalizedSubDir);
  }

  /**
   * Gets the workspace-relative path from an absolute path.
   *
   * @param absolutePath - The absolute file system path
   * @returns The path relative to the workspace root, or null if not within workspace
   */
  public getWorkspaceRelativePath(absolutePath: string): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return null;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const normalizedAbsolute = path.resolve(absolutePath);
    const normalizedWorkspace = path.resolve(workspacePath);

    if (normalizedAbsolute.startsWith(normalizedWorkspace)) {
      return path.relative(normalizedWorkspace, normalizedAbsolute);
    }

    return null;
  }

  public async createFolder(targetDirectory: string, folderName: string): Promise<string> {
    const newFolderPath = path.join(targetDirectory, folderName.trim());
    if (fs.existsSync(newFolderPath)) {
      throw new Error(`Folder "${folderName}" already exists in this location.`);
    }
    await fs.promises.mkdir(newFolderPath, { recursive: true });
    return newFolderPath;
  }

  /**
   * Deletes a directory and its contents using VS Code's workspace API.
   * This method deletes files one by one, which triggers the file watcher events
   * and allows automatic refactors to be processed properly.
   *
   * @param directoryPath - The absolute path of the directory to delete
   */
  public async deleteDirectory(directoryPath: string): Promise<void> {
    if (!fs.existsSync(directoryPath)) {
      return;
    }

    // Collect all files and directories first to avoid issues with files being deleted during traversal
    const allItems = await this.collectAllItemsRecursively(directoryPath);

    // Add the target directory itself to the list (it should be deleted last)
    allItems.push({ path: directoryPath, isFile: false });

    // Sort items so files come before their containing directories
    // This ensures we delete files first, then empty directories
    allItems.sort((a, b) => {
      // Files (not directories) should come first
      if (a.isFile && !b.isFile) {
        return -1;
      }
      if (!a.isFile && b.isFile) {
        return 1;
      }

      // For directories, deeper ones should come first (so we delete children before parents)
      if (!a.isFile && !b.isFile) {
        return b.path.split(path.sep).length - a.path.split(path.sep).length;
      }

      return 0;
    });

    // Delete all files first (this triggers automatic refactors)
    for (const item of allItems.filter((item) => item.isFile)) {
      try {
        const fileUri = vscode.Uri.file(item.path);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.deleteFile(fileUri, { ignoreIfNotExists: true });

        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (success) {
          console.log(`[DeleteFolder] Deleted file: ${item.path}`);
          // Small delay to allow cache to process the deletion
          await new Promise((resolve) => setTimeout(resolve, 50));
        } else {
          console.warn(`[DeleteFolder] Failed to delete file via workspace API: ${item.path}`);
          // Fallback to direct filesystem deletion if file still exists
          if (fs.existsSync(item.path)) {
            fs.unlinkSync(item.path);
          }
        }
      } catch (error) {
        console.error(`[DeleteFolder] Error deleting file ${item.path}:`, error);
        // Fallback to direct filesystem deletion if file still exists
        try {
          if (fs.existsSync(item.path)) {
            fs.unlinkSync(item.path);
          }
        } catch (fallbackError) {
          console.error(`[DeleteFolder] Fallback file deletion also failed:`, fallbackError);
        }
      }
    }

    // Then delete all directories (starting with the deepest ones)
    for (const item of allItems.filter((item) => !item.isFile)) {
      try {
        if (fs.existsSync(item.path)) {
          const directoryUri = vscode.Uri.file(item.path);
          const workspaceEdit = new vscode.WorkspaceEdit();
          workspaceEdit.deleteFile(directoryUri, { recursive: false, ignoreIfNotExists: true });

          const success = await vscode.workspace.applyEdit(workspaceEdit);
          if (success) {
            console.log(`[DeleteFolder] Deleted directory: ${item.path}`);
          } else {
            console.warn(`[DeleteFolder] Failed to delete directory via workspace API: ${item.path}`);
            // Fallback to direct filesystem deletion
            fs.rmdirSync(item.path);
          }
        }
      } catch (error) {
        console.error(`[DeleteFolder] Error deleting directory ${item.path}:`, error);
        // Fallback to direct filesystem deletion
        try {
          if (fs.existsSync(item.path)) {
            fs.rmdirSync(item.path);
          }
        } catch (fallbackError) {
          console.error(`[DeleteFolder] Fallback directory deletion also failed:`, fallbackError);
        }
      }
    }
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

  private async collectAllItemsRecursively(directoryPath: string): Promise<{ path: string; isFile: boolean }[]> {
    const items: { path: string; isFile: boolean }[] = [];
    if (!fs.existsSync(directoryPath)) {
      return items;
    }

    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        items.push(...(await this.collectAllItemsRecursively(fullPath)));
        items.push({ path: fullPath, isFile: false });
      } else {
        items.push({ path: fullPath, isFile: true });
      }
    }
    return items;
  }

  public async openDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(uri);
  }

  public async saveDocument(document: vscode.TextDocument): Promise<boolean> {
    return document.save();
  }

  /**
   * Moves all contents of a folder to its parent directory.
   *
   * @param directoryPath - The absolute path of the directory whose contents should be moved
   */
  public async moveFolderContentsToParent(directoryPath: string): Promise<void> {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory "${directoryPath}" does not exist.`);
    }

    const parentDirectory = path.dirname(directoryPath);

    // Check if parent directory exists
    if (!fs.existsSync(parentDirectory)) {
      throw new Error(`Parent directory "${parentDirectory}" does not exist.`);
    }

    const files = fs.readdirSync(directoryPath);

    for (const file of files) {
      const sourcePath = path.join(directoryPath, file);
      const targetPath = path.join(parentDirectory, file);

      // Handle potential naming conflicts
      const finalTargetPath = await this.resolveNamingConflict(targetPath);

      // Move the file or directory
      fs.renameSync(sourcePath, finalTargetPath);
    }
  }

  /**
   * Resolves naming conflicts when moving files to parent directory.
   * If a file/folder with the same name already exists, appends a number to make it unique.
   *
   * @param targetPath - The intended target path
   * @returns The final target path (may be modified to avoid conflicts)
   */
  public async resolveNamingConflict(targetPath: string): Promise<string> {
    if (!fs.existsSync(targetPath)) {
      return targetPath; // No conflict
    }

    const directory = path.dirname(targetPath);
    const extension = path.extname(targetPath);
    const baseName = path.basename(targetPath, extension);

    let counter = 1;
    let newTargetPath: string;

    do {
      newTargetPath = path.join(directory, `${baseName}_${counter}${extension}`);
      counter++;
    } while (fs.existsSync(newTargetPath));

    return newTargetPath;
  }

  /**
   * Recursively searches for any folder with the given name in the specified directory.
   *
   * @param searchDir - The directory to search in
   * @param folderName - The folder name to search for
   * @returns The path to the conflicting folder, or null if none found
   */
  public async findConflictingFolderName(searchDir: string, folderName: string): Promise<string | null> {
    try {
      const entries = await fs.promises.readdir(searchDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === folderName) {
            return path.join(searchDir, entry.name);
          }

          // Recursively search subdirectories
          const subDirPath = path.join(searchDir, entry.name);
          const conflict = await this.findConflictingFolderName(subDirPath, folderName);
          if (conflict) {
            return conflict;
          }
        }
      }

      return null;
    } catch (error) {
      // If we can't read a directory, assume no conflict
      return null;
    }
  }

  /**
   * Determines the target directory for folder creation based on the provided context.
   *
   * @param targetUri - The provided target URI (can be AppTreeItem or vscode.Uri)
   * @param defaultSubPath - Default subdirectory path relative to workspace root (defaults to 'src/data')
   * @returns The absolute path to the target directory
   */
  public getTargetDirectoryForFolder(targetUri?: vscode.Uri | any, defaultSubPath: string = "src/data"): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    // Start with the default path
    let targetDirectory = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));

    if (targetUri) {
      if (targetUri.itemType) {
        // Handle AppTreeItem cases
        if (targetUri.itemType === "folder" && targetUri.folderPath) {
          // Creating within an existing folder - append folder path to default base
          const basePath = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));
          targetDirectory = path.join(basePath, ...targetUri.folderPath.split(/[\/\\]/));
        } else if (targetUri.itemType === "dataRoot") {
          // Use the default base directory
          targetDirectory = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));
        } else if (targetUri.itemType === "model" && targetUri.metadata?.declaration?.uri) {
          // If targeting a model, use the directory containing the model file
          targetDirectory = path.dirname(targetUri.metadata.declaration.uri.fsPath);
        }
      } else if (targetUri.scheme === "file") {
        // Handle vscode.Uri cases
        const targetPath = targetUri.fsPath;
        try {
          if (fs.existsSync(targetPath)) {
            if (fs.lstatSync(targetPath).isDirectory()) {
              // If it's a directory, use it directly
              targetDirectory = targetPath;
            } else {
              // If it's a file, use the containing directory
              targetDirectory = path.dirname(targetPath);
            }
          }
        } catch (error) {
          // If file doesn't exist or can't be accessed, use default
          console.warn("Could not access target path, using default:", error);
        }
      }
    }

    return targetDirectory;
  }

  public directoryExists(directoryPath: string): boolean {
    // Validate the folder exists
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Folder ${directoryPath}} does not exist.`);
    }
    return true;
  }

  /**
   * Removes import statements for a specific model from a document.
   * This is useful when a model is moved from an external file to the same file,
   * making the import unnecessary.
   * 
   * @param document - The document to remove imports from
   * @param modelName - The name of the model to remove imports for
   * @returns Promise that resolves when the import is removed
   */
  public async removeModelImport(document: vscode.TextDocument, modelName: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const content = document.getText();
    const lines = content.split("\n");

    // Find and remove import lines that contain the model name
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for import statements that import the specific model
      if (this.isImportLineForModel(line, modelName)) {
        // Check if this is a single import or multiple imports
        if (this.isSingleModelImport(line, modelName)) {
          // Remove the entire import line
          const lineRange = new vscode.Range(i, 0, i + 1, 0);
          edit.delete(document.uri, lineRange);
        } else {
          // Remove only the specific model from a multi-import line
          const updatedLine = this.removeModelFromImportLine(line, modelName);
          if (updatedLine !== line) {
            const lineRange = new vscode.Range(i, 0, i, line.length);
            edit.replace(document.uri, lineRange, updatedLine);
          }
        }
      }
    }

    if (edit.size > 0) {
      await vscode.workspace.applyEdit(edit);
    }
  }

  /**
   * Checks if a line is an import statement for a specific model.
   */
  private isImportLineForModel(line: string, modelName: string): boolean {
    // Must be an import line
    if (!line.trim().startsWith('import')) {
      return false;
    }

    // Skip slingr-framework imports
    if (line.includes('slingr-framework')) {
      return false;
    }

    // Check if the model name appears in the import
    const importRegex = /import\s+\{([^}]+)\}\s+from/;
    const match = line.match(importRegex);
    
    if (match) {
      const importedItems = match[1].split(',').map(item => item.trim());
      return importedItems.includes(modelName);
    }

    // Also check for default imports
    const defaultImportRegex = new RegExp(`import\\s+${modelName}\\s+from`);
    return defaultImportRegex.test(line);
  }

  /**
   * Checks if the import line only imports a single model.
   */
  private isSingleModelImport(line: string, modelName: string): boolean {
    const importRegex = /import\s+\{([^}]+)\}\s+from/;
    const match = line.match(importRegex);
    
    if (match) {
      const importedItems = match[1].split(',').map(item => item.trim()).filter(item => item.length > 0);
      return importedItems.length === 1 && importedItems[0] === modelName;
    }

    // For default imports, it's always a single import
    const defaultImportRegex = new RegExp(`import\\s+${modelName}\\s+from`);
    return defaultImportRegex.test(line);
  }

  /**
   * Removes a specific model from a multi-import line.
   */
  private removeModelFromImportLine(line: string, modelName: string): string {
    const importRegex = /import\s+\{([^}]+)\}\s+from(.+)/;
    const match = line.match(importRegex);
    
    if (match) {
      const importedItems = match[1]
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0 && item !== modelName);
      
      if (importedItems.length > 0) {
        return `import { ${importedItems.join(', ')} } from${match[2]}`;
      } else {
        // If no items left, return empty string to indicate line should be removed
        return '';
      }
    }

    return line;
  }
}

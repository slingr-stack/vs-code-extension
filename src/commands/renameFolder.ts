import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { ExplorerService } from "../explorer/explorerService";
import { MetadataCache } from "../cache/cache";

/**
 * Tool for renaming folders in the src/data directory structure.
 * 
 * This tool allows users to rename folders within the data model hierarchy
 * and automatically updates all import references to files within that folder.
 */
export class RenameFolderTool {
  constructor(private explorerService: ExplorerService) {}

  /**
   * Renames a folder in the src/data directory and updates all references.
   * 
   * @param explorerProvider - The explorer provider to refresh after operation
   * @param cache - The metadata cache to help find import references 
   * @param targetUri - The target folder to rename (must be an AppTreeItem with itemType 'folder')
   */
  public async renameFolder(
    explorerProvider: ExplorerProvider, 
    cache: MetadataCache, 
    targetUri?: vscode.Uri | AppTreeItem
  ): Promise<void> {
    try {
      // Validate that targetUri is a folder AppTreeItem
      if (!targetUri || !(targetUri instanceof AppTreeItem) || targetUri.itemType !== 'folder') {
        vscode.window.showErrorMessage('Please select a folder to rename.');
        return;
      }

      const folderItem = targetUri;
      if (!folderItem.folderPath) {
        vscode.window.showErrorMessage('Selected folder does not have a valid path.');
        return;
      }

      // Get the workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }

      // Construct the current folder path
      const dataDir = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
      const currentFolderPath = path.join(dataDir, folderItem.folderPath);
      
      // Validate the folder exists
      if (!fs.existsSync(currentFolderPath)) {
        vscode.window.showErrorMessage(`Folder ${folderItem.folderPath} does not exist.`);
        return;
      }

      // Get the current folder name and parent directory
      const currentFolderName = path.basename(currentFolderPath);
      const parentDir = path.dirname(currentFolderPath);

      // Get new folder name from user
      const newFolderName = await vscode.window.showInputBox({
        prompt: `Enter the new name for folder '${currentFolderName}'`,
        value: currentFolderName,
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value.trim()) {
            return "Folder name cannot be empty";
          }
          
          // Check for valid folder name (basic validation)
          if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
            return "Folder name can only contain letters, numbers, hyphens, and underscores";
          }

          // Check if new name is different from current
          if (value.trim() === currentFolderName) {
            return "New name must be different from current name";
          }
          
          return null;
        }
      });

      if (!newFolderName) {
        return; // User cancelled
      }

      // Check if a folder with the new name already exists in src/data (anywhere)
      const conflictingPath = await this.findConflictingFolderName(dataDir, newFolderName.trim());
      if (conflictingPath) {
        vscode.window.showErrorMessage(
          `A folder named "${newFolderName}" already exists at ${path.relative(dataDir, conflictingPath)}. Please choose a different name.`
        );
        return;
      }

      // Create the new folder path
      const newFolderPath = path.join(parentDir, newFolderName.trim());

      // Find all files that might have imports from this folder
      const filesToUpdate = await this.findFilesWithImportsFromFolder(cache, folderItem.folderPath);

      // Create workspace edit
      const workspaceEdit = new vscode.WorkspaceEdit();

      // Update import statements in files that reference the renamed folder
      for (const fileInfo of filesToUpdate) {
        await this.updateImportsInFile(workspaceEdit, fileInfo.uri, folderItem.folderPath, this.getFolderPathFromParent(folderItem.folderPath, newFolderName.trim()));
      }

      // Add file system rename operation
      workspaceEdit.renameFile(vscode.Uri.file(currentFolderPath), vscode.Uri.file(newFolderPath));

      // Apply all changes
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      
      if (success) {
        // Wait a moment for file system operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Force refresh the cache to ensure folder structure changes are detected
        await cache.forceRefresh();
        
        // Refresh the explorer to show the changes
        explorerProvider.refresh();
        
        vscode.window.showInformationMessage(
          `Folder "${currentFolderName}" successfully renamed to "${newFolderName}".`
        );
      } else {
        vscode.window.showErrorMessage('Failed to rename folder. Please try again.');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to rename folder: ${errorMessage}`);
    }
  }

  /**
   * Recursively searches for any folder with the given name in the specified directory.
   */
  private async findConflictingFolderName(searchDir: string, folderName: string): Promise<string | null> {
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
   * Finds all TypeScript files that have imports from the specified folder.
   */
  private async findFilesWithImportsFromFolder(cache: MetadataCache, folderPath: string): Promise<{ uri: vscode.Uri; relativePath: string }[]> {
    const results: { uri: vscode.Uri; relativePath: string }[] = [];
    
    // Get all TypeScript files in the workspace
    const files = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');
    
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
   */
  private importReferencesFolder(fileUri: vscode.Uri, importPath: string, folderPath: string): boolean {
    // Skip external modules (those without relative paths)
    if (!importPath.startsWith('.')) {
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
    const dataDir = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    const targetFolderPath = path.join(dataDir, folderPath);
    
    // Check if the resolved import path is within the target folder
    const normalizedImport = path.normalize(resolvedImportPath);
    const normalizedTarget = path.normalize(targetFolderPath);
    
    return normalizedImport.startsWith(normalizedTarget);
  }

  /**
   * Updates import statements in a file to reflect the folder rename.
   */
  private async updateImportsInFile(
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
        
        if (this.importReferencesFolder(fileUri, importPath, oldFolderPath)) {
          // Calculate the new import path
          const newImportPath = this.calculateNewImportPath(fileUri, importPath, oldFolderPath, newFolderPath);
          
          if (newImportPath !== importPath) {
            // Find the exact position of the import string
            const fullMatch = match[0];
            const importStringStart = match.index + fullMatch.indexOf(`'${importPath}'`) !== -1 
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
   */
  private calculateNewImportPath(
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
    const dataDir = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    const oldFolderAbsPath = path.join(dataDir, oldFolderPath);
    const newFolderAbsPath = path.join(dataDir, newFolderPath);
    
    const updatedAbsolutePath = resolvedCurrentPath.replace(oldFolderAbsPath, newFolderAbsPath);
    
    // Convert back to a relative path
    const newRelativePath = path.relative(fileDir, updatedAbsolutePath);
    
    // Ensure the path starts with './' if it's a relative path to the same or subdirectory
    if (!newRelativePath.startsWith('.') && !path.isAbsolute(newRelativePath)) {
      return './' + newRelativePath;
    }
    
    return newRelativePath.replace(/\\/g, '/'); // Normalize path separators for imports
  }

  /**
   * Helper to create the new folder path by replacing the last segment.
   */
  private getFolderPathFromParent(originalPath: string, newFolderName: string): string {
    const segments = originalPath.split(path.sep);
    segments[segments.length - 1] = newFolderName;
    return segments.join(path.sep);
  }
}
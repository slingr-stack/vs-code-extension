import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";

/**
 * Tool for creating new folders in the src/data directory structure.
 * 
 * This tool allows users to create new folders within the data model hierarchy
 * to organize their models in a structured way.
 */
export class NewFolderTool {
  
  /**
   * Creates a new folder in the appropriate location within src/data.
   * Can be called from the data root or from within any existing folder.
   * 
   * @param targetUri - The target location where the folder should be created
   */
  public async createFolder(explorerProvider: ExplorerProvider, targetUri?: vscode.Uri | AppTreeItem): Promise<void> {
    try {
      // Determine the target directory
      const targetDirectory = this.getTargetDirectory(targetUri);
      
      // Get folder name from user
      const folderName = await vscode.window.showInputBox({
        prompt: "Enter the name for the new folder",
        placeHolder: "e.g., models, core, modules",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          if (!value.trim()) {
            return "Folder name cannot be empty";
          }
          
          // Check for valid folder name (basic validation)
          if (!/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
            return "Folder name can only contain letters, numbers, hyphens, and underscores";
          }
          
          return null;
        }
      });

      if (!folderName) {
        return; // User cancelled
      }

      // Create the full path for the new folder
      const newFolderPath = path.join(targetDirectory, folderName.trim());
      
      // Check if folder already exists
      if (fs.existsSync(newFolderPath)) {
        vscode.window.showErrorMessage(`Folder "${folderName}" already exists in this location.`);
        return;
      }

      // Create the directory
      await fs.promises.mkdir(newFolderPath, { recursive: true });

      explorerProvider.refresh();
      
      vscode.window.showInformationMessage(`Folder "${folderName}" created successfully at ${newFolderPath}`);
      
      // The explorer will automatically refresh when the cache detects file system changes
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to create folder: ${errorMessage}`);
    }
  }

  /**
   * Determines the target directory where the folder should be created.
   * 
   * @param targetUri - The provided target URI (folder or data root)
   * @returns The absolute path where the folder should be created
   */
  private getTargetDirectory(targetUri?: vscode.Uri | AppTreeItem): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    // Default to src/data if no specific target provided
    let targetDirectory = path.join(workspaceFolder.uri.fsPath, 'src', 'data');

    if (targetUri) {
      if (targetUri instanceof AppTreeItem) {
        // Handle AppTreeItem cases
        if (targetUri.itemType === 'folder' && targetUri.folderPath) {
          // Creating folder inside an existing folder
          targetDirectory = path.join(workspaceFolder.uri.fsPath, 'src', 'data', targetUri.folderPath);
        } else if (targetUri.itemType === 'dataRoot') {
          // Creating folder at the root of src/data
          targetDirectory = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
        }
      } else if (targetUri.scheme === 'file') {
        // Handle vscode.Uri cases
        const targetPath = targetUri.fsPath;
        if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
          // If it's a directory within src/data, use it
          if (targetPath.includes('/src/data/') || targetPath.includes('\\src\\data\\')) {
            targetDirectory = targetPath;
          }
        }
      }
    }

    // Ensure the target directory exists
    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, { recursive: true });
    }

    return targetDirectory;
  }
}
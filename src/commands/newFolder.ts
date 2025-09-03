import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { ExplorerService } from "../explorer/explorerService";

/**
 * Tool for creating new folders in the src/data directory structure.
 * 
 * This tool allows users to create new folders within the data model hierarchy
 * to organize their models in a structured way.
 */
export class NewFolderTool {

  constructor(private explorerService: ExplorerService) {}
  
  /**
   * Creates a new folder in the appropriate location within src/data.
   * Can be called from the data root or from within any existing folder.
   * 
   * @param targetUri - The target location where the folder should be created
   */
  public async createFolder(explorerProvider: ExplorerProvider, targetUri?: vscode.Uri | AppTreeItem): Promise<void> {
    try {
      // Determine the target directory
      const targetDirectory = this.explorerService.getTargetDirectory(targetUri);
      
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


}
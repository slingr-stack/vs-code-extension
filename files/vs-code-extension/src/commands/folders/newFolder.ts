import * as vscode from "vscode";
import { AppTreeItem } from "../../explorer/appTreeItem";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { FileSystemService } from "../../services/fileSystemService";

/**
 * Tool for creating new folders in the src/data directory structure.
 *
 * This tool allows users to create new folders within the data model hierarchy
 * to organize their models in a structured way.
 */
export class NewFolderTool {
  private projectAnalysisService: ProjectAnalysisService;
  private fileSystemService: FileSystemService;

  constructor() {
    this.projectAnalysisService = new ProjectAnalysisService();
    this.fileSystemService = new FileSystemService();
  }

  /**
   * Creates a new folder in the appropriate location within src/data.
   * Can be called from the data root or from within any existing folder.
   *
   * @param targetUri - The target location where the folder should be created
   */
  public async createFolder(explorerProvider: ExplorerProvider, targetUri?: vscode.Uri | AppTreeItem): Promise<void> {
    try {
      // Get folder name from user
      const folderName = await vscode.window.showInputBox({
        prompt: "Enter the name for the new folder",
        placeHolder: "e.g., models, core, modules",
        ignoreFocusOut: true,
        validateInput: (folderName: string) => {
          if (!folderName.trim()) {
            return "Folder name cannot be empty";
          }

          // Check for valid folder name (basic validation)
          if (!/^[a-zA-Z0-9-_]+$/.test(folderName.trim())) {
            return "Folder name can only contain letters, numbers, hyphens, and underscores";
          }

          return null;
        },
      });

      if (!folderName) {
        return; // User cancelled
      }

      // Determine the target directory 
      const targetDirectory = this.fileSystemService.getTargetDirectoryForFolder(targetUri);

      // Create the folder 
      const newFolderPath = await this.fileSystemService.createFolder(targetDirectory, folderName);

      explorerProvider.refresh();

      vscode.window.showInformationMessage(`Folder "${folderName}" created successfully at ${newFolderPath}`);

      // The explorer will automatically refresh when the cache detects file system changes
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Failed to create folder: ${errorMessage}`);
    }
  }
}

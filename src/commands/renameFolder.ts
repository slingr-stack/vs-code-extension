import * as vscode from "vscode";
import * as path from "path";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { MetadataCache } from "../cache/cache";
import { FileSystemService } from "../services/fileSystemService";
import { DefineFieldsTool } from "./defineFields";
import { AddFieldTool } from "./addField";
import { ProjectAnalysisService } from "../services/projectAnalysisService";
import { SourceCodeService } from "../services/sourceCodeService";

/**
 * Tool for renaming folders in the src/data directory structure.
 *
 * This tool allows users to rename folders within the data model hierarchy
 * and automatically updates all import references to files within that folder.
 */
export class RenameFolderTool {
  private fileSystemService: FileSystemService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;

  constructor() {
    this.fileSystemService = new FileSystemService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();

  }

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
      // Validate the folder 
      const { folderPath, currentFolderPath, currentFolderName, parentDir } = this.validateFolderForRename(targetUri);

      // Get new folder name from user
      const newFolderName = await vscode.window.showInputBox({
        prompt: `Enter the new name for folder '${currentFolderName}'`,
        value: currentFolderName,
        ignoreFocusOut: true,
        validateInput: (value: string) => {
          return this.validateNewFolderName(value, currentFolderName);
        },
      });

      if (!newFolderName) {
        return; // User cancelled
      }

      // Check if a folder with the new name already exists 
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error("No workspace folder found.");
      }

      const dataDir = path.join(workspaceFolder.uri.fsPath, "src", "data");
      const conflictingPath = await this.fileSystemService.findConflictingFolderName(dataDir, newFolderName.trim());
      if (conflictingPath) {
        vscode.window.showErrorMessage(
          `A folder named "${newFolderName}" already exists at ${path.relative(
            dataDir,
            conflictingPath
          )}. Please choose a different name.`
        );
        return;
      }

      // Create the new folder path
      const newFolderPath = path.join(parentDir, newFolderName.trim());

      // Find all files that might have imports from this folder 
      const filesToUpdate = await this.projectAnalysisService.findFilesWithImportsFromFolder(cache, folderPath);

      // Create workspace edit
      const workspaceEdit = new vscode.WorkspaceEdit();

      // Update import statements in files that reference the renamed folder 
      const newFolderRelativePath = this.getFolderPathFromParent(folderPath, newFolderName.trim());
      for (const fileInfo of filesToUpdate) {
        await this.sourceCodeService.updateImportsInFile(workspaceEdit, fileInfo.uri, folderPath, newFolderRelativePath);
      }

      // Add file system rename operation
      workspaceEdit.renameFile(vscode.Uri.file(currentFolderPath), vscode.Uri.file(newFolderPath));

      // Apply all changes
      const success = await vscode.workspace.applyEdit(workspaceEdit);

      if (success) {
        // Wait a moment for file system operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Force refresh the cache to ensure folder structure changes are detected
        await cache.forceRefresh();

        // Refresh the explorer to show the changes
        explorerProvider.refresh();

        vscode.window.showInformationMessage(
          `Folder "${currentFolderName}" successfully renamed to "${newFolderName}".`
        );
      } else {
        vscode.window.showErrorMessage("Failed to rename folder. Please try again.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Failed to rename folder: ${errorMessage}`);
    }
  }

  /**
   * Validates a folder for renaming operations.
   *
   * @param targetUri - The target folder to validate (must be an AppTreeItem with itemType 'folder')
   * @returns The validated folder information
   */
  public validateFolderForRename(targetUri?: vscode.Uri | any): {
    folderPath: string;
    currentFolderPath: string;
    currentFolderName: string;
    parentDir: string;
  } {
    // Validate that targetUri is a folder AppTreeItem
    if (!targetUri || !targetUri.itemType || targetUri.itemType !== "folder") {
      throw new Error("Please select a folder to rename.");
    }

    if (!targetUri.folderPath) {
      throw new Error("Selected folder does not have a valid path.");
    }

    // Get the workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found.");
    }

    // Construct the current folder path
    const dataDir = path.join(workspaceFolder.uri.fsPath, "src", "data");
    const currentFolderPath = path.join(dataDir, targetUri.folderPath);

    // Validate the folder exists
    this.fileSystemService.directoryExists(currentFolderPath);

    // Get the current folder name and parent directory
    const currentFolderName = path.basename(currentFolderPath);
    const parentDir = path.dirname(currentFolderPath);

    return {
      folderPath: targetUri.folderPath,
      currentFolderPath,
      currentFolderName,
      parentDir,
    };
  }

  /**
   * Validates a new folder name for renaming operations.
   *
   * @param newFolderName - The new folder name to validate
   * @param currentFolderName - The current folder name
   * @returns null if valid, error message if invalid
   */
  public validateNewFolderName(newFolderName: string, currentFolderName: string): string | null {
    if (!newFolderName.trim()) {
      return "Folder name cannot be empty";
    }

    // Check for valid folder name (basic validation)
    if (!/^[a-zA-Z0-9-_]+$/.test(newFolderName.trim())) {
      return "Folder name can only contain letters, numbers, hyphens, and underscores";
    }

    // Check if new name is different from current
    if (newFolderName.trim() === currentFolderName) {
      return "New name must be different from current name";
    }

    return null;
  }

  /**
   * Helper to create the new folder path by replacing the last segment.
   *
   * @param originalPath - The original folder path
   * @param newFolderName - The new folder name
   * @returns The new folder path
   */
  public getFolderPathFromParent(originalPath: string, newFolderName: string): string {
    const segments = originalPath.split(path.sep);
    segments[segments.length - 1] = newFolderName;
    return segments.join(path.sep);
  }
}

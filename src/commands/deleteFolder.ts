import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { MetadataCache } from "../cache/cache";
import { UserInputService } from "../services/userInputService";
import { ProjectAnalysisService } from "../services/projectAnalysisService";
import { SourceCodeService } from "../services/sourceCodeService";
import { FileSystemService } from "../services/fileSystemService";
import { DefineFieldsTool } from "./defineFields";

/**
 * Tool for deleting folders in the src/data directory structure.
 *
 * This tool allows users to delete folders within the data model hierarchy.
 * It provides two deletion modes:
 * 1. "Yes, Delete All" - Deletes the folder and all its contents permanently using
 *    VS Code's workspace API to ensure file watcher events trigger automatic refactors
 * 2. "Delete Folder, Keep Contents" - Deletes only the folder structure but moves
 *    all contents (files and subdirectories) to the parent directory
 *
 * The tool ensures that when files are deleted, they are processed through VS Code's
 * workspace API rather than direct filesystem operations, which allows the metadata
 * cache to detect the changes and trigger automatic refactoring operations.
 */
export class DeleteFolderTool {
  private projectAnalysisService: ProjectAnalysisService;
  private fileSystemService: FileSystemService;

  constructor() {
    this.projectAnalysisService = new ProjectAnalysisService();
    this.fileSystemService = new FileSystemService();
  }

  /**
   * Deletes a folder and handles model cleanup within it.
   * Can be called from any folder within src/data.
   *
   * @param explorerProvider - The explorer provider for refreshing the view
   * @param cache - The metadata cache for finding models
   * @param targetUri - The target folder to delete
   */
  public async deleteFolder(
    explorerProvider: ExplorerProvider,
    cache: MetadataCache,
    targetUri?: vscode.Uri | AppTreeItem
  ): Promise<void> {
    try {
      // Determine the target directory to delete
      const targetDirectory = this.fileSystemService.getTargetDirectoryToDelete(targetUri);

      if (!targetDirectory) {
        vscode.window.showErrorMessage("Could not determine folder to delete.");
        return;
      }

      // Check if folder exists
      if (!fs.existsSync(targetDirectory)) {
        vscode.window.showErrorMessage(`Folder "${path.basename(targetDirectory)}" does not exist.`);
        return;
      }

      // Check if it's within src/data to prevent accidental deletion of important folders
      if (!this.fileSystemService.isWithinSubDirectory(targetDirectory, "src/data")) {
        vscode.window.showErrorMessage("Can only delete folders within the src/data directory.");
        return;
      }

      const folderName = path.basename(targetDirectory);

      // Find all models within this folder and its subdirectories
      const modelsInFolder = this.projectAnalysisService.findModelsInDirectory(cache, targetDirectory);

      let confirmationMessage = `Are you sure you want to delete the folder "${folderName}"?`;

      if (modelsInFolder.length > 0) {
        const modelNames = modelsInFolder.map((model) => model.name).join(", ");
        confirmationMessage += `\n\nThis folder contains ${modelsInFolder.length} model(s): ${modelNames}`;
      } else {
        confirmationMessage += `\n\nThis folder does not contain any models.`;
      }

      confirmationMessage += "\n\nThis action cannot be undone.";

      // Ask for confirmation
      const confirmation = await vscode.window.showWarningMessage(
        confirmationMessage,
        "Yes, Delete All",
        "Delete Folder, Keep Contents",
        "Cancel"
      );

      if (confirmation === "Cancel" || !confirmation) {
        return; // User cancelled
      }
      // If user chose to delete models as well, proceed with model deletion
      else if (confirmation === "Yes, Delete All") {
        await this.fileSystemService.deleteDirectory(targetDirectory);

        explorerProvider.refresh();

        vscode.window.showInformationMessage(
          `Folder "${folderName}" deleted successfully${
            modelsInFolder.length > 0 ? ` along with ${modelsInFolder.length} model(s)` : ""
          }.`
        );
      } else if (confirmation === "Delete Folder, Keep Contents") {
        // Move all contents to parent directory , then delete the empty folder
        await this.fileSystemService.moveFolderContentsToParent(targetDirectory);

        // Delete the now-empty folder
        fs.rmdirSync(targetDirectory);

        explorerProvider.refresh();

        vscode.window.showInformationMessage(
          `Folder "${folderName}" deleted successfully. All contents moved to parent directory.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Failed to delete folder: ${errorMessage}`);
    }
  }
}

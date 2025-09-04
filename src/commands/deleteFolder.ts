import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { ExplorerService } from "../explorer/explorerService";
import { MetadataCache } from "../cache/cache";
import { isModel } from "../utils/metadata";

/**
 * Tool for deleting folders in the src/data directory structure.
 * 
 * This tool allows users to delete folders within the data model hierarchy.
 * When deleting a folder that contains model files, it will automatically
 * trigger the delete model refactor for each model found within the folder
 * and its subdirectories.
 */
export class DeleteFolderTool {

  constructor(private explorerService: ExplorerService) {}
  
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
      const targetDirectory = this.getTargetDirectoryToDelete(targetUri);
      
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
      if (!this.explorerService.isWithinSubDirectory(targetDirectory, 'src/data')) {
        vscode.window.showErrorMessage("Can only delete folders within the src/data directory.");
        return;
      }

      const folderName = path.basename(targetDirectory);
      
      // Find all models within this folder and its subdirectories
      const modelsInFolder = this.findModelsInDirectory(cache, targetDirectory);
      
      let confirmationMessage = `Are you sure you want to delete the folder "${folderName}"?`;
      
      if (modelsInFolder.length > 0) {
        const modelNames = modelsInFolder.map(model => model.name).join(", ");
        confirmationMessage += `\n\nThis will also delete ${modelsInFolder.length} model(s): ${modelNames}`;
        confirmationMessage += "\n\nAll references to these models will be removed from the codebase.";
      }
      
      confirmationMessage += "\n\nThis action cannot be undone.";

      // Ask for confirmation
      const confirmation = await vscode.window.showWarningMessage(
        confirmationMessage,
        "Yes, Delete All",
        "Cancel"
      );

      if (confirmation !== "Yes, Delete All") {
        return; // User cancelled
      }

      // First, trigger delete model refactor for each model in the folder
      if (modelsInFolder.length > 0) {
        for (const model of modelsInFolder) {
          try {
            // Get the file URI where this model is defined
            const modelUri = model.declaration.uri;
            
            // Execute the delete model command for this specific model
            await vscode.commands.executeCommand('slingr-vscode-extension.deleteModel', modelUri);
            
            vscode.window.showInformationMessage(`Triggered delete refactor for model "${model.name}"`);
          } catch (error) {
            console.error(`Failed to trigger delete model refactor for ${model.name}:`, error);
            vscode.window.showWarningMessage(`Could not trigger delete refactor for model "${model.name}". Please delete it manually.`);
          }
        }
        
        // Give user a moment to see the messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Delete the folder and all its contents
      await this.deleteFolderRecursively(targetDirectory);

      explorerProvider.refresh();
      
      vscode.window.showInformationMessage(
        `Folder "${folderName}" deleted successfully${modelsInFolder.length > 0 ? ` along with ${modelsInFolder.length} model(s)` : ''}.`
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to delete folder: ${errorMessage}`);
    }
  }

  /**
   * Determines the target directory to delete based on the provided context.
   * 
   * @param targetUri - The provided target URI (can be AppTreeItem or vscode.Uri)
   * @returns The absolute path to the directory to delete, or null if invalid
   */
  private getTargetDirectoryToDelete(targetUri?: vscode.Uri | AppTreeItem): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return null;
    }

    if (!targetUri) {
      vscode.window.showErrorMessage('No target folder specified for deletion');
      return null;
    }

    if (targetUri instanceof AppTreeItem) {
      // Handle AppTreeItem cases
      if (targetUri.itemType === 'folder' && targetUri.folderPath) {
        // Get the absolute path of the folder
        const basePath = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
        return path.join(basePath, ...targetUri.folderPath.split(/[\/\\]/));
      } else if (targetUri.itemType === 'dataRoot') {
        // Cannot delete the data root folder
        vscode.window.showErrorMessage('Cannot delete the data root folder');
        return null;
      }
    } else if (targetUri.scheme === 'file') {
      // Handle vscode.Uri cases
      const targetPath = targetUri.fsPath;
      if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
        return targetPath;
      }
    }

    return null;
  }

  /**
   * Finds all models within a specific directory and its subdirectories.
   * 
   * @param cache - The metadata cache to search through
   * @param directoryPath - The absolute path of the directory to search
   * @returns An array of model metadata found in the directory
   */
  private findModelsInDirectory(cache: MetadataCache, directoryPath: string): any[] {
    const models: any[] = [];
    const normalizedDirectoryPath = path.resolve(directoryPath);

    // Use the public findMetadata method to get all models, then filter by directory
    const allModels = cache.findMetadata(
      item => 'decorators' in item && item.decorators.some(d => d.name === 'Model')
    );
    
    // Filter models that are within the target directory
    for (const model of allModels) {
      if ('declaration' in model && model.declaration) {
        const modelFilePath = path.resolve(model.declaration.uri.fsPath);
        
        // Check if this model file is within the target directory
        if (modelFilePath.startsWith(normalizedDirectoryPath)) {
          models.push(model);
        }
      }
    }

    return models;
  }

  /**
   * Recursively deletes a directory and all its contents.
   * 
   * @param directoryPath - The absolute path of the directory to delete
   */
  private async deleteFolderRecursively(directoryPath: string): Promise<void> {
    if (fs.existsSync(directoryPath)) {
      const files = fs.readdirSync(directoryPath);
      
      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stat = fs.lstatSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursively delete subdirectory
          await this.deleteFolderRecursively(filePath);
        } else {
          // Delete file
          fs.unlinkSync(filePath);
        }
      }
      
      // Delete the now-empty directory
      fs.rmdirSync(directoryPath);
    }
  }
}

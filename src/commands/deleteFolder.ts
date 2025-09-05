import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AppTreeItem } from "../explorer/appTreeItem";
import { ExplorerProvider } from "../explorer/explorerProvider";
import { ExplorerService } from "../explorer/explorerService";
import { MetadataCache } from "../cache/cache";

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
        
        // Use VS Code's workspace API to delete files one by one
        // This will naturally trigger the file watcher events and automatic refactors
        await this.deleteDirectoryThroughWorkspaceAPI(targetDirectory);

        explorerProvider.refresh();
        
        vscode.window.showInformationMessage(
          `Folder "${folderName}" deleted successfully${modelsInFolder.length > 0 ? ` along with ${modelsInFolder.length} model(s)` : ''}.`
        );
      } else if (confirmation === "Delete Folder, Keep Contents") {
        // Move all contents to parent directory, then delete the empty folder
        await this.moveFolderContentsToParent(targetDirectory);
        
        // Delete the now-empty folder
        fs.rmdirSync(targetDirectory);
        
        explorerProvider.refresh();
        
        vscode.window.showInformationMessage(
          `Folder "${folderName}" deleted successfully. All contents moved to parent directory.`
        );
      }
      
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
   * Deletes a directory and its contents using VS Code's workspace API.
   * This method deletes files one by one, which triggers the file watcher events
   * and allows automatic refactors to be processed properly.
   * 
   * @param directoryPath - The absolute path of the directory to delete
   */
  private async deleteDirectoryThroughWorkspaceAPI(directoryPath: string): Promise<void> {
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
    for (const item of allItems.filter(item => item.isFile)) {
      try {
        const fileUri = vscode.Uri.file(item.path);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.deleteFile(fileUri, { ignoreIfNotExists: true });
        
        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (success) {
          console.log(`[DeleteFolder] Deleted file: ${item.path}`);
          // Small delay to allow cache to process the deletion
          await new Promise(resolve => setTimeout(resolve, 50));
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
    for (const item of allItems.filter(item => !item.isFile)) {
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
   * Collects all files and directories within a directory recursively.
   * 
   * @param directoryPath - The absolute path of the directory to search
   * @returns An array of objects containing path and type information
   */
  private async collectAllItemsRecursively(directoryPath: string): Promise<{ path: string; isFile: boolean }[]> {
    const items: { path: string; isFile: boolean }[] = [];
    
    if (!fs.existsSync(directoryPath)) {
      return items;
    }

    try {
      const files = fs.readdirSync(directoryPath);
      
      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        
        try {
          const stat = fs.lstatSync(filePath);
          
          if (stat.isDirectory()) {
            // Recursively collect items from subdirectories first
            const subItems = await this.collectAllItemsRecursively(filePath);
            items.push(...subItems);
            
            // Then add the directory itself
            items.push({ path: filePath, isFile: false });
          } else {
            // Add files
            items.push({ path: filePath, isFile: true });
          }
        } catch (statError) {
          console.warn(`[DeleteFolder] Could not stat ${filePath}:`, statError);
        }
      }
    } catch (readdirError) {
      console.error(`[DeleteFolder] Could not read directory ${directoryPath}:`, readdirError);
    }
    
    return items;
  }

  /**
   * Moves all contents of a folder to its parent directory.
   * 
   * @param directoryPath - The absolute path of the directory whose contents should be moved
   */
  private async moveFolderContentsToParent(directoryPath: string): Promise<void> {
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
  private async resolveNamingConflict(targetPath: string): Promise<string> {
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

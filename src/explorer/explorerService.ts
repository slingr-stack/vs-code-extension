import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AppTreeItem } from '../explorer/appTreeItem';
import { ExplorerProvider } from '../explorer/explorerProvider';

/**
 * Service class providing shared functionality for explorer-related commands.
 */

export class ExplorerService {

  /**
   * Determines the target directory based on the provided context.
   * 
   * @param targetUri - The provided target URI (can be AppTreeItem or vscode.Uri)
   * @param defaultSubPath - Default subdirectory path relative to workspace root (defaults to 'src/data')
   * @param createIfNotExists - Whether to create the directory if it doesn't exist (defaults to true)
   * @returns The absolute path to the target directory
   */
  public getTargetDirectory(
    targetUri?: vscode.Uri | AppTreeItem, 
    defaultSubPath: string = 'src/data',
    createIfNotExists: boolean = true
  ): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }

    // Start with the default path
    let targetDirectory = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));

    if (targetUri) {
      if (targetUri instanceof AppTreeItem) {
        // Handle AppTreeItem cases
        if (targetUri.itemType === 'folder' && targetUri.folderPath) {
          // Creating within an existing folder - append folder path to default base
          const basePath = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));
          targetDirectory = path.join(basePath, ...targetUri.folderPath.split(/[\/\\]/));
        } else if (targetUri.itemType === 'dataRoot') {
          // Use the default base directory
          targetDirectory = path.join(workspaceFolder.uri.fsPath, ...defaultSubPath.split(/[\/\\]/));
        } else if (targetUri.itemType === 'model' && targetUri.metadata?.declaration?.uri) {
          // If targeting a model, use the directory containing the model file
          targetDirectory = path.dirname(targetUri.metadata.declaration.uri.fsPath);
        }
      } else if (targetUri.scheme === 'file') {
        // Handle vscode.Uri cases
        const targetPath = targetUri.fsPath;
        if (fs.existsSync(targetPath)) {
          if (fs.lstatSync(targetPath).isDirectory()) {
            // If it's a directory, use it directly
            targetDirectory = targetPath;
          } else {
            // If it's a file, use the containing directory
            targetDirectory = path.dirname(targetPath);
          }
        }
      }
    }

    // Ensure the target directory exists if requested
    if (createIfNotExists && !fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, { recursive: true });
    }

    return targetDirectory;
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
}
import * as vscode from "vscode";
import { Project } from "ts-morph";
import { MetadataCache, DecoratedClass, DecoratorMetadata, PropertyMetadata, DataSourceMetadata, DatasetMetadata, DatasetFileMetadata, CacheUpdateEvent } from "../cache/cache";
import { AppTreeItem } from "./appTreeItem";
import { promises as fsPromises } from "fs";
import * as path from "path";


// Define custom MIME types for our drag-and-drop operations
const FIELD_MIME_TYPE = "application/vnd.slingr-vscode-extension.field";
const MODEL_MIME_TYPE = "application/vnd.slingr-vscode-extension.model";
const FOLDER_MIME_TYPE = "application/vnd.slingr-vscode-extension.folder";

// Interface for folder structure
interface FolderNode {
  folders: Map<string, FolderNode>;
  models: DecoratedClass[];
}

// Cache interface for performance optimizations
interface ExplorerCache {
  folderStructure?: FolderNode;
  compositionModelReferences?: Set<string>;
  lastCacheUpdate?: number;
}

export class ExplorerProvider
  implements vscode.TreeDataProvider<AppTreeItem>, vscode.TreeDragAndDropController<AppTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<AppTreeItem | undefined | null | void> = new vscode.EventEmitter<
    AppTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<AppTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  public dragMimeTypes: readonly string[] = [FIELD_MIME_TYPE, MODEL_MIME_TYPE, FOLDER_MIME_TYPE];
  public dropMimeTypes: readonly string[] = [FIELD_MIME_TYPE, MODEL_MIME_TYPE, FOLDER_MIME_TYPE];
  isDatasetDesynchronized: boolean = false;

  // Performance optimization cache
  private explorerCache: ExplorerCache = {};
  private refreshTimeout: NodeJS.Timeout | undefined;

  constructor(private cache: MetadataCache, private extensionUri: vscode.Uri) {
    // --- Listen for the cache's update event ---
    this.cache.onDidUpdate(() => {
      this.invalidateCache();
      if (!this.isDatasetDesynchronized) {
        this.isDatasetDesynchronized = true;
        this.refresh();
      }
      this.debouncedRefresh();
    });
  }

  /**
   * Invalidates the explorer cache when underlying data changes
   */
  private invalidateCache(): void {
    this.explorerCache = {};
  }

  /**
   * Debounced refresh to prevent too frequent UI updates
   */
  private debouncedRefresh(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refresh();
    }, 100); // 100ms debounce
  }

  public markDatasetsAsSynced() {
    if (this.isDatasetDesynchronized) {
      this.isDatasetDesynchronized = false;
      this.refresh();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AppTreeItem): vscode.TreeItem {
    return element;
  }

  handleDrag(
    source: readonly AppTreeItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    if (source.length > 1) {
      // Multi-drag is not supported for reordering
      return;
    }
    const draggedItem = source[0];

    // We can drag fields, models, or folders
    if (draggedItem.itemType === "field" && draggedItem.metadata && "name" in draggedItem.metadata) {
      // The parent of a field item is the 'modelFieldsFolder', which holds the model's metadata
      const modelFilePath = draggedItem.parent?.metadata?.declaration.uri.fsPath;
      const modelClassName = draggedItem.parent?.metadata?.name;
      if (modelFilePath && modelClassName) {
        dataTransfer.set(
          FIELD_MIME_TYPE,
          new vscode.DataTransferItem({
            field: draggedItem.metadata.name,
            modelPath: modelFilePath,
            modelClassName: modelClassName,
          })
        );
      }
    } else if (draggedItem.itemType === "model" && draggedItem.metadata && this.isDecoratedClass(draggedItem.metadata)) {
      // Check if this is a composition model (nested model within another model)
      if (draggedItem.parent && draggedItem.parent.itemType === "model") {
        // This is a composition model
        const modelFilePath = draggedItem.parent.metadata?.declaration.uri.fsPath;
        const modelClassName = draggedItem.parent.metadata?.name;

        // We need to find the property name that represents this composition relationship
        // Look through the parent model's properties to find the one that matches this composition
        if (
          modelFilePath &&
          modelClassName &&
          draggedItem.parent.metadata &&
          "properties" in draggedItem.parent.metadata
        ) {
          const parentModel = draggedItem.parent.metadata;
          let compositionFieldName = null;

          // Find the field that represents this composition relationship
          for (const [propName, prop] of Object.entries(parentModel.properties)) {
            if (
              prop.decorators.some((d) => d.name === "Field") &&
              prop.decorators.some(
                (d) =>
                  d.name === "Relationship" &&
                  d.arguments.some((arg) => arg.type === "composition" || arg.type === "Composition")
              ) &&
              this.extractBaseTypeFromArrayType(prop.type) === draggedItem.metadata?.name
            ) {
              compositionFieldName = propName;
              break;
            }
          }

          if (compositionFieldName) {
            dataTransfer.set(
              FIELD_MIME_TYPE,
              new vscode.DataTransferItem({
                field: compositionFieldName,
                modelPath: modelFilePath,
                modelClassName: modelClassName,
              })
            );
          }
        }
      } else {
        // This is a standalone model that can be moved to folders
        const modelFilePath = draggedItem.metadata.declaration.uri.fsPath;
        dataTransfer.set(
          MODEL_MIME_TYPE,
          new vscode.DataTransferItem({
            modelPath: modelFilePath,
            modelClassName: draggedItem.metadata.name,
          })
        );
      }
    } else if (draggedItem.itemType === "folder" && draggedItem.folderPath) {
      // This is a folder that can be moved to other folders
      dataTransfer.set(
        FOLDER_MIME_TYPE,
        new vscode.DataTransferItem({
          folderPath: draggedItem.folderPath,
          folderName: draggedItem.label,
        })
      );
    }
  }

  async handleDrop(
    target: AppTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Handle field reordering (existing functionality)
    const fieldTransferItem = dataTransfer.get(FIELD_MIME_TYPE);
    const modelTransferItem = dataTransfer.get(MODEL_MIME_TYPE);
    const folderTransferItem = dataTransfer.get(FOLDER_MIME_TYPE);

    if (fieldTransferItem?.value !== '' && fieldTransferItem) {
      await this.handleFieldDrop(target, fieldTransferItem);
      return;
    }

    // Handle model moving to folders
    if (modelTransferItem?.value !== '' && modelTransferItem) {
      await this.handleModelDrop(target, modelTransferItem);
      return;
    }

    // Handle folder moving to other folders
    if (folderTransferItem?.value !== '' && folderTransferItem) {
      await this.handleFolderDrop(target, folderTransferItem);
      return;
    }

    // If no valid transfer item is found, show an appropriate message
    vscode.window.showWarningMessage("Invalid drop operation.");
  }

  private async handleFieldDrop(target: AppTreeItem | undefined, transferItem: vscode.DataTransferItem): Promise<void> {
    const draggedData = transferItem.value;

    // Check if someone is trying to drop a composition model into a folder or data root
    if (target && (target.itemType === "folder" || target.itemType === "dataRoot" || target.itemType === "model")) {
      vscode.window.showWarningMessage("Composition models cannot be moved to folders or models. They are part of their parent model structure.");
      return;
    }

    // Ensure we have a valid target to drop onto (field or composition model)
    let targetFieldName: string | null = null;
    let targetModelPath: string | undefined = undefined;

    if (target && target.itemType === "field" && target.metadata && "name" in target.metadata) {
      // Dropping onto a regular field
      targetFieldName = target.metadata.name;
      targetModelPath = target.parent?.metadata?.declaration.uri.fsPath;
    } else if (target && target.itemType === "model" && target.parent && target.parent.itemType === "model") {
      // Dropping onto a composition model
      targetModelPath = target.parent.metadata?.declaration.uri.fsPath;

      // Find the field name that represents this composition relationship
      if (target.parent.metadata && "properties" in target.parent.metadata) {
        const parentModel = target.parent.metadata;
        for (const [propName, prop] of Object.entries(parentModel.properties)) {
          if (
            prop.decorators.some((d) => d.name === "Field") &&
            prop.decorators.some(
              (d) =>
                d.name === "Relationship" &&
                d.arguments.some((arg) => arg.type === "Composition" || arg.type === "composition")
            ) &&
            this.extractBaseTypeFromArrayType(prop.type) === target.metadata?.name
          ) {
            targetFieldName = propName;
            break;
          }
        }
      }
    }

    if (!target || !targetFieldName || !targetModelPath) {
      vscode.window.showWarningMessage("A field can only be dropped onto another field or composition model.");
      return;
    }

    // Validate the drop operation
    if (draggedData.modelPath !== targetModelPath) {
      vscode.window.showWarningMessage("Fields can only be reordered within the same model.");
      return;
    }

    if (draggedData.field === targetFieldName) {
      return; // Dropped on itself
    }

    // Perform the reordering
    try {
      // 1. Get the new text from ts-morph *without saving*.
      const newText = await this.reorderFieldsAndGetText(
        draggedData.modelPath,
        draggedData.modelClassName,
        draggedData.field,
        targetFieldName
      );

      if (newText === null) {
        vscode.window.showErrorMessage("Failed to reorder fields.");
        return;
      }

      // 2. Apply the changes to the editor and format.
      const uri = vscode.Uri.file(draggedData.modelPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      // Replace the entire document content with the new text.
      await editor.edit((editBuilder) => {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        editBuilder.replace(fullRange, newText);
      });

      // Execute the format command on the now-dirty file.
      await vscode.commands.executeCommand("editor.action.formatDocument");

      // 3. Save the document a single time.
      await document.save();

      // 4. Refresh the tree. The cache will update from the single save event.
      setTimeout(() => {
        this.refresh();
      }, 200);
    } catch (error: any) {
      console.error("Error reordering fields:", error);
      vscode.window.showErrorMessage(`An error occurred: ${error.message}`);
    }
  }

  private async handleModelDrop(target: AppTreeItem | undefined, transferItem: vscode.DataTransferItem): Promise<void> {
    const draggedData = transferItem.value;

    // Models can only be dropped into folders or the data root
    if (!target || (target.itemType !== "folder" && target.itemType !== "dataRoot")) {
      vscode.window.showWarningMessage("Models can only be dropped into folders.");
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    const srcDataPath = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    const targetPath = target.itemType === "dataRoot" ? srcDataPath : path.join(srcDataPath, target.folderPath || "");

    try {
      // Move the model file to the new location using VS Code's workspace edit API
      const sourcePath = draggedData.modelPath;
      const fileName = path.basename(sourcePath);
      const newPath = path.join(targetPath, fileName);

      // Check if target file already exists
      try {
        await fsPromises.access(newPath);
        vscode.window.showErrorMessage(`A file named "${fileName}" already exists in the target folder.`);
        return;
      } catch {
        // File doesn't exist, which is what we want
      }

      // Create target directory if it doesn't exist
      try {
        await fsPromises.access(targetPath);
      } catch {
        await fsPromises.mkdir(targetPath, { recursive: true });
      }

      // Use VS Code's workspace edit API to move the file
      // This will automatically trigger import updates
      const workspaceEdit = new vscode.WorkspaceEdit();
      const sourceUri = vscode.Uri.file(sourcePath);
      const targetUri = vscode.Uri.file(newPath);
      
      workspaceEdit.renameFile(sourceUri, targetUri);
      
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      
      if (success) {
        // Force cache refresh after model move to ensure proper file path updates
        await this.cache.forceRefresh();
        
        // Wait a bit longer and then refresh the tree to ensure cache is fully updated
        setTimeout(() => {
          this.refresh();
        }, 300);

        vscode.window.showInformationMessage(`Model "${draggedData.modelClassName}" moved successfully.`);
      } else {
        vscode.window.showErrorMessage(`Failed to move model "${draggedData.modelClassName}".`);
      }
    } catch (error: any) {
      console.error("Error moving model:", error);
      vscode.window.showErrorMessage(`Failed to move model: ${error.message}`);
    }
  }

  private async handleFolderDrop(target: AppTreeItem | undefined, transferItem: vscode.DataTransferItem): Promise<void> {
    const draggedData = transferItem.value;

    // Folders can only be dropped into other folders or the data root
    if (!target || (target.itemType !== "folder" && target.itemType !== "dataRoot")) {
      vscode.window.showWarningMessage("Folders can only be dropped into other folders.");
      return;
    }

    // Prevent dropping a folder into itself or its children
    if (target.itemType === "folder" && target.folderPath) {
      // Normalize paths for cross-platform comparison
      const normalizedTargetPath = target.folderPath.replace(/[\/\\]/g, path.sep);
      const normalizedDraggedPath = draggedData.folderPath.replace(/[\/\\]/g, path.sep);
      
      if (normalizedTargetPath.startsWith(normalizedDraggedPath)) {
        vscode.window.showWarningMessage("Cannot move a folder into itself or its subfolder.");
        return;
      }
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    const srcDataPath = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    const sourcePath = path.join(srcDataPath, draggedData.folderPath);
    const targetBasePath = target.itemType === "dataRoot" ? srcDataPath : path.join(srcDataPath, target.folderPath || "");
    const newPath = path.join(targetBasePath, draggedData.folderName);

    try {
      // Check if target folder already exists
      try {
        await fsPromises.access(newPath);
        vscode.window.showErrorMessage(`A folder named "${draggedData.folderName}" already exists in the target location.`);
        return;
      } catch {
        // Folder doesn't exist, which is what we want
      }

      // Create target directory if it doesn't exist
      try {
        await fsPromises.access(targetBasePath);
      } catch {
        await fsPromises.mkdir(targetBasePath, { recursive: true });
      }

      // Use VS Code's workspace edit API to move the folder
      // This will automatically trigger import updates for all files in the folder
      const workspaceEdit = new vscode.WorkspaceEdit();
      const sourceUri = vscode.Uri.file(sourcePath);
      const targetUri = vscode.Uri.file(newPath);
      
      workspaceEdit.renameFile(sourceUri, targetUri);
      
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      
      if (success) {
        // Force cache refresh after folder move to ensure proper file path updates
        await this.cache.forceRefresh();
        
        // Wait a bit longer and then refresh the tree to ensure cache is fully updated
        setTimeout(() => {
          this.refresh();
        }, 300);

        vscode.window.showInformationMessage(`Folder "${draggedData.folderName}" moved successfully.`);
      } else {
        vscode.window.showErrorMessage(`Failed to move folder "${draggedData.folderName}".`);
      }
    } catch (error: any) {
      console.error("Error moving folder:", error);
      vscode.window.showErrorMessage(`Failed to move folder: ${error.message}`);
    }
  }

  /**
   * Reorders fields in the model class file and returns the updated text.
   * This function uses ts-morph to manipulate the source code without saving it.
   * @param modelPath The path to the model class file.
   * @param modelClassName The name of the model class to modify.
   * @param sourceFieldName The name of the field to move.
   * @param targetFieldName The name of the field to move before.
   * @returns The updated source code as a string, or null if an error occurs.
   */
  private async reorderFieldsAndGetText(
    modelPath: string,
    modelClassName: string,
    sourceFieldName: string,
    targetFieldName: string
  ): Promise<string | null> {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(modelPath);

    // Find the specific class by name to handle multiple classes in the same file
    const classDeclaration = sourceFile.getClass(modelClassName);

    if (!classDeclaration) {
      console.error(`Class ${modelClassName} not found in ${modelPath}`);
      return null;
    }

    const sourceProperty = classDeclaration.getProperty(sourceFieldName);
    const targetProperty = classDeclaration.getProperty(targetFieldName);

    if (!sourceProperty || !targetProperty) {
      console.error(`Could not find source or target property in ${classDeclaration.getName()}`);
      return null;
    }

    // 1. Get the structure of the source property including decorators
    const sourceStructure = sourceProperty.getStructure();
    const targetIndex = targetProperty.getChildIndex();

    // 2. Remove the original property
    sourceProperty.remove();

    // 3. Insert the property at the target position using the structure
    // This preserves the original formatting without adding extra indentation
    classDeclaration.insertProperty(targetIndex, sourceStructure);

    // await sourceFile.save();
    return sourceFile.getFullText();
  }

  /**
   * Returns the children of the given element in the tree.
   * If no element is provided, it returns the root items (Model and UI).
   * @param element The parent element to get children for, or undefined for root.
   */
  async getChildren(element?: AppTreeItem): Promise<AppTreeItem[]> {
    if (!element) {
      // Root level: Data and Data Sources
      return [
          new AppTreeItem("Data", vscode.TreeItemCollapsibleState.Expanded, "dataRoot", this.extensionUri),
          new AppTreeItem("Data Sources", vscode.TreeItemCollapsibleState.Collapsed, "dataSourcesRoot", this.extensionUri, undefined, undefined, undefined, this.isDatasetDesynchronized)
      ];
    }

    // --- DATA ROOT ---
    if (element.itemType === "dataRoot") {
      return await this.getDataRootChildren();
    }

    // --- FOLDER ---
    if (element.itemType === "folder") {
      return await this.getFolderChildren(element);
    }

    // --- DATA SOURCES ROOT ---
    if (element.itemType === "dataSourcesRoot") {
        const dataSources = this.cache.getDataSources();
        return dataSources.map(ds => {
            const item = new AppTreeItem(ds.name, vscode.TreeItemCollapsibleState.Collapsed, "dataSource", this.extensionUri, ds, undefined, undefined, this.isDatasetDesynchronized);
            item.command = {
                command: "slingr-vscode-extension.handleTreeItemClick",
                title: "Handle Click",
                arguments: [item],
            };
            return item;
        });
    }

    if (element.itemType === "dataSource" && element.metadata && 'datasets' in element.metadata) {
      return this.getDataSourceChildren(element.metadata);
    }

    if (element.itemType === "dataset" && element.metadata && 'files' in element.metadata) {
        return this.getDatasetChildren(element.metadata as DatasetMetadata);
    }
    
    // --- Children of a specific Model ---
    if (element.itemType === "model" && this.isDecoratedClass(element.metadata)) {
      const modelClass = element.metadata;

      const fields = Object.values(element.metadata.properties).filter((prop) =>
        prop.decorators.some((d) => d.name === "Field")
      );

      return fields.map((field) => {
        if (
          field.decorators.some(
            (d) =>
              d.name === "Relationship" &&
              d.arguments.some((arg) => arg.type === "Composition" || arg.type === "composition")
          )
        ) {
          const relationshipType = this.extractBaseTypeFromArrayType(field.type);
          const relatedModel = this.cache.getDataModelClasses().find((model) => model.name === relationshipType);
          const upperFieldName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
          const compositionItem = new AppTreeItem(
            upperFieldName,
            vscode.TreeItemCollapsibleState.Collapsed,
            "model",
            this.extensionUri,
            relatedModel,
            element
          );
          
          // Set command for click handling (single vs double-click detection)
          if (relatedModel) {
            compositionItem.command = {
              command: "slingr-vscode-extension.handleTreeItemClick",
              title: "Handle Click",
              arguments: [compositionItem],
            };
          }

          return compositionItem;
        } else {
          return this.mapPropertyToTreeItem(field, "field", element);
        }
      });
    }

    return []; // Default empty
  }

  private getDataSourceChildren(dataSource: DataSourceMetadata): AppTreeItem[] {
    return dataSource.datasets.map(dataset => {
        const collapsibleState = dataset.files.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        return new AppTreeItem(dataset.name, collapsibleState, "dataset", this.extensionUri, dataset);
    });
}

private getDatasetChildren(dataset: DatasetMetadata): AppTreeItem[] {
    return dataset.files.map(file => {
        const item = new AppTreeItem(file.name, vscode.TreeItemCollapsibleState.None, "datasetFile", this.extensionUri, file);
        item.command = {
            command: "slingr-vscode-extension.handleTreeItemClick",
            title: "Handle Click",
            arguments: [item],
        };
        return item;
    });
}


  /**
   * Gets the children for the data root, which includes folders and models in the src/data directory
   */
  private async getDataRootChildren(): Promise<AppTreeItem[]> {
    try {
      const models = this.cache.getDataModelClasses();
      const folderStructure = await this.getCachedFolderStructure(models);

      return this.createTreeItemsFromStructure(folderStructure, "");
    } catch (error) {
      console.error("[Explorer] Error getting data root children:", error);
      return [];
    }
  }

  /**
   * Gets the children for a specific folder
   */
  private async getFolderChildren(folderElement: AppTreeItem): Promise<AppTreeItem[]> {
    try {
      const models = this.cache.getDataModelClasses();
      const folderPath = folderElement.folderPath || "";
      const folderStructure = await this.getCachedFolderStructure(models);

      return this.createTreeItemsFromStructure(folderStructure, folderPath);
    } catch (error) {
      console.error("[Explorer] Error getting folder children:", error);
      return []; 
    }
  }

  /**
   * Gets the cached folder structure, building it if not cached
   */
  private async getCachedFolderStructure(models: DecoratedClass[]): Promise<FolderNode> {
    try {
      if (!this.explorerCache.folderStructure) {
        this.explorerCache.folderStructure = await this.buildFolderStructure(models);
      }
      // Ensure the structure is valid
      if (!this.explorerCache.folderStructure || !this.explorerCache.folderStructure.folders) {
        console.warn("[Explorer] Cached folder structure is invalid, rebuilding...");
        this.explorerCache.folderStructure = await this.buildFolderStructure(models);
      }
      return this.explorerCache.folderStructure;
    } catch (error) {
      console.error("[Explorer] Error getting folder structure:", error);
      return { folders: new Map(), models: [] };
    }
  }

  /**
   * Builds a hierarchical folder structure from model file paths
   */
  private async buildFolderStructure(models: DecoratedClass[]): Promise<FolderNode> {
    const root: FolderNode = { folders: new Map(), models: [] };

    for (const model of models) {
      const filePath = model.declaration.uri.fsPath;

      // Extract the relative path from src/data/ (handle both Unix and Windows paths)
      const srcDataPattern = /[\/\\]src[\/\\]data[\/\\]/;
      const match = filePath.match(srcDataPattern);
      if (!match) {
        continue;
      }

      const dataIndex = filePath.indexOf(match[0]);
      const relativePath = filePath.substring(dataIndex + match[0].length);
      const pathParts = relativePath.split(/[\/\\]/);

      // Remove the file name (last part)
      const fileName = pathParts.pop();

      if (pathParts.length === 0) {
        // Model is directly in src/data/
        root.models.push(model);
      } else {
        // Model is in a subfolder
        let currentNode = root;
        let currentPath = "";

        for (const part of pathParts) {
          currentPath = currentPath ? `${currentPath}${path.sep}${part}` : part;

          if (!currentNode.folders.has(part)) {
            currentNode.folders.set(part, { folders: new Map(), models: [] });
          }
          currentNode = currentNode.folders.get(part)!;
        }

        currentNode.models.push(model);
      }
    }
    // Also add empty directories from the filesystem
    await this.addEmptyDirectoriesToStructure(root);

    return root;
  }

  /**
   * Recursively scans the src/data directory and adds empty directories to the folder structure
   */
  private async addEmptyDirectoriesToStructure(root: FolderNode): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const srcDataPath = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    try {
      await fsPromises.access(srcDataPath);
    } catch {
      return; // Directory doesn't exist
    }

    await this.scanDirectoryRecursively(srcDataPath, root, '');
  }

  /**
   * Recursively scans a directory and adds empty folders to the structure
   */
  private async scanDirectoryRecursively(dirPath: string, currentNode: FolderNode, relativePath: string): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name;
          const fullPath = path.join(dirPath, folderName);
          const newRelativePath = relativePath ? `${relativePath}${path.sep}${folderName}` : folderName;

          // Add folder to structure if it doesn't exist
          if (!currentNode.folders.has(folderName)) {
            currentNode.folders.set(folderName, { folders: new Map(), models: [] });
          }

          // Recursively scan subdirectories
          const folderNode = currentNode.folders.get(folderName)!;
          await this.scanDirectoryRecursively(fullPath, folderNode, newRelativePath);
        }
      }
    } catch (error) {
      // Silently ignore permission errors or other issues
      console.warn(`Could not scan directory ${dirPath}:`, error);
    }
  }

  /**
   * Creates tree items from the folder structure
   */
  private createTreeItemsFromStructure(structure: FolderNode, basePath: string): AppTreeItem[] {
    const items: AppTreeItem[] = [];

    if (!structure || !structure.folders) {
      console.warn("[Explorer] Folder structure is undefined or invalid, returning empty items");
      return items;
    }

    // Get the current node for the given base path
    let currentNode = structure;
    if (basePath) {
      const pathParts = basePath.split(/[\/\\]/);
      for (const part of pathParts) {
        if (!currentNode.folders) {
          console.warn("[Explorer] Current node has no folders property, returning empty items");
          return items;
        }
        const nextNode = currentNode.folders.get(part);
        if (!nextNode) {
          return items; // Path not found
        }
        currentNode = nextNode;
      }
    }

    if (!currentNode.folders) {
      console.warn("[Explorer] Current node has no folders property after path traversal, returning empty items");
      return items;
    }

    // Add folders (sorted alphabetically)
    const sortedFolders = Array.from(currentNode.folders.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [folderName, folderNode] of sortedFolders) {
      const folderPath = basePath ? `${basePath}${path.sep}${folderName}` : folderName;
      const hasChildren = folderNode.folders.size > 0 || folderNode.models.length > 0;

      items.push(
        new AppTreeItem(
          folderName,
          hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          "folder",
          this.extensionUri,
          undefined, 
          undefined, 
          folderPath 
        )
      );
    }

    // Add models (sorted alphabetically by label)
    const sortedModels = currentNode.models.sort((a, b) => {
      const aDecorator = a.decorators.find((d) => d.name === "Model");
      const aLabel = aDecorator?.arguments[0]?.label || a.name;
      const bDecorator = b.decorators.find((d) => d.name === "Model");
      const bLabel = bDecorator?.arguments[0]?.label || b.name;
      return aLabel.localeCompare(bLabel);
    });

    for (const model of sortedModels) {
      const decorator = model.decorators.find((d) => d.name === "Model");
      const label = decorator?.arguments[0]?.label || model.name;

      // Only show models that are NOT referenced by composition relationships
      if (!this.isModelReferencedByCompositionCached(model)) {
        const modelItem = new AppTreeItem(label, vscode.TreeItemCollapsibleState.Collapsed, "model", this.extensionUri, model);
        
        // Set command for click handling (single vs double-click detection)
        modelItem.command = {
          command: "slingr-vscode-extension.handleTreeItemClick",
          title: "Handle Click",
          arguments: [modelItem],
        };

        items.push(modelItem);
      }
    }

    return items;
  }

  private mapPropertyToTreeItem(propData: PropertyMetadata, itemType: string, parent?: AppTreeItem): AppTreeItem {
    const upperFieldName = propData.name.charAt(0).toUpperCase() + propData.name.slice(1);

    const item = new AppTreeItem(
      upperFieldName,
      vscode.TreeItemCollapsibleState.None,
      itemType,
      this.extensionUri,
      propData,
      parent
    );
    // Set command for click handling (single vs double-click detection)
    item.command = {
      command: "slingr-vscode-extension.handleTreeItemClick",
      title: "Handle Click",
      arguments: [item],
    };
    return item;
  }

  getParent(element: AppTreeItem): vscode.ProviderResult<AppTreeItem> {
    // This can be implemented if needed for more complex tree interactions
    return null;
  }

  private isDecoratedClass(item: any): item is DecoratedClass {
    return (
      item &&
      typeof item === "object" &&
      "name" in item &&
      "decorators" in item &&
      "properties" in item &&
      "declaration" in item
    );
  }

  /**
   * Cached version of isModelReferencedByComposition for better performance
   */
  private isModelReferencedByCompositionCached(item: DecoratedClass): boolean {
    if (!this.explorerCache.compositionModelReferences) {
      this.buildCompositionModelReferencesCache();
    }
    return this.explorerCache.compositionModelReferences!.has(item.name);
  }

  /**
   * Builds a cache of all models that are referenced by composition relationships
   */
  private buildCompositionModelReferencesCache(): void {
    const compositionModels = new Set<string>();
    const allModels = this.cache.getDataModelClasses();
    
    for (const model of allModels) {
      // Check all properties of this model
      for (const property of Object.values(model.properties)) {
        // Check if this property has a @Field decorator (indicating it's a field)
        const hasFieldDecorator = property.decorators.some((d) => d.name === "Field");
        
        if (hasFieldDecorator) {
          // Check if this property has a @Relationship decorator with type: "Composition"
          const relationshipDecorator = property.decorators.find((d) => d.name === "Relationship");
          
          if (relationshipDecorator) {
            // Check if the relationship decorator has type: "Composition" or "composition"
            const hasCompositionType = relationshipDecorator.arguments.some(
              (arg) => {
                if (typeof arg === "object" && arg !== null) {
                  return arg.type === "Composition" || arg.type === "composition";
                }
                return arg === "Composition" || arg === "composition";
              }
            );

            if (hasCompositionType) {
              // Extract the base type from the property type and add to cache
              const baseType = this.extractBaseTypeFromArrayType(property.type);
              compositionModels.add(baseType);
            }
          }
        }
      }
    }
    
    this.explorerCache.compositionModelReferences = compositionModels;
  }

  /**
   * Extracts the base type from array types.
   * For example, "Note[]" becomes "Note", "string" remains "string"
   * @param type The type string that might be an array type
   * @returns The base type without array brackets
   */
  private extractBaseTypeFromArrayType(type: string): string {
    // Remove array brackets if present
    if (type.endsWith("[]")) {
      return type.slice(0, -2);
    }
    return type;
  }
}
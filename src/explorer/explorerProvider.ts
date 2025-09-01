import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass, DecoratorMetadata, PropertyMetadata } from "../cache/cache";
import { AppTreeItem } from "./appTreeItem";

// Interface for folder structure
interface FolderNode {
  folders: Map<string, FolderNode>;
  models: DecoratedClass[];
}

export class ExplorerProvider
  implements vscode.TreeDataProvider<AppTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<AppTreeItem | undefined | null | void> = new vscode.EventEmitter<
    AppTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<AppTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private cache: MetadataCache, private extensionUri: vscode.Uri) {
    // --- Listen for the cache's update event ---
    this.cache.onDidUpdate(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AppTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Returns the children of the given element in the tree.
   * If no element is provided, it returns the root items (Model and UI).
   * @param element The parent element to get children for, or undefined for root.
   */
  async getChildren(element?: AppTreeItem): Promise<AppTreeItem[]> {
    if (!element) {
      // Root level: Data
      return [new AppTreeItem("Data", vscode.TreeItemCollapsibleState.Expanded, "dataRoot", this.extensionUri)];
    }

    // --- DATA ROOT ---
    if (element.itemType === "dataRoot") {
      return this.getDataRootChildren();
    }

    // --- FOLDER ---
    if (element.itemType === "folder") {
      return this.getFolderChildren(element);
    }

    // --- Children of a specific Model ---
    if (element.itemType === "model" && element.metadata && 'properties' in element.metadata) {
      return this.getModelChildren(element.metadata as DecoratedClass);
    }

    return [];
  }

  /**
   * Gets children for the data root, which shows the folder structure of models
   */
  private getDataRootChildren(): AppTreeItem[] {
    const models = this.cache.getDataModelClasses();
    
    if (models.length === 0) {
      return [];
    }

    // Build folder structure
    const rootFolder = this.buildFolderStructure(models);
    
    // Create tree items from the folder structure
    return this.createTreeItemsFromStructure(rootFolder, "src/data");
  }

  /**
   * Gets children for a folder item
   */
  private getFolderChildren(element: AppTreeItem): AppTreeItem[] {
    if (!element.metadata || !('folders' in element.metadata) || !('models' in element.metadata)) {
      return [];
    }
    const folderStructure = element.metadata as unknown as FolderNode;
    return this.createTreeItemsFromStructure(folderStructure, element.label as string);
  }

  /**
   * Gets children for a model, which are its fields/properties
   */
  private getModelChildren(model: DecoratedClass): AppTreeItem[] {
    const items: AppTreeItem[] = [];
    
    // Add fields/properties
    for (const [propertyName, property] of Object.entries(model.properties)) {
      const propertyItem = new AppTreeItem(
        `${propertyName}: ${property.type}`,
        vscode.TreeItemCollapsibleState.None,
        "field",
        this.extensionUri,
        property
      );

      // Add navigation command to go to property definition when clicked
      propertyItem.command = {
        command: "slingr-vscode-extension.navigateToCode",
        title: "Go to Definition",
        arguments: [property.declaration],
      };

      items.push(propertyItem);
    }

    return items;
  }

  /**
   * Builds a folder structure from the list of models
   */
  private buildFolderStructure(models: DecoratedClass[]): FolderNode {
    const rootFolder: FolderNode = {
      folders: new Map(),
      models: []
    };

    for (const model of models) {
      const filePath = model.declaration.uri.fsPath;
      const relativePath = path.relative(path.join(process.cwd(), "src", "data"), filePath);
      const pathParts = relativePath.split(path.sep);
      
      // Remove the filename to get just the folder path
      pathParts.pop();
      
      let currentFolder = rootFolder;
      
      // Navigate/create the folder structure
      for (const part of pathParts) {
        if (part === "" || part === ".") {
          continue;
        }
        
        if (!currentFolder.folders.has(part)) {
          currentFolder.folders.set(part, {
            folders: new Map(),
            models: []
          });
        }
        currentFolder = currentFolder.folders.get(part)!;
      }
      
      // Add the model to the appropriate folder
      currentFolder.models.push(model);
    }

    return rootFolder;
  }

  /**
   * Creates tree items from the folder structure
   */
  private createTreeItemsFromStructure(structure: FolderNode, basePath: string): AppTreeItem[] {
    const items: AppTreeItem[] = [];

    // Add folders first
    for (const [folderName, subFolder] of structure.folders) {
      const folderItem = new AppTreeItem(
        folderName,
        vscode.TreeItemCollapsibleState.Collapsed,
        "folder",
        this.extensionUri,
        subFolder as any
      );
      items.push(folderItem);
    }

    // Add models
    for (const model of structure.models) {
      const modelItem = new AppTreeItem(
        model.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        "model",
        this.extensionUri,
        model
      );

      // Add navigation command to go to model definition when clicked
      modelItem.command = {
        command: "slingr-vscode-extension.navigateToCode",
        title: "Go to Definition",
        arguments: [model.declaration],
      };

      items.push(modelItem);
    }

    return items;
  }

  /**
   * Extracts base type from array type notation
   * For example: "User[]" -> "User", "string" -> "string"
   */
  private extractBaseTypeFromArrayType(type: string): string {
    return type.replace(/\[\]$/, '');
  }
}
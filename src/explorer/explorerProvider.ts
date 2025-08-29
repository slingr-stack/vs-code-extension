// Add vscode.TreeDragAndDropController to the import
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
// Add Project from ts-morph for the reordering logic
import { Project, IndentationText } from "ts-morph";
import { MetadataCache, DecoratedClass, DecoratorMetadata, PropertyMetadata } from "../cache/cache";
import { AppTreeItem } from "./appTreeItem";

// Define a custom MIME type for our drag-and-drop operation
const FIELD_MIME_TYPE = "application/vnd.slingr-vscode-extension.field";

// Interface for folder structure
interface FolderNode {
  folders: Map<string, FolderNode>;
  models: DecoratedClass[];
}

export class ExplorerProvider
  implements vscode.TreeDataProvider<AppTreeItem>, vscode.TreeDragAndDropController<AppTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<AppTreeItem | undefined | null | void> = new vscode.EventEmitter<
    AppTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<AppTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  public dragMimeTypes: readonly string[] = [FIELD_MIME_TYPE];
  public dropMimeTypes: readonly string[] = [FIELD_MIME_TYPE];

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

    // We can drag fields or composition models
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
    } else if (draggedItem.itemType === "model" && draggedItem.parent && draggedItem.parent.itemType === "model") {
      // This is a composition model (nested model within another model)
      // The parent contains the host model's metadata
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
    }
  }

  async handleDrop(
    target: AppTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get(FIELD_MIME_TYPE);
    if (!transferItem) {
      return; // Not a valid drop
    }

    const draggedData = transferItem.value;

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
      // Root level: Data - include the src/data path as folderPath
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const dataRootPath = workspaceFolder ? path.join(workspaceFolder.uri.fsPath, 'src', 'data') : undefined;
      return [new AppTreeItem("Data", vscode.TreeItemCollapsibleState.Expanded, "dataRoot", this.extensionUri, undefined, undefined, dataRootPath)];
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

          // Add navigation command to go to related model definition when clicked
          if (relatedModel) {
            compositionItem.command = {
              command: "slingr-vscode-extension.navigateToCode",
              title: "Go to Definition",
              arguments: [relatedModel.declaration],
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

  /**
   * Gets the children for the data root, which includes folders and models in the src/data directory
   */
  private getDataRootChildren(): AppTreeItem[] {
    const models = this.cache.getDataModelClasses();
    const folderStructure = this.buildFolderStructure(models);

    return this.createTreeItemsFromStructure(folderStructure, "");
  }

  /**
   * Gets the children for a specific folder
   */
  private getFolderChildren(folderElement: AppTreeItem): AppTreeItem[] {
    const models = this.cache.getDataModelClasses();
    const folderPath = folderElement.folderPath || ""; // Use folderPath property
    const folderStructure = this.buildFolderStructure(models);

    return this.createTreeItemsFromStructure(folderStructure, folderPath);
  }

  /**
   * Builds a hierarchical folder structure from model file paths and actual file system folders
   */
  private buildFolderStructure(models: DecoratedClass[]): FolderNode {
    const root: FolderNode = { folders: new Map(), models: [] };

    // First, build structure from models
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
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          if (!currentNode.folders.has(part)) {
            currentNode.folders.set(part, { folders: new Map(), models: [] });
          }
          currentNode = currentNode.folders.get(part)!;
        }

        currentNode.models.push(model);
      }
    }

    // Now add empty directories from the file system
    this.addEmptyDirectoriesToStructure(root);

    return root;
  }

  /**
   * Recursively scans the src/data directory and adds empty directories to the folder structure
   */
  private addEmptyDirectoriesToStructure(root: FolderNode): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const srcDataPath = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
    if (!fs.existsSync(srcDataPath)) {
      return;
    }

    this.scanDirectoryRecursively(srcDataPath, root, '');
  }

  /**
   * Recursively scans a directory and adds empty folders to the structure
   */
  private scanDirectoryRecursively(dirPath: string, currentNode: FolderNode, relativePath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name;
          const fullPath = path.join(dirPath, folderName);
          const newRelativePath = relativePath ? `${relativePath}/${folderName}` : folderName;

          // Add folder to structure if it doesn't exist
          if (!currentNode.folders.has(folderName)) {
            currentNode.folders.set(folderName, { folders: new Map(), models: [] });
          }

          // Recursively scan subdirectories
          const folderNode = currentNode.folders.get(folderName)!;
          this.scanDirectoryRecursively(fullPath, folderNode, newRelativePath);
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

    // Get the current node for the given base path
    let currentNode = structure;
    if (basePath) {
      const pathParts = basePath.split("/");
      for (const part of pathParts) {
        const nextNode = currentNode.folders.get(part);
        if (!nextNode) {
          return items; // Path not found
        }
        currentNode = nextNode;
      }
    }

    // Add folders (sorted alphabetically)
    const sortedFolders = Array.from(currentNode.folders.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [folderName, folderNode] of sortedFolders) {
      const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
      const hasChildren = folderNode.folders.size > 0 || folderNode.models.length > 0;

      items.push(
        new AppTreeItem(
          folderName,
          hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          "folder",
          this.extensionUri,
          undefined, // No metadata for folders
          undefined, // No parent for now
          folderPath // Store folder path in folderPath property
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
      if (!this.isModelReferencedByComposition(model)) {
        const modelItem = new AppTreeItem(
          label,
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
    item.command = {
      command: "slingr-vscode-extension.navigateToCode",
      title: "Go to Definition",
      arguments: [propData.declaration],
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

  private isModelReferencedByComposition(item: DecoratedClass): boolean {
    // Get all references to this model
    const modelReferences = item.references;
    const checkedFiles = new Set<string>();

    // For each external reference, check if it's part of a composition relationship
    for (const reference of modelReferences) {
      // Get the file metadata for the reference
      const referencingFile = this.cache.getMetadataForFile(reference.uri.fsPath);
      if (!referencingFile) {
        continue;
      }

      if (reference.uri.fsPath !== item.declaration.uri.fsPath && !checkedFiles.has(reference.uri.fsPath)) {
        for (const referencingClass of Object.values(referencingFile.classes)) {
          // Search through all properties in the class
          for (const property of Object.values(referencingClass.properties)) {
            // Check if this property references our model type
            const lowerItemName = item.name.toLowerCase();
            if (property.type === item.name || property.type === `${item.name}[]` || property.type.toLowerCase() === lowerItemName) {
              // Check if this property has a @Relationship decorator with type: "Composition"
              const relationshipDecorator = property.decorators.find((d) => d.name === "Relationship");
              if (relationshipDecorator) {
                // Check if the relationship decorator has type: "Composition"
                const hasCompositionType = relationshipDecorator.arguments.some(
                  (arg) =>
                    (typeof arg === "object" && arg !== null && "type" in arg && arg.type === "Composition") ||
                    arg.type === "composition"
                );

                if (hasCompositionType) {
                  return true;
                }
              }
            }
          }
        }
        checkedFiles.add(reference.uri.fsPath);
      }
    }

    return false;
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

// Add vscode.TreeDragAndDropController to the import
import * as vscode from "vscode";
// Add Project from ts-morph for the reordering logic
import { Project, IndentationText } from "ts-morph";
import { MetadataCache, DecoratedClass, DecoratorMetadata, PropertyMetadata } from "../cache/cache";
import { AppTreeItem } from "./appTreeItem";

// Define a custom MIME type for our drag-and-drop operation
const FIELD_MIME_TYPE = "application/vnd.ts-app-extension.field";

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

    // We can only drag fields
    if (draggedItem.itemType === "field" && draggedItem.metadata && "name" in draggedItem.metadata) {
      // The parent of a field item is the 'entityFieldsFolder', which holds the entity's metadata
      const entityFilePath = draggedItem.parent?.metadata?.declaration.uri.fsPath;
      if (entityFilePath) {
        dataTransfer.set(
          FIELD_MIME_TYPE,
          new vscode.DataTransferItem({
            field: draggedItem.metadata.name,
            entityPath: entityFilePath,
          })
        );
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

    // Ensure we have a valid target to drop onto
    if (!target || target.itemType !== "field" || !target.metadata || !("name" in target.metadata)) {
      vscode.window.showWarningMessage("A field can only be dropped onto another field.");
      return;
    }

    const targetEntityPath = target.parent?.metadata?.declaration.uri.fsPath;

    // Validate the drop operation
    if (draggedData.entityPath !== targetEntityPath) {
      vscode.window.showWarningMessage("Fields can only be reordered within the same entity.");
      return;
    }

    if (draggedData.field === target.metadata.name) {
      return; // Dropped on itself
    }

    // Perform the reordering
    try {
      // 1. Get the new text from ts-morph *without saving*.
      const newText = await this.reorderFieldsAndGetText(
        draggedData.entityPath,
        draggedData.field,
        target.metadata.name
      );

      if (newText === null) {
        vscode.window.showErrorMessage("Failed to reorder fields.");
        return;
      }

      // 2. Apply the changes to the editor and format.
      const uri = vscode.Uri.file(draggedData.entityPath);
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
   * Reorders fields in the entity class file and returns the updated text.
   * This function uses ts-morph to manipulate the source code without saving it.
   * @param entityPath The path to the entity class file.
   * @param sourceFieldName The name of the field to move.
   * @param targetFieldName The name of the field to move before.
   * @returns The updated source code as a string, or null if an error occurs.
   */
  private async reorderFieldsAndGetText(
    entityPath: string,
    sourceFieldName: string,
    targetFieldName: string
  ): Promise<string | null> {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(entityPath);

    // For simplicity, we assume one class per file. A more robust solution
    // would identify the correct class if there are multiple.
    const classDeclaration = sourceFile.getClasses()[0];

    if (!classDeclaration) {
      console.error(`No class found in ${entityPath}`);
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
      // Root level: Model and UI
      return [
        new AppTreeItem("Data", vscode.TreeItemCollapsibleState.Expanded, "dataRoot", this.extensionUri),
      ];
    }

    // --- MODEL ---
    if (element.itemType === "dataRoot") {
      // Fetch only entities from the src/data folder (data entities)
      const entities = this.cache.getDataEntityClasses();
      return entities.map((entity) => {
      const decorator = entity.decorators.find((d) => d.name === "Entity");
      const label = decorator?.arguments[0]?.label || entity.name;
      return new AppTreeItem(
        label,
        vscode.TreeItemCollapsibleState.Collapsed,
        "entity",
        this.extensionUri,
        entity
      );
      });
    }

    // --- Children of a specific Entity ---
    if (element.itemType === "entity" && this.isDecoratedClass(element.metadata)) {
      const entityClass = element.metadata;

      const fields = Object.values(element.metadata.properties).filter((prop) =>
        prop.decorators.some((d) => d.name === "Field")
      );
      return fields.map((field) => this.mapPropertyToTreeItem(field, "field", element));
    }

    return []; // Default empty
  }

  private mapPropertyToTreeItem(propData: PropertyMetadata, itemType: string, parent?: AppTreeItem): AppTreeItem {
    const decorator = propData.decorators.find((d) => d.name === "Field");
    const label = decorator?.arguments[0]?.label || propData.name;

    const item = new AppTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      itemType,
      this.extensionUri,
      propData,
      parent
    );
    item.command = {
      command: "ts-app-extension.navigateToCode",
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
}

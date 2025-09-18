import * as vscode from "vscode";
import { DataSourceMetadata, DecoratedClass, PropertyMetadata, DatasetFileMetadata, DatasetMetadata } from "../cache/cache";

export class AppTreeItem extends vscode.TreeItem {
  public folderPath?: string; // Add folder path property for folder items
  
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string,
    private readonly extensionUri: vscode.Uri,
    public readonly metadata?: DecoratedClass | PropertyMetadata | DataSourceMetadata | DatasetMetadata | DatasetFileMetadata,
    public readonly parent?: AppTreeItem,
    folderPath?: string,
    public readonly isDesynchronized: boolean = false 
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
    this.folderPath = folderPath;

    if (this.isDesynchronized) {
      this.description = "⚠️ OUT OF SYNC";
      this.tooltip = "Datasets are out of sync with the data model. Click to update datasets.";
      
      // Use a warning context value for potential styling extensions
      this.contextValue = `${itemType}-warning`;
    }

    // Icon logic
    if (!this.extensionUri) {
      console.warn(`[MyTreeItem] Extension URI not provided for item: "${label}". Local icons will not be loaded.`);
    } else {
      let iconFileName = "";
      // Icon assignment based on itemType
      switch (this.itemType) {
        case "dataRoot":
          iconFileName = "model.svg";
          break;
        case "folder":
          iconFileName = "folder.svg";
          break;
        case "modelsFolder":
          iconFileName = "folder.svg";
          break;
        case "model":
          iconFileName = "model-type.svg";
          break;
        case "modelFieldsFolder":
          iconFileName = "folder.svg";
          break;
        case "dataSourcesRoot":
            iconFileName = "database.svg";
            if (this.isDesynchronized) {
                iconFileName = "database-warning.svg";
            }
            break;
        case "dataSource":
            iconFileName = "database.svg";
            if (this.isDesynchronized) {
                iconFileName = "database-warning.svg";
            }
            break;
        case "dataset":
          iconFileName = "dataset.svg";
          break;
        case "datasetFile":
          iconFileName = "dataset-file.svg";
          break;
        case "field":
          iconFileName = "field.svg";
          break;
        case "modelActionsFolder":
          iconFileName = "action.svg";
          break;
        case "actionsFolder":
          iconFileName = "action.svg";
          break;
        case "globalActionsFolder":
          iconFileName = "folder.svg";
          break;
        case "actionModelLink":
          iconFileName = "folder.svg";
          break;
        case "action":
          iconFileName = "action.svg";
          break;
        case "modelViewsFolder":
          iconFileName = "eye.svg";
          break;
        case "viewsByModelFolder":
          iconFileName = "folder.svg";
          break;
        case "viewModelLink":
          iconFileName = "folder.svg";
          break;
        case "view":
          iconFileName = "eye.svg";
          break;
        case "groupsFolder":
          iconFileName = "folder.svg";
          break;
        case "group":
          iconFileName = "group.svg";
          break;

        case "modelActionsRoot":
          iconFileName = "action.svg";
          break;
        case "actionsByModelFolder":
          iconFileName = "folder.svg";
          break;
        case "actionsGlobalFolder":
          iconFileName = "global-type.svg";
          break;
        case "globalAction":
          iconFileName = "action.svg";
          break;
        case "modelLinkForActions":
          iconFileName = "folder.svg";
          break;
        case "uiRoot":
          iconFileName = "eye.svg";
          break;
        case "uiByTypeFolder":
          iconFileName = "folder.svg";
          break;
        case "uiByModelFolder":
          iconFileName = "folder.svg";
          break;
        case "uiRecordViewsFolder":
          iconFileName = "eye.svg";
          break;
        case "uiGridViewsFolder":
          iconFileName = "eye.svg";
          break;
        case "modelLinkForUiViews":
          iconFileName = "eye.svg";
          break;

        case "error":
          iconFileName = "error.svg";
          break;
        default:
          iconFileName = "default.svg";
          break;
      }

      if (iconFileName) {
        this.iconPath = {
          light: vscode.Uri.joinPath(this.extensionUri, "resources", "icons", "light", iconFileName),
          dark: vscode.Uri.joinPath(this.extensionUri, "resources", "icons", "dark", iconFileName),
        };
      }
    }
  }
}
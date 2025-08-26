import * as vscode from "vscode";
import { DecoratedClass, PropertyMetadata } from "../cache/cache";

export class AppTreeItem extends vscode.TreeItem {
  public folderPath?: string; // Add folder path property for folder items
  
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string,
    private readonly extensionUri: vscode.Uri,
    public readonly metadata?: DecoratedClass | PropertyMetadata,
    public readonly parent?: AppTreeItem,
    folderPath?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
    this.folderPath = folderPath;

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
        case "entitiesFolder":
          iconFileName = "folder.svg";
          break;
        case "model":
          iconFileName = "model-type.svg";
          break;
        case "modelFieldsFolder":
          iconFileName = "folder.svg";
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

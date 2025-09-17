import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { AddCompositionTool } from "../models/addComposition";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { TreeViewContext } from "../commandHelpers";
import * as path from "path";

export class ExtractFieldsToCompositionTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private addCompositionTool: AddCompositionTool;
  private addFieldTool: AddFieldTool;
  private deleteFieldTool: DeleteFieldTool;

  constructor() {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.addCompositionTool = new AddCompositionTool();
    this.addFieldTool = new AddFieldTool();
    this.deleteFieldTool = new DeleteFieldTool();
  }

  public async extractFieldsToComposition(
    cache: MetadataCache,
    editor: vscode.TextEditor,
    modelName: string,
    treeViewContext?: { fieldItems: TreeViewContext["fieldItems"] }
  ): Promise<void> {
    try {
      const { document, selections } = editor;
      const sourceModel = cache.getModelByName(modelName);
      if (!sourceModel) {
        throw new Error("Could not find a model class in the current file.");
      }

      let selectedFields: PropertyMetadata[];

      if (treeViewContext?.fieldItems && treeViewContext.fieldItems.length > 0) {
        // Tree view context: use the selected field items
        selectedFields = treeViewContext.fieldItems.map((fieldItem) => {
          //to lowercase
          const fieldItemName = fieldItem.label.toLowerCase();
          const field = Object.values(sourceModel.properties).find((prop) => prop.name === fieldItemName);
          if (!field) {
            throw new Error(`Could not find field '${fieldItem.label}' in model '${modelName}'`);
          }
          return field;
        });
      } else {
        // Editor context: use text selections
        selectedFields = this.getSelectedFields(sourceModel, selections);
      }

      if (selectedFields.length === 0) {
        vscode.window.showInformationMessage("No fields selected.");
        return;
      }

      const compositionFieldName = await this.userInputService.showPrompt(
        "Enter the name for the new composition field (e.g., 'address', 'contactInfo'):"
      );
      if (!compositionFieldName) {
        return;
      }

      // Store field information before deletion
      const fieldsToAdd = selectedFields.map((field) => this.propertyMetadataToFieldInfo(field));

      // Use AddCompositionTool to create the composition relationship and inner model
      const createdModelName = await this.addCompositionTool.addCompositionProgrammatically(
        cache,
        modelName,
        compositionFieldName
      );

      const compModelUri = sourceModel.declaration.uri;
      const newModelName = this.toPascalCase(compositionFieldName);

      // Add the extracted fields to the new composition model
      for (const fieldInfo of fieldsToAdd) {
        await this.addFieldTool.addFieldProgrammatically(
          compModelUri,
          fieldInfo,
          newModelName,
          cache,
          true // Skip validation since we're programmatically adding
        );
      }

      // Remove the fields from the source model
      for (const field of selectedFields) {
        const deleteEdit = await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache);
        if (deleteEdit) {
          await vscode.workspace.applyEdit(deleteEdit);
        }
      }

      vscode.window.showInformationMessage(
        `Fields extracted to new composition model '${createdModelName}' and linked via '${compositionFieldName}' field.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to extract fields to composition: ${error}`);
      console.error("Error extracting fields to composition:", error);
    }
  }

  private getSelectedFields(model: DecoratedClass, selections: readonly vscode.Selection[]): PropertyMetadata[] {
    const selectedFields: PropertyMetadata[] = [];
    for (const selection of selections) {
      for (const field of Object.values(model.properties)) {
        if (selection.intersection(field.declaration.range)) {
          selectedFields.push(field);
        }
      }
    }
    return selectedFields;
  }

  private propertyMetadataToFieldInfo(property: PropertyMetadata): FieldInfo {
    const fieldType =
      FIELD_TYPE_OPTIONS.find((o) => o.decorator === this.getDecoratorName(property.decorators)) ||
      FIELD_TYPE_OPTIONS[0];
    const fieldDecorator = property.decorators.find((d) => d.name === "Field");
    const isRequired = fieldDecorator?.arguments.some((arg: any) => arg.required === true) || false;

    return {
      name: property.name,
      type: fieldType,
      required: isRequired,
    };
  }

  private getDecoratorName(decorators: any[]): string {
    const typeDecorator = decorators.find((d) => FIELD_TYPE_OPTIONS.some((o) => o.decorator === d.name));
    return typeDecorator ? typeDecorator.name : "Text";
  }

  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

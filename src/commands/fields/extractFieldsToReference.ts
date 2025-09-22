import * as vscode from "vscode";
import {
  ChangeObject,
  ManualRefactorContext,
  ExtractFieldsToReferencePayload,
} from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { NewModelTool } from "../models/newModel";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { ExtractFieldsController } from "./extractFieldsController";
import * as path from "path";

/**
 * Refactor tool for extracting multiple fields from a model to a new reference model.
 *
 * This tool allows users to select multiple fields and move them to a new reference
 * model in a separate file, creating a reference relationship between the source and new models.
 * It provides preview functionality before applying changes.
 */
export class ExtractFieldsToReferenceTool extends ExtractFieldsController {
  private newModelTool: NewModelTool;
  private addFieldTool: AddFieldTool;
  private deleteFieldTool: DeleteFieldTool;

  constructor() {
    super();
    this.newModelTool = new NewModelTool();
    this.addFieldTool = new AddFieldTool();
    this.deleteFieldTool = new DeleteFieldTool();
  }

  /**
   * Returns the VS Code command identifier for this refactor tool.
   */
  getCommandId(): string {
    return "slingr-vscode-extension.extractFieldsToReference";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Extract Fields to Reference";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["EXTRACT_FIELDS_TO_REFERENCE"];
  }

  /**
   * Initiates the manual refactor by prompting user for field selection, new model name, and reference field name.
   */
  async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    const fieldSelection = await this.getSelectedFieldsFromContext(context, "reference");
    if (!fieldSelection) {
      return undefined;
    }

    const { sourceModel, selectedFields } = fieldSelection;

    // Get the new reference model name
    const newModelName = await this.userInputService.showPrompt("Enter the name for the new reference model:");
    if (!newModelName) {
      return undefined;
    }

    // Get the reference field name
    const referenceFieldName = await this.userInputService.showPrompt("Enter the name for the reference field:");
    if (!referenceFieldName) {
      return undefined;
    }

    const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const newModelPath = path.join(sourceDir, `${newModelName}.ts`);
    const newModelUri = vscode.Uri.file(newModelPath);

    const payload: ExtractFieldsToReferencePayload = {
      sourceModelName: sourceModel.name,
      newModelName: newModelName,
      referenceFieldName: referenceFieldName,
      fieldsToExtract: selectedFields,
      isManual: true,
      urisToCreate: [
        {
          uri: newModelUri,
        },
      ],
    };

    return {
      type: "EXTRACT_FIELDS_TO_REFERENCE",
      uri: context.uri,
      description: `Extract ${selectedFields.length} field(s) to new reference model '${newModelName}' with reference field '${referenceFieldName}' in model '${sourceModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ExtractFieldsToReferencePayload;

    try {
      const sourceModel = cache.getModelByName(payload.sourceModelName);
      if (!sourceModel) {
        throw new Error(`Could not find source model '${payload.sourceModelName}'`);
      }

      const edit = new vscode.WorkspaceEdit();

      // Get the URI from the payload
      const newModelUri = payload.urisToCreate![0].uri;

      // Generate the complete file content
      const completeFileContent = this.generateCompleteReferenceModelFile(
        payload.newModelName,
        payload.fieldsToExtract,
        sourceModel,
        cache
      );

      const metadata: vscode.WorkspaceEditEntryMetadata = {
        label: `Create new model file ${path.basename(newModelUri.fsPath)}`,
        description: `Creating new model file for ${payload.newModelName}`,
        needsConfirmation: true,
      };

      // Create the file with content
      edit.createFile(
        newModelUri,
        {
          overwrite: false,
          ignoreIfExists: true,
          contents: Buffer.from(completeFileContent, "utf8"),
        },
        metadata
      );

      // Step 2: Add the reference field to the source model
      await this.addReferenceFieldToSourceModel(
        edit,
        sourceModel,
        payload.referenceFieldName,
        payload.newModelName,
        cache
      );

      // Step 3: Remove the fields from the source model
      for (const field of payload.fieldsToExtract) {
        await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache, edit);
      }

      return edit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to prepare extract fields to reference edit: ${error}`);
      throw error;
    }
  }

  /**
   * Helper method to get selected fields from editor selections.
   */
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

  /**
   * Creates a new reference model in a separate file with the extracted fields.
   */
  private async createReferenceModelWithFields(
    sourceModel: DecoratedClass,
    newModelName: string,
    fieldsToExtract: PropertyMetadata[],
    cache: MetadataCache,
    newModelUri: vscode.Uri
  ): Promise<{ edit: vscode.WorkspaceEdit; newModelUri: vscode.Uri }> {
    // Check if model with this name already exists
    const existingModel = cache.getModelByName(newModelName);
    if (existingModel) {
      throw new Error(`A model named '${newModelName}' already exists in the project`);
    }

    const edit = new vscode.WorkspaceEdit();

    // Generate the complete file content including imports and model
    const completeFileContent = this.generateCompleteReferenceModelFile(
      newModelName,
      fieldsToExtract,
      sourceModel,
      cache
    );

    edit.createFile(newModelUri, {
      overwrite: false,
      ignoreIfExists: true,
      contents: Buffer.from(completeFileContent, "utf8"),
    });

    return { edit, newModelUri };
  }

  /**
   * Generates the complete file content for the new reference model, including imports.
   */
  private generateCompleteReferenceModelFile(
    modelName: string,
    fieldsToExtract: PropertyMetadata[],
    sourceModel: DecoratedClass,
    cache: MetadataCache
  ): string {
    const lines: string[] = [];

    // Extract data source from source model
    const dataSource = this.extractDataSourceFromModel(sourceModel, cache);

    // Generate imports
    const requiredImports = new Set(["Model", "Field", "BaseModel"]);
    for (const field of fieldsToExtract) {
      for (const decorator of field.decorators) {
        requiredImports.add(decorator.name);
      }
    }

    // Add the import statement
    const importList = Array.from(requiredImports).sort();
    lines.push(`import { ${importList.join(", ")} } from 'slingr-framework';`);

    //Add dataSource import
    lines.push(`import { ${dataSource} } from '../dataSources/datasource';`);
    lines.push(""); // Empty line after imports

    // Add model decorator and class
    if (dataSource) {
      lines.push(`@Model({`);
      lines.push(`  dataSource: ${dataSource}`);
      lines.push(`})`);
    } else {
      lines.push(`@Model()`);
    }

    lines.push(`export class ${modelName} extends BaseModel {`);
    lines.push("");

    // Add each field using PropertyMetadata to preserve all decorator information
    for (const field of fieldsToExtract) {
      const fieldCode = this.generateFieldCodeFromPropertyMetadata(field);
      lines.push(...fieldCode.split("\n").map((line) => (line ? `  ${line}` : "")));
      lines.push("");
    }

    lines.push("}");
    lines.push(""); // Empty line at end

    return lines.join("\n");
  }

  /**
   * Extracts the dataSource from a model using the cache.
   */
  private extractDataSourceFromModel(model: DecoratedClass, cache: MetadataCache): string | undefined {
    const modelDecorator = model.decorators.find((d) => d.name === "Model");
    return modelDecorator?.arguments?.[0]?.dataSource;
  }

  /**
   * Adds a reference field to the source model.
   */
  private async addReferenceFieldToSourceModel(
    edit: vscode.WorkspaceEdit,
    sourceModel: DecoratedClass,
    referenceFieldName: string,
    targetModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    // Check if reference field already exists
    const existingFields = Object.keys(sourceModel.properties || {});
    if (existingFields.includes(referenceFieldName)) {
      throw new Error(`Field '${referenceFieldName}' already exists in model ${sourceModel.name}`);
    }

    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);

    // Generate the reference field code
    const fieldCode = this.generateReferenceFieldCode(referenceFieldName, targetModelName);

    // Add required imports
    const requiredImports = new Set(["Field", "Reference"]);
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

    // Add import for the target model
    await this.sourceCodeService.addModelImport(document, targetModelName, edit, cache);

    // Find class boundaries and add field
    const lines = document.getText().split("\n");
    const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModel.name);

    edit.insert(sourceModel.declaration.uri, new vscode.Position(classEndLine, 0), `\n${fieldCode}\n`);
  }

  /**
   * Generates the reference field code.
   */
  private generateReferenceFieldCode(fieldName: string, targetModelName: string): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("  @Field({})");

    // Add Reference decorator
    lines.push("  @Reference()");

    // Add property declaration
    lines.push(`  ${fieldName}!: ${targetModelName};`);

    return lines.join("\n");
  }
}

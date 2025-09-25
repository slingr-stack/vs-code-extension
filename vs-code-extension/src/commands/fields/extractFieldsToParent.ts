import * as vscode from "vscode";
import {
  ChangeObject,
  ManualRefactorContext,
  ExtractFieldsToParentPayload,
} from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { NewModelTool } from "../models/newModel";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { ExtractFieldsController } from "./extractFieldsController";
import * as path from "path";

/**
 * Refactor tool for extracting multiple fields from a model to a new abstract parent model.
 *
 * This tool allows users to select multiple fields and move them to a new abstract parent
 * model extending BaseModel. The source model will then extend from this new parent model
 * instead of its current parent. It provides preview functionality before applying changes.
 */
export class ExtractFieldsToParentTool extends ExtractFieldsController {
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
    return "slingr-vscode-extension.extractFieldsToParent";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Extract Fields to Parent";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["EXTRACT_FIELDS_TO_PARENT"];
  }

  /**
   * Initiates the manual refactor by prompting user for field selection and new parent model name.
   */
  async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    const fieldSelection = await this.getSelectedFieldsFromContext(context, "parent");
    if (!fieldSelection) {
      return undefined;
    }

    const { sourceModel, selectedFields } = fieldSelection;

    // Get the new parent model name
    const newParentModelName = await this.userInputService.showPrompt("Enter the name for the new abstract parent model:");
    if (!newParentModelName) {
      return undefined;
    }

    const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const newParentModelPath = path.join(sourceDir, `${newParentModelName}.ts`);
    const newParentModelUri = vscode.Uri.file(newParentModelPath);

    const payload: ExtractFieldsToParentPayload = {
      sourceModelName: sourceModel.name,
      newParentModelName: newParentModelName,
      fieldsToExtract: selectedFields,
      isManual: true,
      urisToCreate: [
        {
          uri: newParentModelUri,
        },
      ],
    };

    return {
      type: "EXTRACT_FIELDS_TO_PARENT",
      uri: context.uri,
      description: `Extract ${selectedFields.length} field(s) to new abstract parent model '${newParentModelName}' for model '${sourceModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ExtractFieldsToParentPayload;

    try {
      const sourceModel = cache.getModelByName(payload.sourceModelName);
      if (!sourceModel) {
        throw new Error(`Could not find source model '${payload.sourceModelName}'`);
      }

      const edit = new vscode.WorkspaceEdit();

      // Get the URI from the payload
      const newParentModelUri = payload.urisToCreate![0].uri;

      // Generate the complete file content for the abstract parent model
      const completeFileContent = this.generateCompleteParentModelFile(
        payload.newParentModelName,
        payload.fieldsToExtract,
        sourceModel,
        cache
      );

      const metadata: vscode.WorkspaceEditEntryMetadata = {
        label: `Create new abstract parent model file ${path.basename(newParentModelUri.fsPath)}`,
        description: `Creating new abstract parent model file for ${payload.newParentModelName}`,
        needsConfirmation: true,
      };

      // Create the file with content
      edit.createFile(
        newParentModelUri,
        {
          overwrite: false,
          ignoreIfExists: true,
          contents: Buffer.from(completeFileContent, "utf8"),
        },
        metadata
      );

      // Step 2: Update the source model to extend from the new parent model
      await this.updateSourceModelToExtendParent(
        edit,
        sourceModel,
        payload.newParentModelName,
        cache
      );

      // Step 3: Remove the fields from the source model
      for (const field of payload.fieldsToExtract) {
        await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache, edit);
      }

      return edit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to prepare extract fields to parent edit: ${error}`);
      throw error;
    }
  }

  /**
   * Generates the complete file content for the new abstract parent model, including imports.
   */
  private generateCompleteParentModelFile(
    modelName: string,
    fieldsToExtract: PropertyMetadata[],
    sourceModel: DecoratedClass,
    cache: MetadataCache
  ): string {
    const lines: string[] = [];

    // Generate imports
    const requiredImports = new Set(["BaseModel", "Field", "Model"]);
    for (const field of fieldsToExtract) {
      for (const decorator of field.decorators) {
        requiredImports.add(decorator.name);
      }
    }

    // Add the import statement
    const importList = Array.from(requiredImports).sort();
    lines.push(`import { ${importList.join(", ")} } from 'slingr-framework';`);
    lines.push(""); // Empty line after imports

    // Add model decorator
    lines.push(`@Model()`);

    // Add abstract model class extending BaseModel
    lines.push(`export abstract class ${modelName} extends BaseModel {`);
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
   * Updates the source model to extend from the new parent model instead of its current parent.
   */
  private async updateSourceModelToExtendParent(
    edit: vscode.WorkspaceEdit,
    sourceModel: DecoratedClass,
    newParentModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);

    // Add import for the parent model
    await this.sourceCodeService.addModelImport(document, newParentModelName, edit, cache);

    // Find the class declaration line and update it to extend from the new parent
    const lines = document.getText().split("\n");
    const classLine = this.findClassDeclarationLine(lines, sourceModel.name);
    
    if (classLine === -1) {
      throw new Error(`Could not find class declaration for ${sourceModel.name}`);
    }

    const currentLine = lines[classLine];
    const newLine = this.updateClassExtension(currentLine, sourceModel.name, newParentModelName);

    const lineRange = new vscode.Range(
      new vscode.Position(classLine, 0),
      new vscode.Position(classLine, currentLine.length)
    );

    const metadata: vscode.WorkspaceEditEntryMetadata = {
      label: `Update ${sourceModel.name} to extend ${newParentModelName}`,
      description: `Changing class inheritance for ${sourceModel.name}`,
      needsConfirmation: true,
    };

    edit.replace(sourceModel.declaration.uri, lineRange, newLine, metadata);
  }

  /**
   * Finds the line number of the class declaration.
   */
  private findClassDeclarationLine(lines: string[], className: string): number {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes(`class ${className}`) && line.includes("extends")) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Updates the class extension to use the new parent model.
   */
  private updateClassExtension(currentLine: string, className: string, newParentModelName: string): string {
    // Replace the current extends clause with the new parent
    const extendsPattern = /extends\s+\w+/;
    return currentLine.replace(extendsPattern, `extends ${newParentModelName}`);
  }
}
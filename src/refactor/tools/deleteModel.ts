import * as vscode from "vscode";
import { ChangeObject, IRefactorTool, ManualRefactorContext, DeleteModelPayload, ChangeType, RenameModelPayload } from "../refactorInterfaces";
import { DecoratedClass, FileMetadata, MetadataCache, PropertyMetadata } from "../../cache/cache";
import { isModel, isModelFile, isField } from "../../utils/metadata";

/**
 * Tool for handling model deletion in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when model files are deleted from the workspace
 * - Handle manual deletion commands triggered by users
 * - Clean up references to deleted models throughout the codebase
 * - Delete related directories such as actions and UI components
 * - Remove relationship fields in other models that reference the deleted model
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect when model files are removed
 * 2. **Manual trigger**: Allows users to explicitly delete models via command
 * 
 * When an model is deleted, the tool:
 * - Identifies all references to the model across the workspace and removes them
 * - Schedules the model file and related directories for deletion
 * - Coordinates with the RefactorController to handle actual file/directory deletion
 * 
 * @example
 * // Manual usage:
 * // 1. Right-click an model file in the explorer or open it and use the command palette
 * // 2. Execute "Delete Model" command and confirm
 * // 3. Review changes in Refactor Preview panel and apply
 * @implements @see {@link IRefactorTool}
 */
export class DeleteModelTool implements IRefactorTool {
  public getCommandId(): string {
    return "slingr-vscode-extension.deleteModel";
  }

  public getTitle(): string {
    return "Delete Model";
  }

  public getHandledChangeTypes(): ChangeType[] {
    return ["DELETE_ENTITY"];
  }

  /**
   * Determines if this tool can be triggered manually in the given context.
   * @param context The context for the manual refactoring.
   * @returns True if the context URI points to an model file and contains valid model metadata.
   */
  public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
    if (isModelFile(context.uri)) {
      return !!context.metadata && "decorators" in context.metadata && isModel(context.metadata);
    }
    return false;
  }

  /**
   * Analyzes file metadata changes to detect when an model has been deleted.
   * 
   * @param oldFileMeta - The metadata of the file before changes, containing class information
   * @param newFileMeta - The metadata of the file after changes, or undefined if file was deleted
   * @returns An array of ChangeObject instances. Returns a single DELETE_ENTITY change object if an model deletion is detected, otherwise returns an empty array
   * 
   * @remarks
   * This method performs the following checks:
   * - Validates that oldFileMeta exists and represents an model file
   * - Extracts the model class from the old file metadata
   * - Determines if the model was deleted by checking if it no longer exists in newFileMeta
   * - If deleted, collects related URIs that should also be removed (actions and UI directories)
   * - Returns a DELETE_ENTITY change object with the deleted model metadata and related URIs
   */
  public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
    if (!oldFileMeta || !isModelFile(oldFileMeta.uri)) {
      return [];
    }

    const oldModelClass = Object.values(oldFileMeta.classes).find(isModel);

    if (!oldModelClass) {
      return [];
    }

    // Check if this model was already handled by a rename operation
    const wasRenamed = accumulatedChanges.some(change => {
      if (change.type === 'RENAME_ENTITY') {
        const payload = change.payload as RenameModelPayload;
        return payload.oldName === oldModelClass.name;
      }
      return false;
    });

    if (wasRenamed) {
      // Model was renamed, not deleted
      return [];
    }

    const isDeleted = !newFileMeta || !Object.values(newFileMeta.classes).some(isModel);

    if (isDeleted) {
      const urisToDelete: vscode.Uri[] = [];
      const modelUri = oldFileMeta.uri;
      const modelNameLower = oldModelClass.name.toLowerCase();
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);

      if (workspaceFolder) {
        const parentDirsToSearch = ["src/data/actions", "src/ui"];
        for (const parentDir of parentDirsToSearch) {
          const relatedDirUri = vscode.Uri.joinPath(workspaceFolder.uri, parentDir, modelNameLower);
          urisToDelete.push(relatedDirUri);
        }
      }
      const payload: DeleteModelPayload = {
        oldModelMetadata: oldModelClass,
        urisToDelete: urisToDelete,
        isManual: false
      };
      return [
        {
          type: "DELETE_ENTITY",
          uri: oldFileMeta.uri,
          description: `Model '${oldModelClass.name}' was deleted.`,
          payload,
        },
      ];
    }
    return [];
  }

  /**
   * Initiates a manual refactor to delete an model.
   * 
   * This method validates that the context contains a valid model, asks the user for
   * confirmation, and then constructs a `ChangeObject` for the deletion. The change
   * object includes the URIs of the model file and related directories to be deleted.
   * 
   * @param context The manual refactor context.
   * @returns A promise that resolves to a `ChangeObject` for the deletion, or `undefined` if the user cancels.
   */
  public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    if (!context.metadata || !("decorators" in context.metadata) || !isModel(context.metadata)) {
      vscode.window.showErrorMessage("Could not find a valid model to delete.");
      return undefined;
    }
    const model = context.metadata as DecoratedClass;
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the model '${model.name}', its related files, and all its references? This action cannot be undone.`,
      "Yes, Delete All"
    );

    if (confirmation !== "Yes, Delete All") {
      return undefined;
    }
    const urisToDelete: vscode.Uri[] = [];
    const modelUri = context.uri;
    urisToDelete.push(modelUri);

    const modelNameLower = model.name.toLowerCase();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);
    if (workspaceFolder) {
      const parentDirsToSearch = ["src/model/actions", "src/ui"];
      for (const parentDir of parentDirsToSearch) {
        const relatedDirUri = vscode.Uri.joinPath(workspaceFolder.uri, parentDir, modelNameLower);
        urisToDelete.push(relatedDirUri);
      }
    }

    const payload: DeleteModelPayload = {
      oldModelMetadata: model,
      isManual: true,
      urisToDelete: urisToDelete,
    };

    return {
      type: "DELETE_ENTITY",
      uri: context.uri,
      description: `Delete model '${model.name}'.`,
      payload,
    };
  }

  /**
   * Prepares a workspace edit for deleting an model.
   * 
   * This method performs two main cleanup tasks:
   * 1. Removes all external references to the deleted model. References within the
   *    model's own file or related files/directories being deleted are ignored.
   * 2. Cleans up relationship fields in other models that reference the deleted model.
   * 
   * @param change The change object containing deletion details.
   * @param cache The metadata cache for looking up other models.
   * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
   */
  public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    // Type guard to ensure we're working with the correct payload type
    if (change.type !== 'DELETE_ENTITY') {
      throw new Error(`DeleteModelTool can only handle DELETE_ENTITY changes, received: ${change.type}`);
    }
    
    const payload = change.payload as DeleteModelPayload;
    const { oldModelMetadata } = payload;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const urisToDelete: vscode.Uri[] = payload.urisToDelete || [];
    const pathsToDelete = new Set(urisToDelete.map((uri) => uri.fsPath));
    const deletedModelName = oldModelMetadata.name;
    const allReferences = (oldModelMetadata.references as vscode.Location[]) || [];

    const externalReferences = allReferences.filter((ref) => {
      for (const path of pathsToDelete) {
        if (ref.uri.fsPath.startsWith(path) || (ref.uri.fsPath === change.uri.fsPath && !change.payload.isManual)) {
          return false;
        }
        
      }
      return true; 
    });

    for (const ref of externalReferences) {
      try {
        const doc = await vscode.workspace.openTextDocument(ref.uri);
        const line = doc.lineAt(ref.range.start.line);
        if (!line.isEmptyOrWhitespace) {
          workspaceEdit.delete(ref.uri, line.rangeIncludingLineBreak);
        }
      } catch (e) {
        console.error(`Could not process reference in ${ref.uri.fsPath}:`, e);
        workspaceEdit.replace(ref.uri, ref.range, "/* DELETED_REFERENCE */");
      }
    }
    await this.cleanupRelationshipFields(deletedModelName, workspaceEdit, cache);
    return workspaceEdit;
  }

  /**
   * Finds and removes relationship fields in other models that reference the deleted model.
   * 
   * It iterates through all models in the cache, checks their fields, and if a
   * relationship field points to the model being deleted, it schedules the removal
   * of that field's decorators.
   * @param deletedModelName The name of the model being deleted.
   * @param workspaceEdit The workspace edit to add changes to.
   * @param cache The metadata cache to find all other models.
   */
  private async cleanupRelationshipFields(
    deletedModelName: string, 
    workspaceEdit: vscode.WorkspaceEdit, 
    cache: MetadataCache
  ): Promise<void> {
    const allModels = cache.findMetadata(
      item => 'properties' in item && item.decorators.some(d => d.name === 'Model')
    ) as DecoratedClass[];

    for (const model of allModels) {
      if (model.name === deletedModelName) {
        continue;
      }

      for (const property of Object.values(model.properties)) {
        const relationshipDecorator = property.decorators.find(d => d.name === 'Relationship');
        const fieldDecorator = property.decorators.find(d => d.name === 'Field');

        if (relationshipDecorator && fieldDecorator) {
          const referencedModel = this.extractModelFromFieldDecorator(fieldDecorator);
          if (referencedModel === deletedModelName) {
            await this.removeRelationshipField(property, workspaceEdit);
          }
        }
      }
    }
  }

  /**
   * Extracts the model name from a Field decorator.
   * For relationship fields, the model is often specified as the first argument
   * to the `@Field` decorator, e.g., `@Field('OtherModel')`.
   * @param decorator The decorator metadata object.
   * @returns The referenced model name, or null if not found.
   */
  private extractModelFromFieldDecorator(decorator: any): string | null {
    if (!decorator.arguments || decorator.arguments.length === 0) {
      return null;
    }

    const firstArg = decorator.arguments[0];

    if (firstArg.label) {
      return firstArg.label;
    }
    
    return null;
  }

  /**
   * Removes the `@Field` and `@Relationship` decorators from a property.
   * 
   * This method creates edits to delete the decorators. It handles decorators that
   * are on their own line versus those that share a line with other code.
   * 
   * @param field The property metadata for the relationship field.
   * @param workspaceEdit The workspace edit to add changes to.
   */
  private async removeRelationshipField(
    field: any, 
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    try {
      if (!field.decorators || field.decorators.length === 0) {
        console.warn(`Cannot remove relationship decorators for field '${field.name}'; no decorators found.`);
        return;
      }

      // Find and remove @Field and @Relationship decorators
      for (const decorator of field.decorators) {
        if (decorator.name === 'Field' || decorator.name === 'Relationship') {
          if (decorator.position) {
            const doc = await vscode.workspace.openTextDocument(field.declaration.uri);
            const decoratorLine = doc.lineAt(decorator.position.start.line);
            const lineText = decoratorLine.text.trim();
            const decoratorText = doc.getText(decorator.position).trim();
            
            if (lineText === decoratorText) {
              workspaceEdit.delete(field.declaration.uri, decoratorLine.rangeIncludingLineBreak);
            } else {
              workspaceEdit.delete(field.declaration.uri, decorator.position);
            }
            
            console.log(`Scheduled deletion of @${decorator.name} decorator for field '${field.name}'.`);
          }
        }
      }
    } catch (e) {
      console.error(`Could not remove relationship decorators for field '${field.name}':`, e);
      for (const decorator of field.decorators) {
        if ((decorator.name === 'Field' || decorator.name === 'Relationship') && decorator.position) {
          workspaceEdit.replace(
            field.declaration.uri, 
            decorator.position, 
            `/* DELETED_${decorator.name.toUpperCase()}_DECORATOR */`
          );
        }
      }
    }
  }

  /**
   * Executes a custom prompt in VS Code's chat interface after a successful refactoring operation.
   * This allows each tool to provide context-specific guidance or information about the refactoring.
   */
  /**
   * Executes a prompt to help users fix broken references after deleting an model.
   * 
   * This method opens VS Code's chat interface with a detailed prompt that guides the user
   * through fixing remaining broken references that may exist after an model deletion.
   * The prompt includes information about the deleted model and affected file paths.
   * 
   * @param change - The change object containing metadata about the deleted model
   * 
   * @returns A promise that resolves when the chat command is executed successfully
   * 
   * @throws Will log an error to console if the chat command fails to execute
   */
  public async executePrompt(change: ChangeObject): Promise<void> {
    // Type guard to ensure we're working with the correct payload type
    if (change.type !== 'DELETE_ENTITY') {
      console.error(`DeleteModelTool can only execute prompts for DELETE_ENTITY changes, received: ${change.type}`);
      return;
    }
    
    const payload = change.payload as DeleteModelPayload;
    const { oldModelMetadata } = payload;
    const modelName = oldModelMetadata?.name || 'unknown';
    
    // Note: modifiedRanges was not part of the original payload interface
    // If this functionality is needed, it should be added to DeleteModelPayload interface
    let affectedPathsMessage = '';

    const prompt = `I have just deleted the model "${modelName}".
    This action has removed the model's source file, related directories (like actions and UI components), and cleaned up relationship fields in other models.

    However, some broken references might remain, marked with comments like "/* DELETED_REFERENCE */", "/* DELETED_FIELD_DECORATOR */", or "/* DELETED_RELATIONSHIP_DECORATOR */".

    Your task is to help me fix these remaining issues by proposing concrete code modifications and asking the user if it wants you to apply them.

    Please do the following:
    1.  Analyze the code where these "/* DELETED_... */" comments appear.
    2.  For each occurrence, provide a corrected code block. This usually means suggesting the removal of the entire line, statement, or import if it's now obsolete.
    3.  Present your suggestions as code diffs or complete, corrected code snippets that I can easily apply.

    Please focus your analysis and modifications on the files within the current workspace, especially the ones listed below:${affectedPathsMessage}`;
    
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
    } catch (error) {
      console.error('Failed to open chat with custom prompt:', error);
    }
  }
}

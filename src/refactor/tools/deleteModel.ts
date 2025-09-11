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
    return ["DELETE_MODEL"];
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
   * @returns An array of ChangeObject instances. Returns DELETE_MODEL change objects for each deleted model
   * 
   * @remarks
   * This method performs the following checks:
   * - Validates that oldFileMeta exists and represents an model file
   * - Extracts all model classes from the old file metadata
   * - Determines which models were deleted by comparing old and new metadata
   * - Handles both full file deletion and selective model deletion within files
   * - For each deleted model, collects related URIs that should also be removed (actions and UI directories)
   * - Returns DELETE_MODEL change objects for each deleted model
   */
  public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
    if (!oldFileMeta || !isModelFile(oldFileMeta.uri)) {
      return [];
    }

    const oldModelClasses = Object.values(oldFileMeta.classes).filter(isModel);
    if (oldModelClasses.length === 0) {
      return [];
    }

    const changes: ChangeObject[] = [];
    const newModelClasses = newFileMeta ? Object.values(newFileMeta.classes).filter(isModel) : [];
    const newModelNames = new Set(newModelClasses.map(cls => cls.name));

    for (const oldModelClass of oldModelClasses) {
      // Check if this model was already handled by a rename operation
      const wasRenamed = accumulatedChanges.some(change => {
        if (change.type === 'RENAME_MODEL') {
          const payload = change.payload as RenameModelPayload;
          return payload.oldName === oldModelClass.name;
        }
        return false;
      });

      if (wasRenamed) {
        // Model was renamed, not deleted
        return [];
      }

      const isModelDeleted = !newModelNames.has(oldModelClass.name);

      if (isModelDeleted) {
        const urisToDelete: vscode.Uri[] = [];
        const modelUri = oldFileMeta.uri;
        const modelNameLower = oldModelClass.name.toLowerCase();
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(modelUri);

        // Only delete the entire file if this was the only model in the file
        const wasOnlyModel = oldModelClasses.length === 1;
        if (wasOnlyModel) {
          urisToDelete.push(modelUri);
        }

        // Always collect related directories for deletion
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

        changes.push({
          type: "DELETE_MODEL",
          uri: oldFileMeta.uri,
          description: `Model '${oldModelClass.name}' was deleted.`,
          payload,
        });
      }
    }

    return changes;
  }

  /**
   * Initiates a manual refactor to delete an model.
   * 
   * This method validates that the context contains a valid model, asks the user for
   * confirmation, and then constructs a `ChangeObject` for the deletion. The change
   * object includes the URIs of related directories to be deleted. If multiple models
   * exist in the same file, only the specific model will be deleted, not the entire file.
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
    
    // Check if there are multiple models in the same file
    const fileMeta = context.cache.getMetadataForFile(context.uri.fsPath);
    const allModelsInFile = fileMeta ? Object.values(fileMeta.classes).filter(isModel) : [];
    const hasMultipleModels = allModelsInFile.length > 1;
    
    const warningMessage = hasMultipleModels
      ? `Are you sure you want to delete the model '${model.name}' and all its references? The model will be removed from this file, but other models in the same file will remain. This action cannot be undone.`
      : `Are you sure you want to delete the model '${model.name}', its related files, and all its references? This action cannot be undone.`;
      
    const confirmation = await vscode.window.showWarningMessage(
      warningMessage,
      "Yes, Delete All"
    );

    if (confirmation !== "Yes, Delete All") {
      return undefined;
    }
    
    const urisToDelete: vscode.Uri[] = [];
    const modelUri = context.uri;
    
    // Only delete the entire file if this is the only model in the file
    if (!hasMultipleModels) {
      urisToDelete.push(modelUri);
    }

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
      type: "DELETE_MODEL",
      uri: context.uri,
      description: `Delete model '${model.name}'.`,
      payload,
    };
  }

  /**
   * Prepares a workspace edit for deleting an model.
   * 
   * This method performs several cleanup tasks:
   * 1. If multiple models exist in the same file, removes only the specific model class
   * 2. If it's the only model in the file, the entire file will be deleted via urisToDelete
   * 3. Removes all external references to the deleted model
   * 4. Cleans up relationship fields in other models that reference the deleted model
   * 
   * @param change The change object containing deletion details.
   * @param cache The metadata cache for looking up other models.
   * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
   */
  public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    // Type guard to ensure we're working with the correct payload type
    if (change.type !== 'DELETE_MODEL') {
      throw new Error(`DeleteModelTool can only handle DELETE_MODEL changes, received: ${change.type}`);
    }
    
    const payload = change.payload as DeleteModelPayload;
    const { oldModelMetadata } = payload;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const urisToDelete: vscode.Uri[] = payload.urisToDelete || [];
    const pathsToDelete = new Set(urisToDelete.map((uri) => uri.fsPath));
    const deletedModelName = oldModelMetadata.name;
    const allReferences = (oldModelMetadata.references as vscode.Location[]) || [];

    // Check if we need to delete just the class or the entire file
    const isEntireFileBeingDeleted = urisToDelete.some(uri => uri.fsPath === change.uri.fsPath);
    
    if (!isEntireFileBeingDeleted) {
      // Multiple models in file - delete only the specific model class
      await this.deleteModelClassFromFile(change.uri, oldModelMetadata, workspaceEdit);
    }

    // Filter out references that are in files/directories being deleted
    const externalReferences = allReferences.filter((ref) => {
      for (const path of pathsToDelete) {
        if (ref.uri.fsPath.startsWith(path)) {
          return false;
        }
      }
      
      // If we're doing partial class deletion (not deleting the entire file),
      // filter out references within the same file since deleteModelClassFromFile handles those
      if (!isEntireFileBeingDeleted && ref.uri.fsPath === change.uri.fsPath) {
        return false;
      }
      
      return true; 
    });

    // Remove external references to the deleted model
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
   * Deletes a specific model class from a file that contains multiple models.
   * This method calculates the exact range of the class declaration including
   * its decorators, imports, and related code, then removes only that portion.
   * It also cleans up any unused imports that were only used by the deleted model.
   * 
   * @param fileUri - The URI of the file containing the model
   * @param modelMetadata - The metadata of the model to delete
   * @param workspaceEdit - The workspace edit to add the deletion to
   */
  private async deleteModelClassFromFile(
    fileUri: vscode.Uri, 
    modelMetadata: DecoratedClass, 
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(fileUri);
      const text = document.getText();
      const lines = text.split('\n');
      
      // Find the class declaration range
      const classDeclaration = modelMetadata.declaration;
      const startLine = classDeclaration.range.start.line;
      const endLine = classDeclaration.range.end.line;
      
      // Extend the range to include decorators above the class
      let actualStartLine = startLine;
      
      // Look backwards to find decorators and comments that belong to this class
      for (let i = startLine - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.endsWith('*/')) {
          // Empty lines, single-line comments, or comment blocks - continue looking
          actualStartLine = i;
        } else if (line.startsWith('@')) {
          // Decorator - include it
          actualStartLine = i;
        } else {
          // Found non-empty, non-comment, non-decorator line - stop here
          break;
        }
      }
      
      // Look forward to find the complete class body (including closing brace)
      let actualEndLine = endLine;
      let braceCount = 0;
      let foundOpenBrace = false;
      
      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            foundOpenBrace = true;
          } else if (char === '}') {
            braceCount--;
            if (foundOpenBrace && braceCount === 0) {
              actualEndLine = i;
              break;
            }
          }
        }
        
        if (foundOpenBrace && braceCount === 0) {
          break;
        }
      }
      
      // Include any trailing empty lines that belong to this class
      while (actualEndLine + 1 < lines.length && lines[actualEndLine + 1].trim() === '') {
        actualEndLine++;
      }
      
      // Create the range to delete (include the newline of the last line)
      const rangeToDelete = new vscode.Range(
        new vscode.Position(actualStartLine, 0),
        new vscode.Position(actualEndLine + 1, 0)
      );
      
      workspaceEdit.delete(fileUri, rangeToDelete);
      
    } catch (error) {
      console.error(`Error deleting model class from file ${fileUri.fsPath}:`, error);
      // Fallback: just comment out the class declaration
      workspaceEdit.replace(fileUri, modelMetadata.declaration.range, `/* DELETED_MODEL: ${modelMetadata.name} */`);
    }
  }

  /**
   * Finds and removes relationship fields in other models that reference the deleted model.
   * 
   * It iterates through all models in the cache, checks their fields, and if a
   * relationship field points to the model being deleted, it schedules the removal
   * of the entire field including all its decorators and the property declaration.
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

        // If this property has both @Relationship and @Field decorators,
        // it's a relationship field that should be removed when the referenced model is deleted
        if (relationshipDecorator && fieldDecorator) {
          if (property.type === deletedModelName || property.type === `Array<${deletedModelName}>`) {
            await this.removeRelationshipField(property, workspaceEdit);
          }
        }
      }
    }
  }

  /**
   * Removes the entire relationship field including its decorators and property declaration.
   * 
   * This method uses the cached metadata to identify the exact ranges of decorators and deletes them.
   * 
   * @param field The property metadata for the relationship field.
   * @param workspaceEdit The workspace edit to add changes to.
   */
  private async removeRelationshipField(
    field: PropertyMetadata, 
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    try {
      if (!field.declaration) {
        console.warn(`Cannot remove relationship field '${field.name}'; no declaration found.`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument(field.declaration.uri);
      const rangesToDelete: vscode.Range[] = [];
      // Add decorator ranges from cache
      for (const decorator of field.decorators) {
        const decoratorLine = doc.lineAt(decorator.position.start.line);
        const lineText = decoratorLine.text.trim();
        const decoratorText = doc.getText(decorator.position).trim();
        
        if (lineText === decoratorText) {
          // Decorator is alone on the line, delete the entire line
          rangesToDelete.push(decoratorLine.rangeIncludingLineBreak);
        } else {
          // Decorator shares the line, delete only the decorator
          rangesToDelete.push(decorator.position);
        }
      }
      
      // Apply all deletions
      for (const range of rangesToDelete) {
        workspaceEdit.delete(field.declaration.uri, range);
      }
      
    } catch (e) {
      console.error(`Could not remove relationship field '${field.name}':`, e);
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
    if (change.type !== 'DELETE_MODEL') {
      console.error(`DeleteModelTool can only execute prompts for DELETE_MODEL changes, received: ${change.type}`);
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
      await vscode.commands.executeCommand('workbench.action.chat.openAgent', prompt);
    } catch (error) {
      console.error('Failed to open chat with custom prompt:', error);
    }
  }
}

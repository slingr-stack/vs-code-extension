import * as vscode from "vscode";
import { ChangeObject, IRefactorTool, ManualRefactorContext } from "../refactorInterfaces";
import { DecoratedClass, FileMetadata, MetadataCache, PropertyMetadata } from "../../cache/cache";
import { isEntity, isEntityFile, isField } from "../../utils/metadata";

/**
 * Tool for handling entity deletion in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when entity files are deleted from the workspace
 * - Handle manual deletion commands triggered by users
 * - Clean up references to deleted entities throughout the codebase
 * - Delete related directories such as actions and UI components
 * - Remove relationship fields in other entities that reference the deleted entity
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect when entity files are removed
 * 2. **Manual trigger**: Allows users to explicitly delete entities via command
 * 
 * When an entity is deleted, the tool:
 * - Identifies all references to the entity across the workspace and removes them
 * - Schedules the entity file and related directories for deletion
 * - Coordinates with the RefactorController to handle actual file/directory deletion
 * 
 * @example
 * // Manual usage:
 * // 1. Right-click an entity file in the explorer or open it and use the command palette
 * // 2. Execute "Delete Entity" command and confirm
 * // 3. Review changes in Refactor Preview panel and apply
 * @implements @see {@link IRefactorTool}
 */
export class DeleteEntityTool implements IRefactorTool {
  public getCommandId(): string {
    return "slingr-vscode-extension.deleteEntity";
  }

  public getTitle(): string {
    return "Delete Entity";
  }

  public getHandledChangeTypes(): string[] {
    return ["DELETE_ENTITY"];
  }

  /**
   * Determines if this tool can be triggered manually in the given context.
   * @param context The context for the manual refactoring.
   * @returns True if the context URI points to an entity file and contains valid entity metadata.
   */
  public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
    if (isEntityFile(context.uri)) {
      return !!context.metadata && "decorators" in context.metadata && isEntity(context.metadata);
    }
    return false;
  }

  /**
   * Analyzes file metadata changes to detect when an entity has been deleted.
   * 
   * @param oldFileMeta - The metadata of the file before changes, containing class information
   * @param newFileMeta - The metadata of the file after changes, or undefined if file was deleted
   * @returns An array of ChangeObject instances. Returns a single DELETE_ENTITY change object if an entity deletion is detected, otherwise returns an empty array
   * 
   * @remarks
   * This method performs the following checks:
   * - Validates that oldFileMeta exists and represents an entity file
   * - Extracts the entity class from the old file metadata
   * - Determines if the entity was deleted by checking if it no longer exists in newFileMeta
   * - If deleted, collects related URIs that should also be removed (actions and UI directories)
   * - Returns a DELETE_ENTITY change object with the deleted entity metadata and related URIs
   */
  public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata): ChangeObject[] {
    if (!oldFileMeta || !isEntityFile(oldFileMeta.uri)) {
      return [];
    }

    const oldEntityClass = Object.values(oldFileMeta.classes).find(isEntity);

    if (!oldEntityClass) {
      return [];
    }

    const isDeleted = !newFileMeta || !Object.values(newFileMeta.classes).some(
      (c) => c.name === oldEntityClass.name && isEntity(c)
    );

    if (isDeleted) {
      const urisToDelete: vscode.Uri[] = [];
      const entityUri = oldFileMeta.uri;
      const entityNameLower = oldEntityClass.name.toLowerCase();
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(entityUri);

      if (workspaceFolder) {
        const parentDirsToSearch = ["src/data/actions", "src/ui"];
        for (const parentDir of parentDirsToSearch) {
          const relatedDirUri = vscode.Uri.joinPath(workspaceFolder.uri, parentDir, entityNameLower);
          urisToDelete.push(relatedDirUri);
        }
      }
      return [
        {
          type: "DELETE_ENTITY",
          uri: oldFileMeta.uri,
          description: `Entity '${oldEntityClass.name}' was deleted.`,
          payload: { oldEntityMetadata: oldEntityClass, urisToDelete: urisToDelete },
        },
      ];
    }
    return [];
  }

  /**
   * Initiates a manual refactor to delete an entity.
   * 
   * This method validates that the context contains a valid entity, asks the user for
   * confirmation, and then constructs a `ChangeObject` for the deletion. The change
   * object includes the URIs of the entity file and related directories to be deleted.
   * 
   * @param context The manual refactor context.
   * @returns A promise that resolves to a `ChangeObject` for the deletion, or `undefined` if the user cancels.
   */
  public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    if (!context.metadata || !("decorators" in context.metadata) || !isEntity(context.metadata)) {
      vscode.window.showErrorMessage("Could not find a valid entity to delete.");
      return undefined;
    }
    const entity = context.metadata as DecoratedClass;
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the entity '${entity.name}', its related files, and all its references? This action cannot be undone.`,
      "Yes, Delete All"
    );

    if (confirmation !== "Yes, Delete All") {
      return undefined;
    }
    const urisToDelete: vscode.Uri[] = [];
    const entityUri = context.uri;
    urisToDelete.push(entityUri);

    const entityNameLower = entity.name.toLowerCase();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(entityUri);
    if (workspaceFolder) {
      const parentDirsToSearch = ["src/model/actions", "src/ui"];
      for (const parentDir of parentDirsToSearch) {
        const relatedDirUri = vscode.Uri.joinPath(workspaceFolder.uri, parentDir, entityNameLower);
        urisToDelete.push(relatedDirUri);
      }
    }

    return {
      type: "DELETE_ENTITY",
      uri: context.uri,
      description: `Delete entity '${entity.name}'.`,
      payload: {
        oldEntityMetadata: entity,
        isManual: true,
        urisToDelete: urisToDelete,
      },
    };
  }

  /**
   * Prepares a workspace edit for deleting an entity.
   * 
   * This method performs two main cleanup tasks:
   * 1. Removes all external references to the deleted entity. References within the
   *    entity's own file or related files/directories being deleted are ignored.
   * 2. Cleans up relationship fields in other entities that reference the deleted entity.
   * 
   * @param change The change object containing deletion details.
   * @param cache The metadata cache for looking up other entities.
   * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
   */
  public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const { oldEntityMetadata } = change.payload;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const urisToDelete: vscode.Uri[] = change.payload.urisToDelete || [];
    const pathsToDelete = new Set(urisToDelete.map((uri) => uri.fsPath));
    const deletedEntityName = oldEntityMetadata.name;
    const allReferences = (oldEntityMetadata.references as vscode.Location[]) || [];

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
    await this.cleanupRelationshipFields(deletedEntityName, workspaceEdit, cache);
    return workspaceEdit;
  }

  /**
   * Finds and removes relationship fields in other entities that reference the deleted entity.
   * 
   * It iterates through all entities in the cache, checks their fields, and if a
   * relationship field points to the entity being deleted, it schedules the removal
   * of that field's decorators.
   * @param deletedEntityName The name of the entity being deleted.
   * @param workspaceEdit The workspace edit to add changes to.
   * @param cache The metadata cache to find all other entities.
   */
  private async cleanupRelationshipFields(
    deletedEntityName: string, 
    workspaceEdit: vscode.WorkspaceEdit, 
    cache: MetadataCache
  ): Promise<void> {
    const allEntities = cache.findMetadata(
      item => 'properties' in item && item.decorators.some(d => d.name === 'Model')
    ) as DecoratedClass[];

    for (const entity of allEntities) {
      if (entity.name === deletedEntityName) {
        continue;
      }

      for (const property of Object.values(entity.properties)) {
        const relationshipDecorator = property.decorators.find(d => d.name === 'Relationship');
        const fieldDecorator = property.decorators.find(d => d.name === 'Field');

        if (relationshipDecorator && fieldDecorator) {
          const referencedEntity = this.extractEntityFromFieldDecorator(fieldDecorator);
          if (referencedEntity === deletedEntityName) {
            await this.removeRelationshipField(property, workspaceEdit);
          }
        }
      }
    }
  }

  /**
   * Extracts the entity name from a Field decorator.
   * For relationship fields, the entity is often specified as the first argument
   * to the `@Field` decorator, e.g., `@Field('OtherEntity')`.
   * @param decorator The decorator metadata object.
   * @returns The referenced entity name, or null if not found.
   */
  private extractEntityFromFieldDecorator(decorator: any): string | null {
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
   * Executes a prompt to help users fix broken references after deleting an entity.
   * 
   * This method opens VS Code's chat interface with a detailed prompt that guides the user
   * through fixing remaining broken references that may exist after an entity deletion.
   * The prompt includes information about the deleted entity and affected file paths.
   * 
   * @param change - The change object containing metadata about the deleted entity
   * 
   * @returns A promise that resolves when the chat command is executed successfully
   * 
   * @throws Will log an error to console if the chat command fails to execute
   */
  public async executePrompt(change: ChangeObject): Promise<void> {
    const { oldEntityMetadata } = change.payload;
    const entityName = oldEntityMetadata?.name || 'unknown';
    const modifiedRanges = change.payload.modifiedRanges || [];

    let affectedPathsMessage = '';
    if (modifiedRanges && modifiedRanges.length > 0) {
      const paths = modifiedRanges.map((path: string) => `- ${path}`).join('\n');
      affectedPathsMessage = `\n\n${paths}`;
    }
    const prompt = `I have just deleted the entity "${entityName}".
    This action has removed the entity's source file, related directories (like actions and UI components), and cleaned up relationship fields in other entities.

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

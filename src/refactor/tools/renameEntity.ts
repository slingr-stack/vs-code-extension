import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { DecoratedClass, FileMetadata, MetadataCache } from '../../cache/cache';
import { areRangesEqual, isEntity, isEntityFile } from '../../utils/metadata';

/**
 * Tool for handling entity class renaming in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when an entity class is renamed within its file.
 * - Handle manual rename commands triggered by users.
 * - Update all references to the renamed entity throughout the codebase.
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect class renames in entity files.
 * 2. **Manual trigger**: Allows users to explicitly rename entities via a command.
 * 
 * When an entity is renamed, the tool updates the class declaration and all its usages.
 * 
 * @example
 * // Manual usage:
 * // 1. Position the cursor on an entity class name.
 * // 2. Execute the "Rename Entity" command and provide a new name.
 * // 3. Review changes in the Refactor Preview panel and apply.
 * @implements @see {@link IRefactorTool}
 */
export class RenameEntityTool implements IRefactorTool {
    public getCommandId(): string {
        return 'slingr-vscode-extension.renameEntity';
    }

    public getTitle(): string {
        return 'Rename Entity';
    }

    public getHandledChangeTypes(): string[] {
        return ['RENAME_ENTITY'];
    }

    /**
     * Determines if this tool can be triggered manually in the given context.
     * @param context The context for the manual refactoring.
     * @returns True if the context metadata represents a valid entity class.
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return !!context.metadata && context.metadata instanceof Object && 'decorators' in context.metadata && isEntity(context.metadata);
    }

    /**
     * Analyzes file metadata changes to detect entity renames.
     * 
     * A rename is detected when an entity file has exactly one class removed and one
     * class added between the old and new metadata. It accounts for entities that
     * might have been deleted by another tool in the same operation.
     * 
     * @param oldFileMeta The metadata of the file before the change.
     * @param newFileMeta The metadata of the file after the change.
     * @returns An array containing a `ChangeObject` if a rename is detected, otherwise an empty array.
     */
    public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
        if (!oldFileMeta || !newFileMeta || !isEntityFile(newFileMeta.uri)) {
            return [];
        }

        const oldClassNames = new Set(Object.keys(oldFileMeta.classes));
        const newClassNames = new Set(Object.keys(newFileMeta.classes));
        const deletedClassNames = new Set<string>();
        for (const change of accumulatedChanges) {
            if (change.type === 'DELETE_ENTITY' && change.payload.oldEntityMetadata) {
                deletedClassNames.add(change.payload.oldEntityMetadata.name);
            }
        }

        const removedClassNames = [...oldClassNames].filter(name => !newClassNames.has(name) && !deletedClassNames.has(name));
        const addedClassNames = [...newClassNames].filter(name => !oldClassNames.has(name));
        if (removedClassNames.length === 1 && addedClassNames.length === 1) {
            const oldClass = oldFileMeta.classes[removedClassNames[0]];
            const newClass = newFileMeta.classes[addedClassNames[0]];

            if (isEntity(oldClass) && isEntity(newClass)) {
                const change: ChangeObject = {
                    type: 'RENAME_ENTITY',
                    uri: newFileMeta.uri,
                    description: `Entity '${oldClass.name}' was renamed to '${newClass.name}'.`,
                    payload: {
                        oldName: oldClass.name,
                        newName: newClass.name,
                        oldEntityMetadata: oldClass,
                    }
                };
                return [change];
            }
        }
        return [];
    }

    /**
     * Initiates a manual refactor to rename an entity.
     * 
     * This method validates that the context contains a valid entity, then prompts the
     * user for a new name. It validates the new name to ensure it's a valid class name.
     * 
     * @param context The manual refactor context.
     * @returns A promise that resolves to a `ChangeObject` for the rename, or `undefined` if the user cancels or provides an invalid name.
     */
    public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !('decorators' in context.metadata) || !isEntity(context.metadata)) {
            vscode.window.showErrorMessage('Cannot rename: Not a valid entity.');
            return undefined;
        }

        const entity = context.metadata as DecoratedClass;
        const newName = await vscode.window.showInputBox({
            prompt: `Rename entity '${entity.name}'`,
            value: entity.name,
            validateInput: value => (value && /^[A-Z][a-zA-Z0-9]*$/.test(value) ? null : 'Invalid entity name.'),
        });

        if (!newName || newName === entity.name) {
            return undefined;
        }

        const change: ChangeObject = {
            type: 'RENAME_ENTITY',
            uri: context.uri,
            description: `Rename entity '${entity.name}' to '${newName}'.`,
            payload: {
                oldName: entity.name,
                newName: newName,
                oldEntityMetadata: entity,
                isManual: true
            }
        };
        return change;
    }

    /**
     * Prepares a workspace edit for renaming an entity.
     * 
     * This method creates edits to replace all references to the old entity name with the new one.
     * For manual refactors, it also includes an edit to rename the class declaration itself.
     * Automatic refactors do not need to rename the declaration, as that change has already
     * been made by the user in the file.
     * 
     * @param change The change object containing rename details.
     * @param cache The metadata cache (not used in this method).
     * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
     */
    public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const { newName, oldEntityMetadata } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();

        const references = (oldEntityMetadata.references as vscode.Location[]) || [];
        const declarationUri = oldEntityMetadata.declaration.uri;
        const declarationRange = oldEntityMetadata.declaration.range;

        for (const ref of references) {
            if (ref.uri.fsPath === declarationUri.fsPath && areRangesEqual(ref.range, declarationRange)) {
                continue;
            }
            workspaceEdit.replace(ref.uri, ref.range, newName);
        }

        if (change.payload.isManual) {
            workspaceEdit.replace(declarationUri, declarationRange, newName);
        }

        return workspaceEdit;
    }
}
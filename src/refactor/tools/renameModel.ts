import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { DecoratedClass, FileMetadata, MetadataCache } from '../../cache/cache';
import { areRangesEqual, isModel, isModelFile } from '../../utils/metadata';

/**
 * Tool for handling model class renaming in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when an model class is renamed within its file.
 * - Handle manual rename commands triggered by users.
 * - Update all references to the renamed model throughout the codebase.
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect class renames in model files.
 * 2. **Manual trigger**: Allows users to explicitly rename models via a command.
 * 
 * When an model is renamed, the tool updates the class declaration and all its usages.
 * 
 * @example
 * // Manual usage:
 * // 1. Position the cursor on an model class name.
 * // 2. Execute the "Rename Model" command and provide a new name.
 * // 3. Review changes in the Refactor Preview panel and apply.
 * @implements @see {@link IRefactorTool}
 */
export class RenameModelTool implements IRefactorTool {
    public getCommandId(): string {
        return 'slingr-vscode-extension.renameModel';
    }

    public getTitle(): string {
        return 'Rename Model';
    }

    public getHandledChangeTypes(): string[] {
        return ['RENAME_ENTITY'];
    }

    /**
     * Determines if this tool can be triggered manually in the given context.
     * @param context The context for the manual refactoring.
     * @returns True if the context metadata represents a valid model class.
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return !!context.metadata && context.metadata instanceof Object && 'decorators' in context.metadata && isModel(context.metadata);
    }

    /**
     * Analyzes file metadata changes to detect model renames.
     * 
     * A rename is detected when an model file has exactly one class removed and one
     * class added between the old and new metadata. It accounts for models that
     * might have been deleted by another tool in the same operation.
     * 
     * @param oldFileMeta The metadata of the file before the change.
     * @param newFileMeta The metadata of the file after the change.
     * @returns An array containing a `ChangeObject` if a rename is detected, otherwise an empty array.
     */
    public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
        if (!oldFileMeta || !newFileMeta || !isModelFile(newFileMeta.uri)) {
            return [];
        }

        const oldClassNames = new Set(Object.keys(oldFileMeta.classes));
        const newClassNames = new Set(Object.keys(newFileMeta.classes));
        const deletedClassNames = new Set<string>();
        for (const change of accumulatedChanges) {
            if (change.type === 'DELETE_ENTITY' && change.payload.oldModelMetadata) {
                deletedClassNames.add(change.payload.oldModelMetadata.name);
            }
        }

        const removedClassNames = [...oldClassNames].filter(name => !newClassNames.has(name) && !deletedClassNames.has(name));
        const addedClassNames = [...newClassNames].filter(name => !oldClassNames.has(name));
        if (removedClassNames.length === 1 && addedClassNames.length === 1) {
            const oldClass = oldFileMeta.classes[removedClassNames[0]];
            const newClass = newFileMeta.classes[addedClassNames[0]];

            if (isModel(oldClass) && isModel(newClass)) {
                const change: ChangeObject = {
                    type: 'RENAME_ENTITY',
                    uri: newFileMeta.uri,
                    description: `Model '${oldClass.name}' was renamed to '${newClass.name}'.`,
                    payload: {
                        oldName: oldClass.name,
                        newName: newClass.name,
                        oldModelMetadata: oldClass,
                    }
                };
                return [change];
            }
        }
        return [];
    }

    /**
     * Initiates a manual refactor to rename an model.
     * 
     * This method validates that the context contains a valid model, then prompts the
     * user for a new name. It validates the new name to ensure it's a valid class name.
     * 
     * @param context The manual refactor context.
     * @returns A promise that resolves to a `ChangeObject` for the rename, or `undefined` if the user cancels or provides an invalid name.
     */
    public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !('decorators' in context.metadata) || !isModel(context.metadata)) {
            vscode.window.showErrorMessage('Cannot rename: Not a valid model.');
            return undefined;
        }

        const model = context.metadata as DecoratedClass;
        const newName = await vscode.window.showInputBox({
            prompt: `Rename model '${model.name}'`,
            value: model.name,
            validateInput: value => (value && /^[A-Z][a-zA-Z0-9]*$/.test(value) ? null : 'Invalid model name.'),
        });

        if (!newName || newName === model.name) {
            return undefined;
        }

        const change: ChangeObject = {
            type: 'RENAME_ENTITY',
            uri: context.uri,
            description: `Rename model '${model.name}' to '${newName}'.`,
            payload: {
                oldName: model.name,
                newName: newName,
                oldModelMetadata: model,
                isManual: true
            }
        };
        return change;
    }

    /**
     * Prepares a workspace edit for renaming an model.
     * 
     * This method creates edits to replace all references to the old model name with the new one.
     * For manual refactors, it also includes an edit to rename the class declaration itself.
     * Automatic refactors do not need to rename the declaration, as that change has already
     * been made by the user in the file.
     * 
     * @param change The change object containing rename details.
     * @param cache The metadata cache (not used in this method).
     * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
     */
    public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const { newName, oldModelMetadata } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();

        const references = (oldModelMetadata.references as vscode.Location[]) || [];
        const declarationUri = oldModelMetadata.declaration.uri;
        const declarationRange = oldModelMetadata.declaration.range;

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
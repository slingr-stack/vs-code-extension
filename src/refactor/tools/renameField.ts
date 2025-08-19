import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { DecoratedClass, FileMetadata, MetadataCache, PropertyMetadata } from '../../cache/cache';
import { areRangesEqual, isEntity, isEntityFile, isField } from '../../utils/metadata';


/**
 * Tool for handling field property renaming within an entity class.
 * 
 * This tool provides functionality to:
 * - Detect when a field property is renamed within an entity class.
 * - Handle manual rename commands triggered by users.
 * - Update all references to the renamed field throughout the codebase.
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect property renames.
 * 2. **Manual trigger**: Allows users to explicitly rename fields via a command.
 * 
 * When a field is renamed, the tool updates the property declaration and all its usages.
 * 
 * @example
 * // Manual usage:
 * // 1. Position the cursor on a field property name.
 * // 2. Execute the "Rename Field" command and provide a new name.
 * // 3. Review changes in the Refactor Preview panel and apply.
 * @implements @see {@link IRefactorTool}
 */
export class RenameFieldTool implements IRefactorTool {
    public getCommandId(): string {
        return 'ts-app-extension.renameField';
    }

    public getTitle(): string {
        return 'Rename Field';
    }

    public getHandledChangeTypes(): string[] {
        return ['RENAME_FIELD'];
    }

    /**
     * Determines if this tool can be triggered manually in the given context.
     * @param context The context for the manual refactoring.
     * @returns True if the context metadata represents a valid field.
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return !!context.metadata && 'type' in context.metadata && isField(context.metadata);
    }

    /**
     * Analyzes file metadata changes to detect field renames.
     * 
     * A rename is detected by correlating removed and added properties within the same
     * entity class. It assumes that if an equal number of fields were removed and added,
     * they correspond to renames. It accounts for entity renames and field deletions
     * that may have occurred in the same operation.
     * 
     * @param oldFileMeta The metadata of the file before the change.
     * @param newFileMeta The metadata of the file after the change.
     * @param accumulatedChanges Changes from other tools that have already been detected.
     * @returns An array of `ChangeObject` instances for any detected field renames.
     */
    public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
        const changes: ChangeObject[] = [];
        if (!oldFileMeta || !newFileMeta || !isEntityFile(newFileMeta.uri)) {
            return [];
        }

        const classRenames = new Map<string, string>();
        const deletedFieldsByClass = new Map<string, Set<string>>();
        for (const change of accumulatedChanges) {
            if (change.type === 'RENAME_ENTITY' && change.payload.oldName && change.payload.newName) {
                classRenames.set(change.payload.oldName, change.payload.newName);
            }
            if (change.type === 'DELETE_FIELD' && change.payload.entityName && change.payload.oldFieldMetadata) {
                const entityName = change.payload.entityName;
                const fieldName = change.payload.oldFieldMetadata.name;
                if (!deletedFieldsByClass.has(entityName)) {
                    deletedFieldsByClass.set(entityName, new Set());
                }
                deletedFieldsByClass.get(entityName)!.add(fieldName);
            }
        }

        for (const oldClassName in oldFileMeta.classes) {
            const oldClass = oldFileMeta.classes[oldClassName];
            const expectedNewClassName = classRenames.get(oldClassName) || oldClassName;
            const newClass = newFileMeta.classes[expectedNewClassName];

            if (!newClass || !isEntity(newClass)) {
                continue;
            }

            const oldPropNames = new Set(Object.keys(oldClass.properties));
            const newPropNames = new Set(Object.keys(newClass.properties));
            const deletedInThisClass = deletedFieldsByClass.get(oldClassName);
            
            const removedProps = [...oldPropNames].filter(name => !newPropNames.has(name) && !deletedInThisClass?.has(name));
            const addedProps = [...newPropNames].filter(name => !oldPropNames.has(name));

            if (removedProps.length > 0 && removedProps.length === addedProps.length) {
                for (let i = 0; i < removedProps.length; i++) {
                    const oldProp = oldClass.properties[removedProps[i]];
                    const newProp = newClass.properties[addedProps[i]];

                    if (isField(oldProp) && isField(newProp)) {
                        changes.push({
                            type: 'RENAME_FIELD',
                            uri: newFileMeta.uri,
                            description: `Field '${oldProp.name}' was renamed to '${newProp.name}' in Entity '${newClass.name}'.`,
                            payload: {
                                oldName: oldProp.name,
                                newName: newProp.name,
                                entityName: oldClassName,
                                oldFieldMetadata: oldProp,
                            }
                        });
                    }
                }
            }
        }
        return changes;
    }

    /**
     * Initiates a manual refactor to rename a field.
     * 
     * This method validates that the context contains a valid field, then prompts the
     * user for a new name. It validates the new name to ensure it's a valid property name.
     * It also identifies the containing entity for the field.
     * 
     * @param context The manual refactor context.
     * @returns A promise that resolves to a `ChangeObject` for the rename, or `undefined` if the user cancels or validation fails.
     */
    public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !('type' in context.metadata) || !isField(context.metadata)) {
            vscode.window.showErrorMessage('Cannot rename: Not a valid field.');
            return undefined;
        }

        const field = context.metadata as PropertyMetadata;

        const newName = await vscode.window.showInputBox({
            prompt: `Rename field '${field.name}'`,
            value: field.name,
            validateInput: value => (value && /^[a-z][a-zA-Z0-9]*$/.test(value) ? null : 'Invalid field name.'),
        });

        if (!newName || newName === field.name) {
            return undefined;
        }

        let containingEntity: DecoratedClass | undefined;
        const filePath = context.uri.fsPath.replace(/\\/g, '/');
        const fileMeta = context.cache.getMetadataForFile(filePath);
        if (fileMeta) {
            for (const classData of Object.values(fileMeta.classes)) {
                if (classData.properties[field.name]) {
                    containingEntity = classData;
                    break;
                }
            }
        }

        if (!containingEntity) {
            vscode.window.showErrorMessage('Could not determine the parent entity for this field.');
            return undefined;
        }


        return {
            type: 'RENAME_FIELD',
            uri: context.uri,
            description: `Rename field '${field.name}' to '${newName}'.`,
            payload: {
                oldName: field.name,
                newName: newName,
                entityName: containingEntity.name,
                oldFieldMetadata: field,
                isManual: true
            }
        };
    }

    /**
     * Prepares a workspace edit for renaming a field.
     * 
     * This method creates edits to replace all references to the old field name with the new one.
     * For manual refactors, it also includes an edit to rename the property declaration itself.
     * Automatic refactors do not need to rename the declaration, as that change has already
     * been made by the user in the file.
     * 
     * @param change The change object containing rename details.
     * @param cache The metadata cache (not used in this method).
     * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
     */
    public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const { newName, oldFieldMetadata } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const references = (oldFieldMetadata.references as vscode.Location[]) || [];

        const declarationUri = oldFieldMetadata.declaration.uri;
        const declarationRange = oldFieldMetadata.declaration.range;

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
import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { FileMetadata, MetadataCache, PropertyMetadata } from '../../cache/cache';
import { isEntity, isEntityFile, isField } from '../../utils/metadata';
import { areRangesEqual } from '../../utils/metadata';
import * as fs from 'fs';

/**
 * Tool for handling field deletion from an entity in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when a field property is removed from an entity class
 * - Handle manual deletion commands triggered by users
 * - Clean up references to the deleted field throughout the codebase
 * 
 * The tool operates in two modes:
 * 1. **Automatic detection**: Analyzes file changes to detect when field properties are removed.
 * 2. **Manual trigger**: Allows users to explicitly delete fields via a command.
 * 
 * When a field is deleted, the tool:
 * - For manual deletion, removes the entire property declaration (including decorators).
 * - For both modes, identifies all references to the field and replaces them with a placeholder comment.
 * 
 * @example
 * // Manual usage:
 * // 1. Position the cursor on a field property within an entity class.
 * // 2. Execute the "Delete Field" command.
 * // 3. Review changes in the Refactor Preview panel and apply.
 * @implements @see {@link IRefactorTool}
 */
export class DeleteFieldTool implements IRefactorTool {
    public getCommandId(): string {
        return 'ts-app-extension.deleteField';
    }

    public getTitle(): string {
        return 'Delete Field';
    }

    public getHandledChangeTypes(): string[] {
        return ['DELETE_FIELD'];
    }

    /**
     * Determines if this tool can be triggered manually in the given context.
     * @param context The context for the manual refactoring.
     * @returns True if the context metadata represents a valid field.
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return !!context.metadata && 'type' in context.metadata && isField(context.metadata); //
    }

    /**
     * Analyzes file metadata changes to detect field deletions.
     * 
     * This method compares the properties of an entity class between two versions of a file.
     * A field deletion is detected when a property that is a field is present in the old
     * metadata but not in the new. It accounts for entity/field renames that may have
     * occurred in the same operation. It also includes a heuristic to avoid false positives
     * during active typing by checking the line content.
     * 
     * @param oldFileMeta The metadata of the file before the change.
     * @param newFileMeta The metadata of the file after the change.
     * @param accumulatedChanges Changes from other tools that have already been detected.
     * @returns An array of `ChangeObject` instances for any detected field deletions.
     */
    public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
        const changes: ChangeObject[] = [];
        if (!oldFileMeta || !newFileMeta || !isEntityFile(newFileMeta.uri)) {
            return [];
        }

        const classRenames = new Map<string, string>();
        const renamedFieldsByClass = new Map<string, Set<string>>();

        for (const change of accumulatedChanges) {
            if (change.type === 'RENAME_ENTITY' && change.payload.oldName && change.payload.newName) {
                classRenames.set(change.payload.oldName, change.payload.newName);
            }
            if (change.type === 'RENAME_FIELD' && change.payload.oldName && change.payload.entityName) {
                const oldClassName = change.payload.entityName;
                if (!renamedFieldsByClass.has(oldClassName)) {
                    renamedFieldsByClass.set(oldClassName, new Set());
                }
                renamedFieldsByClass.get(oldClassName)!.add(change.payload.oldName);
            }
        }

        for (const oldClassName in oldFileMeta.classes) {
            const oldClass = oldFileMeta.classes[oldClassName];
            const expectedNewClassName = classRenames.get(oldClassName) || oldClassName;
            const newClass = newFileMeta.classes[expectedNewClassName];

            if (!newClass || !isEntity(oldClass) || !isEntity(newClass)) {
                continue;
            }

            const oldProps = oldClass.properties;
            const newProps = newClass.properties;
            const removedPropNames = Object.keys(oldProps).filter(name => !(name in newProps));

            const renamedInThisClass = renamedFieldsByClass.get(oldClassName);

            let newFileLines: string[] | undefined;
            try {
                const newFileText = fs.readFileSync(newFileMeta.uri.fsPath, 'utf8');
                newFileLines = newFileText.split(/\r?\n/);
            } catch {
                // If we can't read the file we proceed without the heuristic.
            }

            for (const removedPropName of removedPropNames) {
                if (renamedInThisClass?.has(removedPropName)) {
                    continue;
                }

                const oldProp = oldProps[removedPropName];
                if (isField(oldProp)) {
                    if (newFileLines) {
                        const start = oldProp.declaration.range.start;
                        if (start.line < newFileLines.length) {
                            const lineText = newFileLines[start.line];
                            const afterCol = lineText.slice(start.character).trimStart();

                            if (afterCol.startsWith(':') || afterCol.startsWith('!:')) {
                                return [];
                            }
                        }
                    }
                    changes.push({
                        type: 'DELETE_FIELD',
                        uri: newFileMeta.uri,
                        description: `Field '${oldProp.name}' was deleted from Entity '${newClass.name}'.`,
                        payload: { oldFieldMetadata: oldProp, entityName: newClass.name }
                    });
                }
            }
        }
        return changes;
    }

    /**
     * Initiates a manual refactor to delete a field.
     * 
     * This method validates that the context contains a valid field and then constructs
     * a `ChangeObject` for the deletion.
     * @param context The manual refactor context.
     * @returns A promise that resolves to a `ChangeObject` for the deletion, or `undefined` if validation fails.
     */
    public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !('type' in context.metadata) || !isField(context.metadata)) {
            vscode.window.showErrorMessage('Could not find a valid field to delete.');
            return undefined;
        }

        const field = context.metadata as PropertyMetadata;
        return {
            type: 'DELETE_FIELD',
            uri: context.uri,
            description: `Delete field '${field.name}'.`,
            payload: { oldFieldMetadata: field, isManual: true }
        };
    }

    /**
     * Prepares a workspace edit for deleting a field.
     * 
     * For manual deletions, this method creates an edit to remove the entire field
     * declaration from the source file, including its decorators.
     * 
     * For both manual and automatic deletions, it finds all references to the field
     * (excluding the declaration itself) and replaces them with a placeholder comment.
     * 
     * @param change The change object containing deletion details.
     * @param cache The metadata cache (not used in this method).
     * @returns A promise that resolves to a `WorkspaceEdit` with all necessary changes.
     */
    public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const { oldFieldMetadata, isManual } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const field = oldFieldMetadata as PropertyMetadata;

        if (!field?.declaration?.range) {
            throw new Error(`Cannot delete field '${field.name}'; metadata is incomplete.`);
        }

        if (field.references) {
            for (const ref of field.references) {
                if (ref.uri.fsPath === field.declaration.uri.fsPath && areRangesEqual(ref.range, field.declaration.range)) {
                    continue;
                }
                workspaceEdit.replace(ref.uri, ref.range, '/* DELETED_FIELD_REFERENCE */');
            }
        }

        if (isManual) {
            let startPosition = field.declaration.range.start;
            if (field.decorators && field.decorators.length > 0) {
                for (const decorator of field.decorators) {
                    if (decorator.position && decorator.position.start.isBefore(startPosition)) {
                        startPosition = decorator.position.start;
                    }
                }
            }

            const doc = await vscode.workspace.openTextDocument(field.declaration.uri);
            const endLine = doc.lineAt(field.declaration.range.end.line);
            const fullRangeToDelete = new vscode.Range(startPosition, endLine.rangeIncludingLineBreak.end);

            workspaceEdit.delete(field.declaration.uri, fullRangeToDelete);
        }

        return workspaceEdit;
    }
}
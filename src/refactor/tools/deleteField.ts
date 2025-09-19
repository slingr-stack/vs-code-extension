import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, DeleteFieldPayload, ChangeType, RenameModelPayload, RenameFieldPayload } from '../refactorInterfaces';
import { FileMetadata, MetadataCache, PropertyMetadata } from '../../cache/cache';
import { isModel, isModelFile, isField, isPositionWithinRange } from '../../utils/metadata';
import { areRangesEqual } from '../../utils/metadata';
import * as fs from 'fs';

/**
 * Tool for handling field deletion from an model in TypeScript applications.
 * 
 * This tool provides functionality to:
 * - Detect when a field property is removed from an model class
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
 * // 1. Position the cursor on a field property within an model class.
 * // 2. Execute the "Delete Field" command.
 * // 3. Review changes in the Refactor Preview panel and apply.
 * @implements @see {@link IRefactorTool}
 */
export class DeleteFieldTool implements IRefactorTool {
    public getCommandId(): string {
        return 'slingr-vscode-extension.deleteField';
    }

    public getTitle(): string {
        return 'Delete Field';
    }

    public getHandledChangeTypes(): ChangeType[] {
        return ['DELETE_FIELD'];
    }

    /**
     * Determines if this tool can be triggered manually in the given context.
     * @param context The context for the manual refactoring.
     * @returns True if the context metadata represents a valid field.
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        if (!context.metadata) {
            return false;
        }
        return (isModelFile(context.uri) && isField(context.metadata));
    }
        

    /**
     * Analyzes file metadata changes to detect field deletions.
     * 
     * This method compares the properties of an model class between two versions of a file.
     * A field deletion is detected when a property that is a field is present in the old
     * metadata but not in the new. It accounts for model/field renames that may have
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
        if (!oldFileMeta || !newFileMeta || !isModelFile(newFileMeta.uri)) {
            return [];
        }

        const classRenames = new Map<string, string>();
        const renamedFieldsByClass = new Map<string, Set<string>>();

        for (const change of accumulatedChanges) {
            if (change.type === 'RENAME_MODEL') {
                const payload = change.payload;
                if (payload.oldName && payload.newName) {
                    classRenames.set(payload.oldName, payload.newName);
                }
            }
            if (change.type === 'RENAME_FIELD') {
                const payload = change.payload;
                if (payload.oldName && payload.modelName) {
                    const oldClassName = payload.modelName;
                    if (!renamedFieldsByClass.has(oldClassName)) {
                        renamedFieldsByClass.set(oldClassName, new Set());
                    }
                    renamedFieldsByClass.get(oldClassName)!.add(payload.oldName);
                }
            }
        }

        for (const oldClassName in oldFileMeta.classes) {
            const oldClass = oldFileMeta.classes[oldClassName];
            const expectedNewClassName = classRenames.get(oldClassName) || oldClassName;
            const newClass = newFileMeta.classes[expectedNewClassName];

            if (!newClass || !isModel(oldClass) || !isModel(newClass)) {
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
                    const payload: DeleteFieldPayload = {
                        oldFieldMetadata: oldProp,
                        modelName: newClass.name,
                        isManual: false
                    };
                    changes.push({
                        type: 'DELETE_FIELD',
                        uri: newFileMeta.uri,
                        description: `Field '${oldProp.name}' was deleted from Model '${newClass.name}'.`,
                        payload
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

        const field: PropertyMetadata = context.metadata;
            
        // Find the model name by getting the file metadata and looking for the class containing this field
        const fileMetadata = context.cache.getMetadataForFile(context.uri.fsPath);
        let modelName = 'Unknown';
        if (fileMetadata) {
            for (const [className, classData] of Object.entries(fileMetadata.classes)) {
                if (classData.properties[field.name] === field) {
                    modelName = className;
                    break;
                }
            }
        }
        
        const payload: DeleteFieldPayload = {
            oldFieldMetadata: field,
            modelName: modelName,
            isManual: true
        };
        
        return {
            type: 'DELETE_FIELD',
            uri: context.uri,
            description: `Delete field '${field.name}'.`,
            payload
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
        // Type guard to ensure we're working with the correct payload type
        if (change.type !== 'DELETE_FIELD') {
            throw new Error(`DeleteFieldTool can only handle DELETE_FIELD changes, received: ${change.type}`);
        }
        
        const payload = change.payload;
        const { oldFieldMetadata, isManual } = payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const field: PropertyMetadata = oldFieldMetadata;

        if (!field?.declaration?.range) {
            throw new Error(`Cannot delete field '${field.name}'; metadata is incomplete.`);
        }

        if (field.references) {
            for (const ref of field.references) {
                // Skip references that are the field declaration itself
                if (ref.uri.fsPath === field.declaration.uri.fsPath && areRangesEqual(ref.range, field.declaration.range)) {
                    continue;
                }
                
                // Skip references that are within the field's own decorators
                if (this.isReferenceWithinFieldDecorators(ref, field)) {
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

    /**
     * Checks if a reference is within the field's own decorators.
     * This prevents conflicts when deleting a field that has references to itself
     * in its decorator arguments (e.g., validation functions that reference the field).
     * 
     * @param reference The reference to check
     * @param field The field being deleted
     * @returns True if the reference is within the field's decorators, false otherwise
     */
    private isReferenceWithinFieldDecorators(reference: vscode.Location, field: PropertyMetadata): boolean {
        // If the reference is not in the same file as the field, it can't be in the decorators
        if (reference.uri.fsPath !== field.declaration.uri.fsPath) {
            return false;
        }

        // Check if the reference is within any of the field's decorators
        if (field.decorators && field.decorators.length > 0) {
            for (const decorator of field.decorators) {
                if (decorator.position && isPositionWithinRange(reference.range.start, decorator.position)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Executes a prompt to help fix broken field references after a field deletion.
     * 
     * This method generates and executes a chat prompt that guides the user through
     * fixing code references that were broken when a field was deleted from an model.
     * The prompt includes information about the deleted field, affected model, and
     * lists of modified file paths where broken references may exist.
     * 
     * @param change - The change object containing details about the field deletion
     *
     * @returns A promise that resolves when the chat command has been executed
     * 
     * @throws Will log an error to console if the chat command fails to execute
     */
    public async executePrompt(change: ChangeObject): Promise<void> {
        // Type guard to ensure we're working with the correct payload type
        if (change.type !== 'DELETE_FIELD') {
            console.error(`DeleteFieldTool can only execute prompts for DELETE_FIELD changes, received: ${change.type}`);
            return;
        }

        const payload = change.payload;
        const { modelName, oldFieldMetadata } = payload;
        const fieldName = oldFieldMetadata?.name || 'unknown';
        const fieldType = oldFieldMetadata?.type || 'unknown';
        
        // Build decorator information for context
        let decoratorInfo = '';
        if (oldFieldMetadata?.decorators && oldFieldMetadata.decorators.length > 0) {
            const decoratorNames = oldFieldMetadata.decorators.map(d => `@${d.name}`).join(', ');
            decoratorInfo = `\n\nThe deleted field had the following decorators: ${decoratorNames}`;
        }

        // Count references for better context
        const referenceCount = oldFieldMetadata?.references?.length || 0;
        const referenceInfo = referenceCount > 0 
            ? `\n\nThis field was referenced in ${referenceCount} location(s) throughout the codebase.`
            : '';

        const prompt = `## Field Deletion - Code Cleanup Required

I have deleted the field **\`${fieldName}: ${fieldType}\`** from the model **\`${modelName}\`**.${decoratorInfo}${referenceInfo}

**Problem:** This deletion has left broken references in the code, which are now marked with \`/* DELETED_FIELD_REFERENCE */\` comments.

**Your Task:** Help me fix these broken references by analyzing each occurrence and providing specific solutions.

### Instructions:

1. **Search for all occurrences** of \`/* DELETED_FIELD_REFERENCE */\` in the workspace
2. **For each occurrence, analyze the context** and determine the best fix:
   - **Remove the entire line/statement** if it's no longer needed
   - **Replace with alternative field** if there's a suitable replacement
   - **Refactor the logic** if the code needs to be restructured
   - **Add null checks or default values** if the field was optional

3. **Provide specific, actionable solutions** for each broken reference:
   - Show the **exact file and line number**
   - Provide **before/after code snippets**
   - Explain **why** each change is recommended

4. **Ask for confirmation** before applying any changes

### Common Patterns to Consider:
- Database queries that reference the deleted field
- Form validations that check the field
- API responses that include the field
- Tests that assert on the field value
- UI components that display the field

Please analyze each broken reference systematically and provide clear, implementable solutions.`;

        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        } catch (error) {
            console.error('Failed to open chat with custom prompt:', error);
        }
    }
}
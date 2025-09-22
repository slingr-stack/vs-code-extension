import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, ChangeFieldToSingleValuePayload } from '../refactorInterfaces';
import { MetadataCache, PropertyMetadata } from '../../cache/cache';
import { isModelFile, isField, areRangesEqual, isFieldMultiple } from '../../utils/metadata';

/**
 * Tool to change a field from an array type to a single value type.
 * E.g., changes `tags: string[]` to `tag: string` and updates all references.
 */
export class ChangeFieldToSingleValueTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.changeFieldToSingleValue';
    }

    getTitle(): string {
        return 'Change to single value';
    }

    getHandledChangeTypes(): string[] {
        return ['CHANGE_FIELD_TO_SINGLE_VALUE'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        if (!context.metadata) {
            return false;
        }
        if (isModelFile(context.uri) && isField(context.metadata)) {
            const field = context.metadata as PropertyMetadata;
            // A field can be changed to a single value if its type ends with '[]'
            return isFieldMultiple(field);
        }
        return false;
    }

    analyze(): ChangeObject[] {
        // This refactor is manual-only for now
        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !isField(context.metadata)) {
            return undefined;
        }
        const field = context.metadata as PropertyMetadata;

        // Find the containing model's name for context
        const fileMetadata = context.cache.getMetadataForFile(context.uri.fsPath);
        let modelName = 'UnknownModel';
        if (fileMetadata) {
            for (const [className, classData] of Object.entries(fileMetadata.classes)) {
                if (classData.properties[field.name]) {
                    modelName = className;
                    break;
                }
            }
        }

        const payload: ChangeFieldToSingleValuePayload = {
            field: context.metadata as PropertyMetadata,
            modelName,
            isManual: true,
        };

        return {
            type: 'CHANGE_FIELD_TO_SINGLE_VALUE',
            uri: context.uri,
            description: `Change field '${payload.field.name}' to single value.`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    if (change.type !== 'CHANGE_FIELD_TO_SINGLE_VALUE') {
        throw new Error(`ChangeFieldToSingleValueTool can only handle CHANGE_FIELD_TO_SINGLE_VALUE changes, received: ${change.type}`);
    }

    const { field } = change.payload;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const { declaration, references = [] } = field;

    // Change type from an array to a single value
    const newType = field.type.replace('[]', '');
    const document = await vscode.workspace.openTextDocument(declaration.uri);
    const lineText = document.lineAt(declaration.range.start.line).text;

    // Helper to escape special characters for use in a regular expression.
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Build a robust regex that captures the base type and the array brackets separately.
    const typeRegex = new RegExp(`(:\\s*${escapeRegExp(newType)})(\\[\\])`);
    const match = lineText.match(typeRegex);

    if (match && typeof match.index === 'number') {
        // The full text that was matched, e.g., ": string[]"
        const fullMatchedText = match[0];
        const replacementText = match[1]; // e.g., ": string"
        const startPos = new vscode.Position(declaration.range.start.line, match.index);
        const endPos = startPos.translate(0, fullMatchedText.length);
        const typeRange = new vscode.Range(startPos, endPos);

        workspaceEdit.replace(declaration.uri, typeRange, replacementText);
    }

    // Singularize name if it's plural and update all references
    if (field.name.endsWith('s')) {
        const newName = field.name.slice(0, -1);
        // Update the declaration
        workspaceEdit.replace(declaration.uri, declaration.range, newName);

        for (const ref of references) {
            // Skip the declaration itself
            if (ref.uri.fsPath === declaration.uri.fsPath && areRangesEqual(ref.range, declaration.range)) {
                continue;
            }
            workspaceEdit.replace(ref.uri, ref.range, newName);
        }
    }

    return workspaceEdit;
}

    async executePrompt(change: ChangeObject): Promise<void> {
        if (change.type !== 'CHANGE_FIELD_TO_SINGLE_VALUE') return;

        const { field, modelName } = change.payload;
        const oldName = field.name;
        const newName = oldName.endsWith('s') ? oldName.slice(0, -1) : oldName;
        const oldType = field.type;
        const newType = oldType.replace('[]', '');
        const referenceLocations = field.references
            .map(ref => `- \`${ref.uri.fsPath.split('/').pop()}\` at line ${ref.range.start.line + 1}`)
            .join('\n');

        const prompt = `## Field Refactoring - Code Review Required

The field **\`${oldName}\`** in the model **\`${modelName}\`** has been refactored to be a single value.

**Changes Applied:**
- **Name Change:** \`${oldName}\` -> \`${newName}\`
- **Type Change:** \`${oldType}\`[] -> \`${newType}\`
- All direct references to the field name have been updated.

**Problem:** The logic using this field might now be incorrect. Code that treated it as an array (e.g., \`record.${newName}.push('value')\`) will now need to handle a single value (e.g., \`record.${newName} = 'value'\`). This could also affect how you handle null or undefined values.

**Your Task:** Help me review and fix the code that uses this field.

### Instructions:

1.  **Analyze the following locations** where the field was referenced. The logic in these places is likely broken.
2.  **For each location, suggest the necessary code changes** to correctly handle the new single-value type. You might need to decide which element of the former array to use (e.g., the first one) or how to handle cases where the array was empty.
3.  **Provide clear before/after code snippets** and explain your reasoning.

### Reference Locations to Check:
${referenceLocations}

### Common Patterns to Fix:
-   **Array methods:** Replace \`.push()\`, \`.includes()\`, \`.map()\`, etc., with direct assignment or comparison.
-   **Loops:** Remove loops that iterated over the field.
-   **Assignments:** Ensure a single value is being assigned, not an array.
-   **UI Display:** Adjust UI components that expected a list.

Please start by analyzing the first reference location, paying close attention to how to resolve the array-to-single-value logic.`;

        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        } catch (error) {
            console.error('Failed to open chat with custom prompt:', error);
        }
    }
}
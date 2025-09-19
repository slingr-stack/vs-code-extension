import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, ChangeFieldToArrayPayload } from '../refactorInterfaces';
import { MetadataCache, PropertyMetadata } from '../../cache/cache';
import { isModelFile, isField, areRangesEqual } from '../../utils/metadata';

/**
 * Tool to change a field from a single value type to an array type.
 * E.g., changes `tag: string` to `tags: string[]` and updates all references.
 */
export class ChangeFieldToArrayTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.changeFieldToArray';
    }

    getTitle(): string {
        return 'Change to array';
    }

    getHandledChangeTypes(): string[] {
        return ['CHANGE_FIELD_TO_ARRAY'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        if (!context.metadata) {
            return false;
        }
        if (isModelFile(context.uri) && isField(context.metadata)) {
            const field = context.metadata as PropertyMetadata;
            return !field.type.endsWith('[]');
        }
        return false;
    }

    analyze(): ChangeObject[] {
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

        const payload: ChangeFieldToArrayPayload = {
            field: context.metadata as PropertyMetadata,
            modelName,
            isManual: true,
        };

        return {
            type: 'CHANGE_FIELD_TO_ARRAY',
            uri: context.uri,
            description: `Change field '${payload.field.name}' to array.`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        if (change.type !== 'CHANGE_FIELD_TO_ARRAY') {
            throw new Error(`ChangeFieldToArrayTool can only handle CHANGE_FIELD_TO_ARRAY changes, received: ${change.type}`);
        }

        const { field } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const { declaration, references = [] } = field;

        // 1. Change the field's type to an array type
        const document = await vscode.workspace.openTextDocument(declaration.uri);
        const lineText = document.lineAt(declaration.range.start.line).text;
        const typeRegex = new RegExp(`:\\s*${field.type}`);
        const match = lineText.match(typeRegex);

        if (match && typeof match.index === 'number') {
            const startPos = new vscode.Position(declaration.range.start.line, match.index);
            const typeNodeText = match[0];
            const endPos = startPos.translate(0, typeNodeText.length);
            const typeRange = new vscode.Range(startPos, endPos);
            workspaceEdit.replace(declaration.uri, typeRange, `: ${field.type}[]`);
        }

        // 2. Pluralize name if it's not already plural and update all references
        if (!field.name.endsWith('s')) {
            const newName = `${field.name}s`;
            // Update the declaration
            workspaceEdit.replace(declaration.uri, declaration.range, newName);

            // Update all other references
            for (const ref of references) {
                // Skip the declaration itself as we just handled it
                if (ref.uri.fsPath === declaration.uri.fsPath && areRangesEqual(ref.range, declaration.range)) {
                    continue;
                }
                workspaceEdit.replace(ref.uri, ref.range, newName);
            }
        }

        return workspaceEdit;
    }

    async executePrompt(change: ChangeObject): Promise<void> {
        if (change.type !== 'CHANGE_FIELD_TO_ARRAY') return;

        const { field, modelName } = change.payload;
        const oldName = field.name;
        const newName = oldName.endsWith('s') ? oldName : `${oldName}s`;
        const oldType = field.type;
        const newType = `${oldType}[]`;
        const referenceLocations = field.references
            .map(ref => `- \`${ref.uri.fsPath.split('/').pop()}\` at line ${ref.range.start.line + 1}`)
            .join('\n');

        const prompt = `## Field Refactoring - Code Review Required

The field **\`${oldName}\`** in the model **\`${modelName}\`** has been refactored to be an array.

**Changes Applied:**
- **Name Change:** \`${oldName}\` -> \`${newName}\`
- **Type Change:** \`${oldType}\` -> \`${newType}\`
- All direct references to the field name have been updated.

**Problem:** The logic using this field might now be incorrect. For example, code that treated it as a single value (e.g., \`record.${newName} === 'value'\`) will now need to handle an array (e.g., \`record.${newName}.includes('value')\`).

**Your Task:** Help me review and fix the code that uses this field.

### Instructions:

1.  **Analyze the following locations** where the field was referenced. The logic in these places is likely broken.
2.  **For each location, suggest the necessary code changes** to correctly handle the new array type.
3.  **Provide clear before/after code snippets** and explain why the change is needed.

### Reference Locations to Check:
${referenceLocations}

### Common Patterns to Fix:
-   **Direct comparisons:** Change \`===, !==\` to \`.includes()\` or loops.
-   **Assignments:** Ensure an array is being assigned, not a single value.
-   **UI Display:** Adjust how the field is rendered to show a list or tags.
-   **Function arguments:** Update functions that expected a single value.

Please start by analyzing the first reference location.`;

        try {
            await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        } catch (error) {
            console.error('Failed to open chat with custom prompt:', error);
        }
    }
}
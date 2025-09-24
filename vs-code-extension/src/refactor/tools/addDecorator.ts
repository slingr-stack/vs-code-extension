import * as vscode from 'vscode';
import { AddDecoratorPayload, ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { PropertyMetadata } from '../../cache/cache';
import { isField, isModelFile } from '../../utils/metadata';

/**
 * Tool for adding decorators to fields in Slingr model files.
 * 
 * This refactor tool allows users to manually add TypeScript decorators to field definitions
 * in model files. The tool handles the insertion of decorators with proper formatting and
 * indentation, placing them on the line above the target field declaration.
 */
export class AddDecoratorTool implements IRefactorTool {
    /**
     * Returns the unique command identifier for this refactor tool.
     * This ID is used to register the command with VS Code and identify
     * the tool in the refactor system.
     * 
     * @returns The command ID string used by VS Code
     */
    public getCommandId(): string {
        return 'slingr-vscode-extension.addDecorator';
    }

    /**
     * Returns the human-readable title for this refactor tool.
     * This title is displayed in VS Code's refactor menu and UI elements.
     * 
     * @returns The display title for the tool
     */
    public getTitle(): string {
        return 'Add Decorator';
    }

    /**
     * Returns the list of change types that this tool can handle.
     * This is used by the refactor system to route changes to the appropriate tool.
     * 
     * @returns Array of change type strings that this tool processes
     */
    public getHandledChangeTypes(): string[] {
        return ['ADD_DECORATOR'];
    }

    /**
     * Determines if this tool can handle a manual refactor trigger for the given context.
     * 
     * This tool can be manually triggered when:
     * - The file is a model file (contains model definitions)
     * - The context contains valid metadata with a 'type' property
     * - The metadata represents a field that can have decorators added
     * 
     * @param context The manual refactor context containing URI and metadata
     * @returns Promise<boolean> True if the tool can handle the refactor, false otherwise
     */
    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        if (context.metadata) {
            return isModelFile(context.uri) && 'type' in context.metadata;
        }
        return false;
    }

    /**
     * This tool does not participate in automatic change detection.
     * 
     * @returns Empty array since this tool doesn't detect automatic changes
     */
    public analyze(): ChangeObject[] {
        return [];
    }

    /**
     * Initiates a manual refactor operation to add a decorator to a field.
     * 
     * This method is called by the CodeAction system when a user manually triggers
     * the "Add Decorator" refactor. It creates a ChangeObject that describes the
     * operation to be performed.
     * 
     * @param context The manual refactor context containing the target URI and field metadata
     * @param decoratorName The name of the decorator to add (without the @ symbol)
     * @returns Promise<ChangeObject | undefined> A change object describing the refactor, or undefined if invalid
     */
    public async initiateManualRefactor(context: ManualRefactorContext, decoratorName?: string): Promise<ChangeObject | undefined> {
        if (!context.metadata) {
            return undefined;
        }
        if (!decoratorName) {
            return undefined;
        }
        const payload: AddDecoratorPayload = {
            fieldMetadata: context.metadata as PropertyMetadata,
            decoratorName,
            isManual: true,
        };
        return {
            type: 'ADD_DECORATOR',
            uri: context.uri,
            description: `Add @${decoratorName} decorator to '${context.metadata.name}'.`,
            payload,
        };
    }

    /**
     * Prepares the workspace edit for adding a decorator to a field.
     * 
     * This method performs the actual text manipulation to insert the decorator
     * in the correct location with proper formatting.
     * 
     * @param change The change object containing the ADD_DECORATOR payload
     * @returns Promise<vscode.WorkspaceEdit> A workspace edit ready to be applied
     */
    public async prepareEdit(change: ChangeObject): Promise<vscode.WorkspaceEdit> {
        if (change.type !== 'ADD_DECORATOR') {
            throw new Error(`AddDecoratorTool can only handle ADD_DECORATOR changes, received: ${change.type}`);
        }
        const payload = change.payload;
        const { fieldMetadata, decoratorName } = payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const document = await vscode.workspace.openTextDocument(fieldMetadata.declaration.uri);
        const fieldLine = document.lineAt(fieldMetadata.declaration.range.start.line);
        const indentation = fieldLine.text.substring(0, fieldLine.firstNonWhitespaceCharacterIndex);
        const textToInsert = `@${decoratorName}()\n${indentation}`;
        const insertPosition = new vscode.Position(fieldMetadata.declaration.range.start.line, fieldMetadata.declaration.range.start.character);
        workspaceEdit.insert(fieldMetadata.declaration.uri, insertPosition, textToInsert);

        return workspaceEdit;
    }
}
import * as vscode from 'vscode';
import { RefactorController } from './RefactorController';
import { IRefactorTool, ManualRefactorContext } from './refactorInterfaces';
import { RenameModelTool } from './tools/renameModel';
import { DeleteModelTool } from './tools/deleteModel';
import { RenameFieldTool } from './tools/renameField';
import { DeleteFieldTool } from './tools/deleteField';
import { ChangeFieldTypeTool } from './tools/changeFieldType';
import { findNodeAtPosition } from '../utils/ast';
import { cache } from '../extension';
import { AppTreeItem } from '../explorer/appTreeItem';
import { AddDecoratorTool } from './tools/addDecorator';
import { ChangeReferenceToCompositionRefactorTool } from './tools/changeReferenceToComposition';
import { ChangeCompositionToReferenceRefactorTool } from './tools/changeCompositionToReference';
import { ExtractFieldsToCompositionTool } from '../commands/fields/extractFieldsToComposition';
import { isField, isModelFile } from '../utils/metadata';
import { ExtractFieldsToReferenceTool } from '../commands/fields/extractFieldsToReference';
import { PropertyMetadata } from '../cache/cache';
import { fieldTypeConfig } from '../utils/fieldTypes';
import { RenameDataSourceTool } from './tools/renameDataSource';
import { DeleteDataSourceTool } from './tools/deleteDataSource';

/**
 * Returns an array of all available refactor tools for the application.
 * @remarks
 * The order of tools in the returned array is significant, as some refactoring 
 * operations may have dependencies on or affect the behavior of others.
 * @returns An array containing instances of all refactor tools including:
 * - DeleteModelTool: Handles model deletion operations  
 * - RenameModelTool: Handles model renaming operations
 * - RenameFieldTool: Handles field renaming operations
 * - DeleteFieldTool: Handles field deletion operations
 * - ChangeFieldTypeTool: Handles field type modification operations
 * - ExtractFieldsToCompositionTool: Handles extracting fields to composition models
 * - AddDecoratorTool: Handles adding decorators to fields
 * - RenameDataSourceTool: Handles data source renaming operations
 * - DeleteDataSourceTool: Handles data source deletion operations
 */
export function getAllRefactorTools(): IRefactorTool[] {
    return [
        new DeleteModelTool(),
        new RenameModelTool(),
        new RenameFieldTool(),
        new DeleteFieldTool(),
        new ChangeFieldTypeTool(),
        new AddDecoratorTool(),
        new ChangeReferenceToCompositionRefactorTool(),
        new ChangeCompositionToReferenceRefactorTool(),
        new ExtractFieldsToCompositionTool(),
        new RenameDataSourceTool(),
        new DeleteDataSourceTool(),
        new ExtractFieldsToReferenceTool(),
    ];
}


/**
 * Registers all refactor commands and code action providers for the VS Code extension.
 * This function sets up the refactoring infrastructure by:
 * - Registering individual commands for each refactor tool available in the controller
 * - Setting up a CodeActionProvider to show refactoring options in the editor (lightbulb menu)
 * - Configuring the provider to work with TypeScript files and provide refactor code actions
 * @param controller - The refactor controller that manages refactor tools and handles command execution
 * @returns An array of disposables that can be used to clean up the registered commands and providers
 */
export function registerRefactorCommands(controller: RefactorController, context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    for (const tool of controller.getTools()) {
        disposables.push(
            vscode.commands.registerCommand(tool.getCommandId(), (context?: vscode.Uri | AppTreeItem | ManualRefactorContext, secondArg?: any) => {
                // The command can now be called with more complex arguments from CodeActions or tree view multi-selection
                if (context && 'cache' in context && 'uri' in context) {
                    // ManualRefactorContext case - secondArg might be decoratorName
                    controller.handleManualRefactorCommand(tool.getCommandId(), context, secondArg);
                } else {
                    // Tree view context case - secondArg might be the selected items array
                    controller.handleManualRefactorCommand(tool.getCommandId(), context, secondArg);
                }
            })
        );
    }

    const allTools = controller.getTools();
    const codeActionProvider = new RefactorCodeActionProvider(allTools);
    disposables.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'typescript' },
            codeActionProvider,
            { providedCodeActionKinds: [vscode.CodeActionKind.Refactor] }
        )
    );
    return disposables;
}

/**
 * Provides code actions for refactoring operations in VS Code.
 * This class implements the VS Code CodeActionProvider interface to offer
 * refactoring suggestions and actions to users. It evaluates available refactor
 * tools against the current document context and presents applicable refactoring
 * options in the code action menu.
 */
export class RefactorCodeActionProvider implements vscode.CodeActionProvider {
    constructor(private tools: IRefactorTool[]) {}

    /**
     * Provides code actions for refactoring operations at a specific location in the document.
     * This method is called by VS Code when the user requests code actions (e.g., through the light bulb menu
     * or quick fix context menu). It iterates through available refactoring tools and creates code actions
     * for those that can handle manual triggers at the specified position.
     * @param document - The text document for which code actions are requested
     * @param range - The range or selection in the document where code actions are requested
     * @param context - Additional context information about the code action request
     * @param token - Cancellation token to cancel the operation if needed
     * @returns Promise that resolves to an array of available code actions for refactoring
     */
    public async provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<vscode.CodeAction[]> {
        const codeActions: vscode.CodeAction[] = [];
        const position = range.start;
        const metadata = await findNodeAtPosition(document.uri, position);
        const refactorContext: ManualRefactorContext = {
            cache,
            uri: document.uri,
            range: new vscode.Range(position, position),
            metadata: metadata
        };

        for (const tool of this.tools) {
            if (tool.getCommandId() === 'slingr-vscode-extension.addDecorator') {
                continue;
            }
            if (await tool.canHandleManualTrigger(refactorContext)) {
                const action = new vscode.CodeAction(tool.getTitle(), vscode.CodeActionKind.Refactor);
                action.command = {
                    command: tool.getCommandId(),
                    title: tool.getTitle(),
                    arguments: [refactorContext]
                };
                codeActions.push(action);
            }
        }

        // This block should only run if we are on a field.
        if (isModelFile(document.uri) && metadata && isField(metadata)) {
            const fieldMetadata = metadata as PropertyMetadata;
            const existingDecorators = new Set(fieldMetadata.decorators.map(d => d.name));

            // Suggest @Field() if not present
            if (!existingDecorators.has('Field')) {
                const action = new vscode.CodeAction('Add @Field Decorator', vscode.CodeActionKind.Refactor);
                action.command = {
                    command: 'slingr-vscode-extension.addDecorator',
                    title: 'Add @Field Decorator',
                    arguments: [refactorContext, 'Field']
                };
                codeActions.push(action);
            }

            // Suggest type-specific decorators based on fieldTypes.ts
            const fieldTsType = fieldMetadata.type.toLowerCase();
            for (const decoratorName in fieldTypeConfig) {
                const config = fieldTypeConfig[decoratorName];
                if (config.mapsFromTsTypes?.includes(fieldTsType) && !existingDecorators.has(decoratorName)) {
                     const action = new vscode.CodeAction(`Add @${decoratorName} Decorator`, vscode.CodeActionKind.Refactor);
                     action.command = {
                         command: 'slingr-vscode-extension.addDecorator',
                         title: `Add @${decoratorName} Decorator`,
                         arguments: [refactorContext, decoratorName]
                     };
                     codeActions.push(action);
                }
            }
        }
        return codeActions;
    }
}
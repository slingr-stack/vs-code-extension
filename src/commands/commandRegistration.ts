import * as vscode from 'vscode';
import { DecoratedClass, MetadataCache } from '../cache/cache';
import { ExplorerProvider } from '../explorer/explorerProvider';
import { NewModelTool } from './models/newModel';
import { DefineFieldsTool } from './fields/defineFields';
import { AddFieldTool } from './fields/addField';
import { NewFolderTool } from './folders/newFolder';
import { DeleteFolderTool } from './folders/deleteFolder';
import { RenameFolderTool } from './folders/renameFolder';
import { CreateTestTool } from './createTest';
import { AppTreeItem } from '../explorer/appTreeItem';
import { CreateModelFromDescriptionTool } from './models/createModelFromDesc';
import { ModifyModelTool } from './models/modifyModel';
import { AddCompositionTool } from './models/addComposition';
import { AIService } from '../services/aiService';
import { ProjectAnalysisService } from '../services/projectAnalysisService';

export function registerGeneralCommands(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    explorerProvider: ExplorerProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const aiService = new AIService();
    const projectAnalysisService = new ProjectAnalysisService();

    // Navigation command
    const navigateToCodeCommand = vscode.commands.registerCommand('slingr-vscode-extension.navigateToCode', (location: vscode.Location) => {
        vscode.window.showTextDocument(location.uri).then(editor => {
            editor.selection = new vscode.Selection(location.range.start, location.range.end);
            editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
        });
    });
    disposables.push(navigateToCodeCommand);

    // Hello World command (placeholder/example)
    const helloWorldCommand = vscode.commands.registerCommand('slingr-vscode-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Slingr VS Code Extension!');
    });
    disposables.push(helloWorldCommand);

    // Refresh Navigation command
    const refreshNavigationCommand = vscode.commands.registerCommand('slingr-vscode-extension.refreshNavigation', () => {
        explorerProvider.refresh();
        vscode.window.showInformationMessage('App navigation refreshed');
    });
    disposables.push(refreshNavigationCommand);

    // New Model Tool
    const newModelTool = new NewModelTool();
    const newModelCommand = vscode.commands.registerCommand('slingr-vscode-extension.newModel', (uri?: vscode.Uri | AppTreeItem) => {
        // If no URI provided, use the current workspace folder
        const targetUri = uri || (vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(''));
        return newModelTool.createNewModel(targetUri, cache);
    });
    disposables.push(newModelCommand);

    // Define Fields Tool
    const defineFieldsTool = new DefineFieldsTool();
    const defineFieldsCommand = vscode.commands.registerCommand('slingr-vscode-extension.defineFields', async (uri?: vscode.Uri | AppTreeItem) => {
        let targetUri: vscode.Uri;

        if (uri) {
            // URI provided from context menu (right-click on file in explorer)
            if (uri instanceof vscode.Uri) {
                targetUri = uri;
            } else {
                // AppTreeItem case - check if it's a model with metadata
                if (uri.itemType === 'model' && uri.metadata?.declaration?.uri) {
                    targetUri = uri.metadata.declaration.uri;
                } else {
                    vscode.window.showErrorMessage('Please select a model file to define fields for.');
                    return;
                }
            }
        } else {
            // Fallback to active editor if no URI provided
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('Please select a model file or open one in the editor to define fields.');
                return;
            }
            targetUri = activeEditor.document.uri;
        }

        // Validate that it's a TypeScript file
        if (!targetUri.fsPath.endsWith('.ts')) {
            vscode.window.showErrorMessage('Please select a TypeScript model file (.ts).');
            return;
        }

        // Open the document to extract model information
        const document = await vscode.workspace.openTextDocument(targetUri);
        const content = document.getText();
        
        // Check if this is a model file
        if (!content.includes('@Model')) {
            vscode.window.showErrorMessage('The selected file does not appear to be a model file.');
            return;
        }

        const model = await projectAnalysisService.findModelClass(document, cache);

        if (!model) {
            vscode.window.showErrorMessage('Could not identify a model class in the selected file.');
            return;
        }
        const modelName = model?.name;
        
        // Get field descriptions from user
        const fieldsDescription = await vscode.window.showInputBox({
            prompt: "Enter field descriptions to be processed by AI",
            placeHolder: "e.g., title, description, project (relationship to Project), status (enum: todo, in-progress, done)",
            ignoreFocusOut: true
        });

        if (!fieldsDescription) {
            return; // User cancelled
        }

        try {
            await defineFieldsTool.processFieldDescriptions(
                fieldsDescription,
                targetUri,
                cache,
                modelName
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process field descriptions: ${error}`);
        }
    });
    disposables.push(defineFieldsCommand);

    // Add Field Tool
    const addFieldTool = new AddFieldTool();
    const addFieldCommand = vscode.commands.registerCommand('slingr-vscode-extension.addField', async (uri?: vscode.Uri | AppTreeItem) => {
        let targetUri: vscode.Uri;

        if (uri) {
            // URI provided from context menu (right-click on file in explorer)
            if (uri instanceof vscode.Uri) {
                targetUri = uri;
            } else {
                // AppTreeItem case - check if it's a model with metadata
                if (uri.itemType === 'model' && uri.metadata?.declaration?.uri) {
                    targetUri = uri.metadata.declaration.uri;
                } else {
                    vscode.window.showErrorMessage('Please select a model file to add a field to.');
                    return;
                }
            }
        } else {
            // Fallback to active editor if no URI provided
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('Please select a model file or open one in the editor to add a field.');
                return;
            }
            targetUri = activeEditor.document.uri;
        }

        // Validate that it's a TypeScript file
        if (!targetUri.fsPath.endsWith('.ts')) {
            vscode.window.showErrorMessage('Please select a TypeScript model file (.ts).');
            return;
        }

        try {
            await addFieldTool.addField(targetUri, cache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add field: ${error}`);
        }
    });
    disposables.push(addFieldCommand);

    // Add Composition Tool
    const addCompositionTool = new AddCompositionTool(explorerProvider);
    const addCompositionCommand = vscode.commands.registerCommand('slingr-vscode-extension.addComposition', async (uri?: vscode.Uri | AppTreeItem) => {
        let targetUri: vscode.Uri;
        let modelName: string | undefined;

        if (uri) {
            // URI provided from context menu (right-click on file in explorer)
            if (uri instanceof vscode.Uri) {
                targetUri = uri;
            } else {
                // AppTreeItem case - check if it's a model with metadata
                if (uri.itemType === 'model' && uri.metadata?.declaration?.uri) {
                    targetUri = uri.metadata.declaration.uri;
                    modelName = uri.metadata?.name;
                } else {
                    vscode.window.showErrorMessage('Please select a model file to add a composition to.');
                    return;
                }
            }
        } else {
            throw new Error('URI must be provided to add a composition.');
        }

        // Validate that it's a TypeScript file
        if (!targetUri.fsPath.endsWith('.ts')) {
            vscode.window.showErrorMessage('Please select a TypeScript model file (.ts).');
            return;
        }

        try {
            if (modelName) {
                await addCompositionTool.addComposition(cache, modelName);
            }
            else{
                vscode.window.showErrorMessage('Model name could not be determined.');
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add composition: ${error}`);
        }
    });
    disposables.push(addCompositionCommand);

    // New Folder Tool
    const newFolderTool = new NewFolderTool();
    const newFolderCommand = vscode.commands.registerCommand('slingr-vscode-extension.newFolder', (uri?: vscode.Uri | AppTreeItem) => {
        return newFolderTool.createFolder(explorerProvider, uri);
    });
    disposables.push(newFolderCommand);

    // Delete Folder Tool
    const deleteFolderTool = new DeleteFolderTool();
    const deleteFolderCommand = vscode.commands.registerCommand('slingr-vscode-extension.deleteFolder', (uri?: vscode.Uri | AppTreeItem) => {
        return deleteFolderTool.deleteFolder(explorerProvider, cache, uri);
    });
    disposables.push(deleteFolderCommand);

    // Rename Folder Tool
    const renameFolderTool = new RenameFolderTool();
    const renameFolderCommand = vscode.commands.registerCommand('slingr-vscode-extension.renameFolder', (uri?: vscode.Uri | AppTreeItem) => {
        return renameFolderTool.renameFolder(explorerProvider, cache, uri);
    });
    disposables.push(renameFolderCommand);

    // Create Test Tool
    const createTestTool = new CreateTestTool(aiService);
    const createTestCommand = vscode.commands.registerCommand('slingr-vscode-extension.createTest', async (uri?: vscode.Uri | AppTreeItem) => {
        let targetUri: vscode.Uri;

        if (uri) {
            // URI provided from context menu (right-click on file in explorer)
            if (uri instanceof vscode.Uri) {
                targetUri = uri;
            } else {
                // AppTreeItem case - check if it's a model with metadata
                if (uri.itemType === 'model' && uri.metadata?.declaration?.uri) {
                    targetUri = uri.metadata.declaration.uri;
                } else {
                    vscode.window.showErrorMessage('Please select a model file to create a test for.');
                    return;
                }
            }
        } else {
            // Fallback to active editor if no URI provided
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('Please select a model file or open one in the editor to create a test.');
                return;
            }
            targetUri = activeEditor.document.uri;
        }

        // Validate that it's a TypeScript file
        if (!targetUri.fsPath.endsWith('.ts')) {
            vscode.window.showErrorMessage('Please select a TypeScript model file (.ts).');
            return;
        }

        try {
            await createTestTool.createTest(targetUri, cache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create test: ${error}`);
        }
    });
    disposables.push(createTestCommand);

    // General refactor command (placeholder for refactor controller integration)
    const refactorCommand = vscode.commands.registerCommand('slingr-vscode-extension.refactor', () => {
        vscode.window.showInformationMessage('Refactor command executed - specific refactor tools are available in the context menu.');
    });
    disposables.push(refactorCommand);

    // Create Model from Description Tool
    const createModelFromDescriptionTool = new CreateModelFromDescriptionTool(aiService);
    const createModelFromDescriptionCommand = vscode.commands.registerCommand('slingr-vscode-extension.createModelFromDescription', (context?: vscode.Uri | AppTreeItem) => {
        return createModelFromDescriptionTool.createModel(cache, context);
    });
    disposables.push(createModelFromDescriptionCommand);

    // Modify Model Tool
    const modifyModelTool = new ModifyModelTool(aiService);
    const modifyModelCommand = vscode.commands.registerCommand('slingr-vscode-extension.modifyModel', () => {
        return modifyModelTool.modifyModel(cache);
    });
    disposables.push(modifyModelCommand);

    return disposables;
}
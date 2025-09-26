import * as vscode from 'vscode';
<<<<<<< HEAD
import { DecoratedClass, MetadataCache } from '../cache/cache';
=======
import { MetadataCache } from '../cache/cache';
>>>>>>> framework/main
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
<<<<<<< HEAD
import { AddCompositionTool } from './models/addComposition';
import { AddReferenceTool } from './models/addReference';
import { AIService } from '../services/aiService';
import { ProjectAnalysisService } from '../services/projectAnalysisService';
import { registerCommand, URI_OPTIONS, UriResolutionResult, resolveTargetUri, registerTreeViewAwareCommand, TreeViewContext } from './commandHelpers';
import { ExtractFieldsToCompositionTool } from './fields/extractFieldsToComposition';
import { ExtractFieldsToReferenceTool } from './fields/extractFieldsToReference';
import { ExtractFieldsToEmbeddedTool } from './fields/extractFieldsToEmbedded';
import { ExtractFieldsToParentTool } from './fields/extractFieldsToParent';
=======
import { AIService } from '../services/aiService';
>>>>>>> framework/main
import { NewDataSourceTool } from './newDataSource';
import { createLaunchConfiguration } from './setupLaunchConfig';
import { createTasksConfiguration } from './setupTaskConfig';

export function registerGeneralCommands(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    explorerProvider: ExplorerProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const aiService = new AIService();
<<<<<<< HEAD
    const projectAnalysisService = new ProjectAnalysisService();


=======
>>>>>>> framework/main

    // Navigation command
    const navigateToCodeCommand = vscode.commands.registerCommand('slingr-vscode-extension.navigateToCode', (location: vscode.Location) => {
        vscode.window.showTextDocument(location.uri).then(editor => {
            editor.selection = new vscode.Selection(location.range.start, location.range.end);
            editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
        });
    });
    disposables.push(navigateToCodeCommand);

     // Register the command to set up the launch configuration
    const setupCommand = vscode.commands.registerCommand('slingr.createDebugConfig', async () => {
        await createLaunchConfiguration();
        await createTasksConfiguration();
    });
    createLaunchConfiguration();
    createTasksConfiguration();

    disposables.push(setupCommand);

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
<<<<<<< HEAD
        return newModelTool.createNewModel(uri, cache);
=======
        // If no URI provided, use the current workspace folder
        const targetUri = uri || (vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(''));
        return newModelTool.createNewModel(targetUri, cache);
>>>>>>> framework/main
    });
    disposables.push(newModelCommand);

    // Define Fields Tool
    const defineFieldsTool = new DefineFieldsTool();
<<<<<<< HEAD
    registerCommand(
        disposables,
        'slingr-vscode-extension.defineFields',
        async (result: UriResolutionResult) => {
            if(!result.modelName) {
                throw new Error('Model name could not be determined.');
            }
            const model = cache.getModelByName(result.modelName);
            if (!model) {
                throw new Error('Could not identify a model class in the selected file.');
            }
            
            // Get field descriptions from user
            const fieldsDescription = await vscode.window.showInputBox({
                prompt: "Enter field descriptions to be processed by AI",
                placeHolder: "e.g., title, description, project (relationship to Project), status (enum: todo, in-progress, done)",
                ignoreFocusOut: true
            });

            if (!fieldsDescription) {
                return; // User cancelled
            }

            await defineFieldsTool.processFieldDescriptions(
                fieldsDescription,
                result.targetUri,
                cache,
                model.name
            );
        },
        URI_OPTIONS.MODEL_FILE
    );

    // Add Field Tool
    const addFieldTool = new AddFieldTool();
    registerCommand(
        disposables,
        'slingr-vscode-extension.addField',
        async (result: UriResolutionResult) => {
            if (!result.modelName) {
                throw new Error('Model name could not be determined.');
            }
            await addFieldTool.addField(result.targetUri, result.modelName, cache);
        },
        URI_OPTIONS.MODEL_FILE
    );

    // Add Composition Tool
    const addCompositionTool = new AddCompositionTool();
    registerCommand(
        disposables,
        'slingr-vscode-extension.addComposition',
        async (result: UriResolutionResult) => {
            if (!result.modelName) {
                throw new Error('Model name could not be determined.');
            }
            await addCompositionTool.addComposition(cache, result.modelName);
        },
        URI_OPTIONS.EXPLICIT_MODEL_SELECTION
    );

    // Add Reference Tool
    const addReferenceTool = new AddReferenceTool(explorerProvider);
    registerCommand(
        disposables,
        'slingr-vscode-extension.addReference',
        async (result: UriResolutionResult) => {
            if (!result.modelName) {
                throw new Error('Model name could not be determined.');
            }
            await addReferenceTool.addReference(cache, result.modelName);
        },
        URI_OPTIONS.EXPLICIT_MODEL_SELECTION
    );
=======
    const defineFieldsCommand = vscode.commands.registerCommand('slingr-vscode-extension.defineFields', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('Please open a model file to define fields.');
            return;
        }

        const document = activeEditor.document;
        const content = document.getText();
        
        // Check if this is a model file
        if (!content.includes('@Model')) {
            vscode.window.showErrorMessage('The current file does not appear to be a model file.');
            return;
        }

        // Extract model name from class declaration
        const classMatch = content.match(/export\s+class\s+(\w+)\s+extends\s+BaseModel/);
        if (!classMatch) {
            vscode.window.showErrorMessage('Could not find model class definition.');
            return;
        }

        const modelName = classMatch[1];
        
        // Get field descriptions from user
        const fieldsDescription = await vscode.window.showInputBox({
            prompt: "Enter field descriptions to be processed by AI",
            placeHolder: "e.g., title, description, project (relationship to Project), status (enum: todo, in-progress, done)",
            ignoreFocusOut: true
        });

        if (!fieldsDescription) {
            return; 
        }

        try {
            await defineFieldsTool.processFieldDescriptions(
                fieldsDescription,
                document.uri,
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
    const addFieldCommand = vscode.commands.registerCommand('slingr-vscode-extension.addField', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('Please open a model file to add a field.');
            return;
        }

        const document = activeEditor.document;
        const content = document.getText();
        
        // Check if this is a model file
        if (!content.includes('@Model')) {
            vscode.window.showErrorMessage('The current file does not appear to be a model file.');
            return;
        }

        try {
            await addFieldTool.addField(document.uri, cache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add field: ${error}`);
        }
    });
    disposables.push(addFieldCommand);
>>>>>>> framework/main

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
<<<<<<< HEAD
    registerCommand(
        disposables,
        'slingr-vscode-extension.createTest',
        async (result: UriResolutionResult) => {
            await createTestTool.createTest(result.targetUri, cache);
        },
        URI_OPTIONS.TYPESCRIPT_FILE
    );
=======
    const createTestCommand = vscode.commands.registerCommand('slingr-vscode-extension.createTest', async (uri?: vscode.Uri) => {
        let targetUri = uri;
        
        if (!targetUri) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('Please open a model file or select a file to create a test.');
                return;
            }
            targetUri = activeEditor.document.uri;
        }

        try {
            await createTestTool.createTest(targetUri, cache);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create test: ${error}`);
        }
    });
    disposables.push(createTestCommand);
>>>>>>> framework/main

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
    
    // New Data Source Tool
    const newDataSourceTool = new NewDataSourceTool();
    const newDataSourceCommand = vscode.commands.registerCommand('slingr-vscode-extension.newDataSource', () => {
        return newDataSourceTool.createNewDataSource();
    });
    disposables.push(newDataSourceCommand);

    return disposables;
}
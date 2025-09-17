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
import { AddReferenceTool } from './models/addReference';
import { AIService } from '../services/aiService';
import { ProjectAnalysisService } from '../services/projectAnalysisService';
import { registerCommand, URI_OPTIONS, UriResolutionResult, resolveTargetUri, registerTreeViewAwareCommand, TreeViewContext } from './commandHelpers';
import { ExtractFieldsToCompositionTool } from './fields/extractFieldsToComposition';
import { ExtractFieldsToReferenceTool } from './fields/extractFieldsToReference';
import { ExtractFieldsToEmbeddedTool } from './fields/extractFieldsToEmbedded';
import { ExtractFieldsToParentTool } from './fields/extractFieldsToParent';

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
    registerCommand(
        disposables,
        'slingr-vscode-extension.newModel',
        async (result: UriResolutionResult) => {
            await newModelTool.createNewModel(result.targetUri, cache);
        },
        URI_OPTIONS.ANY_FILE
    );

    // Define Fields Tool
    const defineFieldsTool = new DefineFieldsTool();
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
    registerCommand(
        disposables,
        'slingr-vscode-extension.createTest',
        async (result: UriResolutionResult) => {
            await createTestTool.createTest(result.targetUri, cache);
        },
        URI_OPTIONS.TYPESCRIPT_FILE
    );

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
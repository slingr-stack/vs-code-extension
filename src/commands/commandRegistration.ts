import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
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
import { AIService } from '../services/aiService';
import { NewDataSourceTool } from './newDataSource';
import { NewDatasetTool } from './datasets/newDataset';
import { RegenerateDatasetTool } from './datasets/regenerateDataset';
import { UpdateDatasetTool } from './datasets/updateDataset';
import { LoadDatasetTool } from './datasets/loadDataset';

export function registerGeneralCommands(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    explorerProvider: ExplorerProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const aiService = new AIService();

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

     // New Dataset Tool
    const newDatasetTool = new NewDatasetTool();
    const newDatasetCommand = vscode.commands.registerCommand('slingr-vscode-extension.newDataset', (item: AppTreeItem) => {
        return newDatasetTool.newDataset(item);
    });
    disposables.push(newDatasetCommand);

    // Regenerate Dataset Tool
    const regenerateDatasetTool = new RegenerateDatasetTool();
    const regenerateDatasetCommand = vscode.commands.registerCommand('slingr-vscode-extension.regenerateDataset', (item: AppTreeItem) => {
        return regenerateDatasetTool.regenerateDataset(item);
    });
    disposables.push(regenerateDatasetCommand);

    // Update Dataset Tool
    const updateDatasetTool = new UpdateDatasetTool();
    const updateDatasetCommand = vscode.commands.registerCommand('slingr-vscode-extension.updateDataset', (item: AppTreeItem) => {
        return updateDatasetTool.updateDataset(item);
    });
    disposables.push(updateDatasetCommand);

    // Load Dataset Tool
    const loadDatasetTool = new LoadDatasetTool(cache);
    const loadDatasetCommand = vscode.commands.registerCommand('slingr-vscode-extension.loadDataset', (item: AppTreeItem) => {
        return loadDatasetTool.loadDataset(item);
    });
    disposables.push(loadDatasetCommand);

    return disposables;
}
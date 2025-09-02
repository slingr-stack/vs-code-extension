import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { ExplorerProvider } from '../explorer/explorerProvider';
import { NewModelTool } from './newModel';
import { DefineFieldsTool } from './defineFields';
import { AddFieldTool } from './addField';
import { NewFolderTool } from './newFolder';
import { CreateTestTool } from './createTest';
import { AppTreeItem } from '../explorer/appTreeItem';
import { CreateModelFromDescriptionTool } from './createModelFromDesc';
import { ModifyModelTool } from './modifyModel';

export function registerGeneralCommands(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    explorerProvider: ExplorerProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

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
        if (!content.includes('@Model') || !content.includes('extends BaseModel')) {
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
            return; // User cancelled
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
        if (!content.includes('@Model') || !content.includes('extends BaseModel')) {
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

    // Create Test Tool
    const createTestTool = new CreateTestTool();
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
    const createModelFromDescriptionTool = new CreateModelFromDescriptionTool();
    const createModelFromDescriptionCommand = vscode.commands.registerCommand('slingr-vscode-extension.createModelFromDescription', (context?: vscode.Uri | AppTreeItem) => {
        return createModelFromDescriptionTool.createModel(cache, context);
    });
    disposables.push(createModelFromDescriptionCommand);

    // Modify Model Tool
    const modifyModelTool = new ModifyModelTool();
    const modifyModelCommand = vscode.commands.registerCommand('slingr-vscode-extension.modifyModel', () => {
        return modifyModelTool.modifyModel(cache);
    });
    disposables.push(modifyModelCommand);

    return disposables;
}
import * as vscode from 'vscode';
import { MetadataCache } from './cache/cache';
import { ExplorerProvider } from './explorer/explorerProvider';
import { getAllRefactorTools, registerRefactorCommands } from './refactor/refactorDisposables';
import { RefactorController } from './refactor/RefactorController';
import { NewModelTool } from './refactor/tools/newModel';
import { AppTreeItem } from './explorer/appTreeItem';

export let cache: MetadataCache;

export async function activate(context: vscode.ExtensionContext) {

	// Initialize the metadata cache
	cache = new MetadataCache(context.extensionPath);
	await cache.initialize().then(() => {
		console.log('Metadata cache initialized successfully');
	}).catch(error => {
		console.error('Failed to initialize metadata cache:', error);
	});

	// Initialize the explorer provider
	const explorerProvider = new ExplorerProvider(cache, context.extensionUri);
	
	// Register the tree view
	const treeView = vscode.window.createTreeView('slingrExplorer', {
		treeDataProvider: explorerProvider,
		dragAndDropController: explorerProvider,
		showCollapseAll: true
	});

	// Register the navigation command
	const navigateToCodeCommand = vscode.commands.registerCommand('slingr-vscode-extension.navigateToCode', (location: vscode.Location) => {
		vscode.window.showTextDocument(location.uri).then(editor => {
			editor.selection = new vscode.Selection(location.range.start, location.range.end);
			editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
		});
	});

	const refactorTools = getAllRefactorTools();
	const refactorController = new RefactorController(refactorTools, cache);

	cache.setRefactorController(refactorController);

	const refactorDisposables = registerRefactorCommands(refactorController);

	// Register the standalone New Model Tool
	const newModelTool = new NewModelTool();
	const newModelCommand = vscode.commands.registerCommand('slingr-vscode-extension.newModel', (uri?: vscode.Uri | AppTreeItem) => {
		// If no URI provided, use the current workspace folder
		const targetUri = uri || (vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(''));
		return newModelTool.createNewModel(targetUri);
	});

	// Add all disposables to context subscriptions
	context.subscriptions.push(
		treeView,
		navigateToCodeCommand,
		cache,
		newModelCommand,
		...refactorDisposables
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	cache.dispose();
}

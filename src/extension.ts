import * as vscode from 'vscode';
import { MetadataCache } from './cache/cache';
import { ExplorerProvider } from './explorer/explorerProvider';
import { getAllRefactorTools, registerRefactorCommands } from './refactor/refactorDisposables';
import { RefactorController } from './refactor/RefactorController';
import { registerGeneralCommands } from './commands/commandRegistration';

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

	const refactorTools = getAllRefactorTools();
	const refactorController = new RefactorController(refactorTools, cache);

	cache.setRefactorController(refactorController);

	const refactorDisposables = registerRefactorCommands(refactorController);

	// Register all general commands
	const generalCommandDisposables = registerGeneralCommands(context, cache, explorerProvider);

	// Add all disposables to context subscriptions
	context.subscriptions.push(
		treeView,
		cache,
		...refactorDisposables,
		...generalCommandDisposables
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	cache.dispose();
}

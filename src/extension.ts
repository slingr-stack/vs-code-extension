// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MetadataCache } from './cache/cache';
import { ExplorerProvider } from './explorer/explorerProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "slingr-vscode-extension" is now active!');

	// Initialize the metadata cache
	const cache = new MetadataCache(context.extensionPath);

	// Initialize the cache (this will parse all files and set up file watchers)
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

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('slingr-vscode-extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Slingr VsCode Extension!');
	});

	// Add all disposables to context subscriptions
	context.subscriptions.push(
		disposable,
		treeView,
		navigateToCodeCommand,
		cache
	);
}// This method is called when your extension is deactivated
export function deactivate() {}

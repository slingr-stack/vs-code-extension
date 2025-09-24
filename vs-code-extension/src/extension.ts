import * as vscode from 'vscode';

// Simple extension activation for the monorepo setup
export async function activate(context: vscode.ExtensionContext) {
    console.log('Slingr VS Code Extension is now active!');

    // Register basic Hello World command
    const disposable = vscode.commands.registerCommand('slingr-vscode-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Slingr VS Code Extension!');
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('Slingr VS Code Extension is deactivated');
}
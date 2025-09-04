import * as vscode from 'vscode';

export function registerGeneralCommands(context: vscode.ExtensionContext) {
    const navigateToCodeCommand = vscode.commands.registerCommand('slingr-vscode-extension.navigateToCode', (location: vscode.Location) => {
        vscode.window.showTextDocument(location.uri).then(editor => {
            editor.selection = new vscode.Selection(location.range.start, location.range.end);
            editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
        });
    });

    context.subscriptions.push(navigateToCodeCommand);
}
import * as vscode from 'vscode';
import { QuickInfoProvider } from './quickInfoProvider';

export function registerInfoPanel(context: vscode.ExtensionContext): QuickInfoProvider {
    const provider = new QuickInfoProvider(context.extensionUri);

    const registration = vscode.window.registerWebviewViewProvider(
        QuickInfoProvider.viewType,
        provider
    );

    context.subscriptions.push(registration);

    return provider;
}
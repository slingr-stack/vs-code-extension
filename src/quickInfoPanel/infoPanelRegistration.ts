import * as vscode from 'vscode';
import { QuickInfoProvider } from './quickInfoProvider';
import { MetadataCache } from '../cache/cache';

export function registerInfoPanel(context: vscode.ExtensionContext, cache: MetadataCache): QuickInfoProvider {
    const provider = new QuickInfoProvider(context.extensionUri, cache);

    const registration = vscode.window.registerWebviewViewProvider(
        QuickInfoProvider.viewType,
        provider
    );

    context.subscriptions.push(registration);

    return provider;
}
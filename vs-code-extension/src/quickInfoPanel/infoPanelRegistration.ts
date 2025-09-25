import * as vscode from 'vscode';
import { QuickInfoProvider } from './quickInfoProvider';
import { MetadataCache } from '../cache/cache';

/**
 * Registers the Quick Info Panel as a webview view provider in VS Code.
 * 
 * This module is responsible for setting up the Quick Info Panel integration with VS Code's
 * extension system. It creates and registers the QuickInfoProvider as a webview view provider,
 * which allows it to display metadata information in a dedicated panel within the VS Code UI.
 * 
 * @param context - The VS Code extension context containing extension-specific information
 * @param cache - The metadata cache containing parsed Slingr metadata from the workspace
 * @returns The registered QuickInfoProvider instance for use by other extension components
 */
export function registerInfoPanel(context: vscode.ExtensionContext, cache: MetadataCache): QuickInfoProvider {
    const provider = new QuickInfoProvider(context.extensionUri, cache);

    const registration = vscode.window.registerWebviewViewProvider(
        QuickInfoProvider.viewType,
        provider
    );
    context.subscriptions.push(registration);

    return provider;
}
import * as vscode from 'vscode';
import { MetadataCache } from './cache/cache';
import { getAllRefactorTools, registerRefactorCommands } from './refactor/refactorDisposables';
import { RefactorController } from './refactor/RefactorController';
import { registerExplorer } from './explorer/explorerRegistration';
import { registerInfoPanel } from './quickInfoPanel/infoPanelRegistration';
import { registerGeneralCommands } from './commands/commandRegistration';
import { registerInfraStatus } from './infrastructure/infraStatusRegistration';

export let cache: MetadataCache;

export async function activate(context: vscode.ExtensionContext) {

	// --- 1. Core Services Initialization ---
    cache = new MetadataCache(context.extensionPath);
    await cache.initialize();
    
    const refactorTools = getAllRefactorTools();
	const refactorController = new RefactorController(refactorTools, cache);
	cache.setRefactorController(refactorController);

    // --- 2. Feature Registration ---
    // Each function now handles the setup for a specific feature.
    const quickInfoProvider = registerInfoPanel(context, cache);
    const explorerRegistration = registerExplorer(context, cache, quickInfoProvider);
    const generalCommandDisposables = registerGeneralCommands(context, cache, explorerRegistration.provider);
    registerRefactorCommands(refactorController, context); // Pass context if needed for subscriptions
    registerInfraStatus(context, cache);

    // --- 3. Push remaining disposables ---
    context.subscriptions.push(cache, ...generalCommandDisposables);
}

// This method is called when your extension is deactivated
export function deactivate() {
	cache.dispose();
}

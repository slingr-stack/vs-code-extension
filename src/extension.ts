import * as vscode from "vscode";
import { MetadataCache } from "./cache/cache";
import { getAllRefactorTools, registerRefactorCommands } from "./refactor/refactorDisposables";
import { RefactorController } from "./refactor/RefactorController";
import { registerExplorer } from "./explorer/explorerRegistration";
import { registerInfoPanel } from "./quickInfoPanel/infoPanelRegistration";
import { registerGeneralCommands } from "./commands/commandRegistration";
import { registerInfraStatus } from "./infrastructure/infraStatusRegistration";
import { setupSqlToolsIntegration } from "./tools/sqlToolsIntegration";
import { PerformanceProfiler } from "./utils/performanceProfiler";

export let cache: MetadataCache;

export async function activate(context: vscode.ExtensionContext) {
  // Core Services Initialization (Shallow Load) ---
  cache = new MetadataCache(context.extensionPath);
  await cache.initialize(); // Fast shallow initialization

  const refactorTools = getAllRefactorTools();
  const refactorController = new RefactorController(refactorTools, cache);
  cache.setRefactorController(refactorController);

  // Feature Registration (UI can render immediately) ---
  // Each function now handles the setup for a specific feature.
  const quickInfoProvider = registerInfoPanel(context, cache);
  const explorerRegistration = registerExplorer(context, cache, quickInfoProvider);
  const generalCommandDisposables = registerGeneralCommands(context, cache, explorerRegistration.provider);
  registerRefactorCommands(refactorController, context); // Pass context if needed for subscriptions
  registerInfraStatus(context, cache);

  // Background Reference Building (Deep Load) ---
  // Start building references in the background after UI is ready
  cache.buildAllReferencesInBackground();

  // --- SQLTools Integration ---
  setupSqlToolsIntegration(context, cache);

  // --- Push remaining disposables ---
  context.subscriptions.push(cache, ...generalCommandDisposables);

  vscode.commands.registerCommand("slingr-vscode-extension.showPerformanceReport", () => {
    const report = PerformanceProfiler.getReport();
    vscode.window.showInformationMessage(report);
    console.log(report);
  });

  
}

// This method is called when your extension is deactivated
export function deactivate() {
  cache.dispose();
}

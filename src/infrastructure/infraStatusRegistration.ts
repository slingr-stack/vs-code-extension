import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { InfrastructureStatus } from './infrastructureStatus';
import { exec } from 'child_process';

/**
 * Registers the automatic infrastructure status checker and updater.
 */
export function registerInfraStatus(context: vscode.ExtensionContext, cache: MetadataCache) {
    const infraStatus = new InfrastructureStatus();
    context.subscriptions.push(infraStatus);
    
    let isUpdating = false;
    let lastError = '';

    // The main function to run the update
    const runUpdate = () => {
        if (isUpdating) {
            return; // Prevent concurrent runs
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return; // Cannot run without a workspace
        }

        isUpdating = true;
        infraStatus.showSyncing();

        exec('slingr infra update', { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
            isUpdating = false;

            if (error) {
                // Command failed
                lastError = stderr || stdout || error.message;
                infraStatus.showError(lastError);
                // We do NOT acknowledge the update, so the `isInfrastructureUpdateNeeded` flag remains true,
                // allowing another attempt on the next file change.
                return;
            }

            // Command succeeded
            infraStatus.showSynced();
            cache.acknowledgeInfrastructureUpdate(); // Reset the state in the cache
        });
    };

    // Listen for changes detected by the cache
    cache.onInfrastructureChange(() => {
        if (cache.isInfrastructureUpdateNeeded) {
            runUpdate();
        }
    });
    
    // Command to show the last error when the status bar item is clicked in an error state
    const showInfraErrorCommand = vscode.commands.registerCommand('slingr.showInfraError', () => {
        vscode.window.showErrorMessage(`Slingr Infra Sync Failed:\n${lastError}`, { modal: true });
    });
    
    context.subscriptions.push(showInfraErrorCommand);
}
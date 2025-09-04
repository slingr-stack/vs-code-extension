// src/infrastructure/infraStatusRegistration.ts

import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { InfrastructureStatus } from './infrastructureStatus';

/**
 * Registers the infrastructure status checker.
 * This sets up a listener for data source changes and manages a status bar item
 * to notify the user when an infrastructure update is needed.
 * @param context The VS Code extension context.
 * @param cache The metadata cache.
 */
export function registerInfraStatus(context: vscode.ExtensionContext, cache: MetadataCache) {
    const infraStatus = new InfrastructureStatus();
    context.subscriptions.push(infraStatus);

    let hasShownInitialNotification = false;

    // Listen for changes detected by the cache
    cache.onInfrastructureChange(() => {
        if (cache.isInfrastructureUpdateNeeded) {
            infraStatus.showUpdateNeeded();

            // Show a toast notification only the first time the state becomes inconsistent
            if (!hasShownInitialNotification) {
                vscode.window.showWarningMessage(
                    'Data source change detected. Your infrastructure may be out of sync.',
                    'Update Now'
                ).then(selection => {
                    if (selection === 'Update Now') {
                        vscode.commands.executeCommand('slingr.runInfraUpdate');
                    }
                });
                hasShownInitialNotification = true;
            }
        } else {
            infraStatus.hide();
            // Reset the flag so the notification can show again on the next change
            hasShownInitialNotification = false;
        }
    });

    // Register the command that the status bar item will trigger
    const runInfraUpdateCommand = vscode.commands.registerCommand('slingr.runInfraUpdate', () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a project folder to update the infrastructure.');
            return;
        }

        vscode.window.showInformationMessage(
            'Run "slingr infra update" to sync your infrastructure?', 
            { modal: true },
            'Yes, update now'
        ).then(selection => {
            if (selection === 'Yes, update now') {
                // 1. Create a new terminal dedicated to this task.
                const terminal = vscode.window.createTerminal({
                    name: `Slingr Infra Update`,
                    cwd: workspaceFolder.uri
                });

                // 2. Send the command to the terminal.
                terminal.sendText('slingr infra update');
                
                // 3. Show the terminal to the user.
                terminal.show();
                
                // 4. Acknowledge the update to hide the notification.
                cache.acknowledgeInfrastructureUpdate();
            }
        });
    });

    context.subscriptions.push(runInfraUpdateCommand);
}
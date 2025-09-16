import * as vscode from 'vscode';
import { InfrastructureStatusChangeEvent, MetadataCache } from '../cache/cache';
import { InfrastructureStatus } from './infrastructureStatus';
import { exec } from 'child_process';

/**
 * Registers the infrastructure status indicator and the manual update command.
 * @param context The extension context.
 * @param cache The metadata cache.
 */
export function registerInfraStatus(context: vscode.ExtensionContext, cache: MetadataCache) {
    const infraStatus = new InfrastructureStatus();
    context.subscriptions.push(infraStatus);
    
    let isUpdating = false;
    let lastError = '';

    /**
     * The main function to execute the infrastructure update.
     */
    const runInfraUpdate = () => {
        if (isUpdating) {
            vscode.window.showInformationMessage('An infrastructure update is already in progress.');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Cannot run infra update. No workspace is open.');
            return;
        }
        
        isUpdating = true;
        infraStatus.showSyncing();

        const command = `slingr infra update -a`;
        // Execute in the root of the first workspace folder
        exec(command, { cwd: workspaceFolders[0].uri.fsPath }, (error, stdout, stderr) => {
            if (error) {
                lastError = stderr || stdout || error.message;
                infraStatus.showError(lastError);
                setTimeout(() => infraStatus.showUpdateNeeded(), 2000); 
            } else {
                infraStatus.showSynced();
                // Acknowledge the update so the "Update Required" banner doesn't reappear
                // until the next change is made.
                cache.acknowledgeAllInfrastructureUpdates();
            }
            isUpdating = false;
        });
    };

    // Register the command that the status bar button will trigger.
    const runUpdateCommand = vscode.commands.registerCommand('slingr.runInfraUpdate', runInfraUpdate);
    context.subscriptions.push(runUpdateCommand);

    // When a data source changes, simply show the button.
    cache.onInfrastructureStatusChange((event: InfrastructureStatusChangeEvent) => {
        if (event.status === 'change-detected') {
            infraStatus.showUpdateNeeded();
        }
    });

    // When the extension activates, check if an update is already needed from previous changes.
    if (cache.isInfrastructureUpdateNeeded) {
        infraStatus.showUpdateNeeded();
    }

    // This command is for showing the error message popup
    const showInfraErrorCommand = vscode.commands.registerCommand('slingr.showInfraError', () => {
        if (!lastError) {
            return;
        }
        vscode.window.showErrorMessage(
            `Slingr Infra Sync Failed:\n${lastError}`,
            { modal: true },
            'Run Update Again'
        ).then(selection => {
            if (selection === 'Run Update Again') {
                runInfraUpdate();
            }
        });
    });
    context.subscriptions.push(showInfraErrorCommand);
}
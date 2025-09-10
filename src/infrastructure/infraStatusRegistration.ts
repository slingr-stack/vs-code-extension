import * as vscode from 'vscode';
import * as path from 'path'; 
import { InfrastructureStatusChangeEvent, MetadataCache } from '../cache/cache';
import { InfrastructureStatus } from './infrastructureStatus';
import { exec } from 'child_process';

/**
 * Registers the infrastructure status indicator.
 * @param context The extension context.
 * @param cache The metadata cache.
 */
export function registerInfraStatus(context: vscode.ExtensionContext, cache: MetadataCache) {
    const infraStatus = new InfrastructureStatus();
    context.subscriptions.push(infraStatus);
    
    let isUpdating = false;
    let lastError = '';
    let lastFailedUri: vscode.Uri | undefined;
    const updateQueue: vscode.Uri[] = []; 

    cache.onInfrastructureStatusChange((event: InfrastructureStatusChangeEvent) => {
        // Only queue an update when a file change is first detected
        if (event.status === 'change-detected') {
            if (!updateQueue.some(item => item.fsPath === event.uri.fsPath)) {
                updateQueue.push(event.uri);
            }
            processUpdateQueue();
        }
    });

    const processUpdateQueue = () => {
        if (isUpdating || updateQueue.length === 0) {
            return; 
        }

        isUpdating = true;
        const uriToUpdate = updateQueue.shift()!; 
        const fileName = path.basename(uriToUpdate.fsPath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uriToUpdate);
        if (!workspaceFolder) {
            isUpdating = false;
            return; 
        }

        infraStatus.showSyncing();

        const command = `slingr infra update -a`;
        exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
            if (error) {
                lastError = stderr || stdout || error.message;
                lastFailedUri = uriToUpdate;
                infraStatus.showError(lastError);
                cache.notifyInfrastructureStatus({ status: 'update-failure', uri: uriToUpdate, error: lastError });
            } else {
                infraStatus.showSynced();
                cache.acknowledgeInfrastructureUpdate(uriToUpdate);
                lastError = '';
                lastFailedUri = undefined;
                cache.notifyInfrastructureStatus({ status: 'update-success', uri: uriToUpdate });
            }

            isUpdating = false;
            processUpdateQueue();
        });
    };
    
    const showInfraErrorCommand = vscode.commands.registerCommand('slingr.showInfraError', () => {
        if (!lastError || !lastFailedUri) {
            return;
        }

        vscode.window.showErrorMessage(
            `Slingr Infra Sync Failed:\n${lastError}`,
            { modal: true },
            'Re-run Update' 
        ).then(selection => {
            if (selection === 'Re-run Update' && lastFailedUri) {
                if (!updateQueue.some(item => item.fsPath === lastFailedUri!.fsPath)) {
                    updateQueue.unshift(lastFailedUri);
                }
                processUpdateQueue();
            }
        });
    });
    
    context.subscriptions.push(showInfraErrorCommand);
}
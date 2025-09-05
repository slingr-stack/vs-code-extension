import * as vscode from 'vscode';
import * as path from 'path'; 
import { MetadataCache } from '../cache/cache';
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

        const command = `slingr infra update --file ${fileName}`;
        exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
            if (error) {
                lastError = stderr || stdout || error.message;
                lastFailedUri = uriToUpdate;
                infraStatus.showError(lastError);
            } else {
                infraStatus.showSynced();
                cache.acknowledgeInfrastructureUpdate(uriToUpdate);
                lastError = '';
                lastFailedUri = undefined;
            }

            isUpdating = false;
            processUpdateQueue();
        });
    };

    cache.onInfrastructureChange((uri: vscode.Uri) => {

        if (!updateQueue.some(item => item.fsPath === uri.fsPath)) {
            updateQueue.push(uri);
        }
        processUpdateQueue();
    });

    
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
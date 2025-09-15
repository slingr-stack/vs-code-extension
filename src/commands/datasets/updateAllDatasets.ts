import * as vscode from 'vscode';
import { exec } from 'child_process';
import { MetadataCache } from '../../cache/cache';
import { getExplorerProvider } from '../../explorer/explorerRegistration';

export class UpdateAllDatasetsTool {
    constructor(private cache: MetadataCache) {}

    public async updateAllDatasets() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const dataSources = this.cache.getDataSources();
            if (dataSources.length === 0) {
                vscode.window.showInformationMessage('No data sources found to update datasets.');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Updating all default datasets...',
                cancellable: false
            }, async (progress) => {
                for (const dataSource of dataSources) {
                    progress.report({ message: `Updating dataset for ${dataSource.name}...` });
                    const command = `slingr ds ${dataSource.name} update-dataset default`;
                    
                    await new Promise<void>((resolve) => {
                        exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
                            if (error && !stderr.includes('Default dataset does not exist')) {
                                vscode.window.showErrorMessage(`Error updating dataset for ${dataSource.name}: ${stderr}`);
                            }
                            resolve();
                        });
                    });
                }
            });

            vscode.window.showInformationMessage('All default datasets updated successfully.');
            getExplorerProvider()?.markDatasetsAsSynced();
        }
    }
}
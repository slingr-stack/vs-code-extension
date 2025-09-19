import * as vscode from 'vscode';
import { AppTreeItem } from '../../explorer/appTreeItem';
import { exec } from 'child_process';
import { MetadataCache, DatasetMetadata } from '../../cache/cache';

export class LoadDatasetTool {
    constructor(private cache: MetadataCache) {}

    public async loadDataset(item: AppTreeItem) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        let dataSourceName: string;
        let datasetName: string | undefined;

        // Determine context based on the item type
        if (item.itemType === 'dataSource' || item.itemType === 'dataSource-warning') {
            // Called from data source - show available datasets for this datasource
            dataSourceName = item.label;
            
            // Get available datasets for this data source from cache
            const dataSources = this.cache.getDataSources();
            const currentDataSource = dataSources.find(ds => ds.name === dataSourceName);
            
            if (!currentDataSource) {
                vscode.window.showErrorMessage(`Data source '${dataSourceName}' not found in cache.`);
                return;
            }

            const availableDatasets = currentDataSource.datasets.map(ds => ds.name);
            
            if (availableDatasets.length === 0) {
                vscode.window.showInformationMessage(`No datasets found for data source '${dataSourceName}'.`);
                return;
            }

            const selectedDataset = await vscode.window.showQuickPick(
                availableDatasets,
                { 
                    placeHolder: 'Select dataset to load',
                    title: `Load dataset for data source: ${dataSourceName}`
                }
            );

            if (!selectedDataset) {
                return; // User cancelled
            }

            datasetName = selectedDataset;
        } else if (item.itemType === 'dataset') {
            // Called from specific dataset - find the parent datasource
            const datasetMetadata = item.metadata as DatasetMetadata;
            if (!datasetMetadata) {
                vscode.window.showErrorMessage('Dataset metadata not found.');
                return;
            }

            // Find which datasource contains this dataset
            const dataSources = this.cache.getDataSources();
            let parentDataSource = null;
            
            for (const ds of dataSources) {
                if (ds.datasets.some(dataset => dataset.name === datasetMetadata.name)) {
                    parentDataSource = ds;
                    break;
                }
            }

            if (!parentDataSource) {
                vscode.window.showErrorMessage('Parent data source not found for this dataset.');
                return;
            }

            dataSourceName = parentDataSource.name;
            datasetName = datasetMetadata.name;
        } else {
            vscode.window.showErrorMessage('Load dataset can only be called from a data source or dataset item.');
            return;
        }

        // Execute the load command
        const command = datasetName 
            ? `slingr ds ${dataSourceName} load ${datasetName}`
            : `slingr ds ${dataSourceName} load`;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading dataset${datasetName ? ` '${datasetName}'` : ''} for data source '${dataSourceName}'...`,
            cancellable: false
        }, async () => {
            return new Promise<void>((resolve) => {
                exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
                    if (error) {
                        vscode.window.showErrorMessage(`Error loading dataset: ${stderr || error.message}`);
                    } else {
                        const message = datasetName 
                            ? `Dataset '${datasetName}' loaded successfully for data source '${dataSourceName}'.`
                            : `Default dataset loaded successfully for data source '${dataSourceName}'.`;
                        vscode.window.showInformationMessage(message);
                    }
                    resolve();
                });
            });
        });
    }
}
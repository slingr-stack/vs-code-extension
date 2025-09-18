import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChangeObject, IRefactorTool, ManualRefactorContext, DeleteDataSourcePayload } from '../refactorInterfaces';
import { FileMetadata, MetadataCache } from '../../cache/cache';

export class DeleteDataSourceTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.deleteDataSource';
    }

    getTitle(): string {
        return 'Delete Data Source';
    }

    getHandledChangeTypes(): string[] {
        return ['DELETE_DATA_SOURCE'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        // Now we can check if the file actually contains a data source
        const fileMeta = context.cache.getMetadataForFile(context.uri.fsPath);
        return !!fileMeta && Object.keys(fileMeta.dataSources).length > 0;
    }

    analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata): ChangeObject[] {
        if (!oldFileMeta || newFileMeta !== undefined) {
            return [];
        }

        const oldDataSourceNames = Object.keys(oldFileMeta.dataSources);
        if (oldDataSourceNames.length > 0) {
            const dataSourceName = oldDataSourceNames[0];
            const payload: DeleteDataSourcePayload = {
                dataSourceName,
                urisToDelete: [oldFileMeta.uri, ...this.getDatasetFoldersToDelete(dataSourceName)],
                isManual: false,
            };
            return [{
                type: 'DELETE_DATA_SOURCE',
                uri: oldFileMeta.uri,
                description: `Delete data source '${dataSourceName}'`,
                payload,
            }];
        }

        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const fileMeta = context.cache.getMetadataForFile(context.uri.fsPath);
        if (!fileMeta || Object.keys(fileMeta.dataSources).length === 0) {
            vscode.window.showErrorMessage('No data source found in this file.');
            return;
        }

        const dataSourceName = Object.keys(fileMeta.dataSources)[0];

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the data source '${dataSourceName}'? This action cannot be undone.`,
            'Yes, Delete'
        );

        if (confirmation !== 'Yes, Delete') {
            return;
        }

        const payload: DeleteDataSourcePayload = {
            dataSourceName,
            urisToDelete: [context.uri, ...this.getDatasetFoldersToDelete(dataSourceName)],
            isManual: true,
        };

        return {
            type: 'DELETE_DATA_SOURCE',
            uri: context.uri,
            description: `Delete data source '${dataSourceName}'`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        if (change.type !== 'DELETE_DATA_SOURCE') {
            throw new Error(`DeleteDataSourceTool can only handle DELETE_DATA_SOURCE changes, received: ${change.type}`);
        }
        
        // For delete operations, we don't need to prepare any text edits
        // All file deletions are handled by the RefactorController via the payload
        const workspaceEdit = new vscode.WorkspaceEdit();
        return workspaceEdit;
    }

    /**
     * Gets the list of dataset folders to delete for the given data source.
     * @param dataSourceName The name of the data source being deleted.
     * @returns An array of URIs for dataset folders to delete.
     */
    private getDatasetFoldersToDelete(dataSourceName: string): vscode.Uri[] {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const datasetsPath = path.join(workspaceFolder.uri.fsPath, 'src', 'datasets');
        if (!fs.existsSync(datasetsPath)) {
            return [];
        }

        const foldersToDelete: vscode.Uri[] = [];

        try {
            const entries = fs.readdirSync(datasetsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.startsWith(`${dataSourceName}-`)) {
                    const folderUri = vscode.Uri.file(path.join(datasetsPath, entry.name));
                    foldersToDelete.push(folderUri);
                }
            }
        } catch (error) {
            console.error(`Error while scanning dataset folders for data source '${dataSourceName}':`, error);
        }

        return foldersToDelete;
    }
}
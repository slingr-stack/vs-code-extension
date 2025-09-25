import * as vscode from 'vscode';
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
                urisToDelete: [oldFileMeta.uri],
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
            urisToDelete: [context.uri],
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
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.deleteFile(change.uri, {}, {label: `Delete data source file`, needsConfirmation: true});
        return workspaceEdit;
    }
}
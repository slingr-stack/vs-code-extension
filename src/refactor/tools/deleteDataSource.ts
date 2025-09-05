import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, DeleteDataSourcePayload } from '../refactorInterfaces';
import { MetadataCache } from '../../cache/cache';

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
        return true;
    }

    analyze(): ChangeObject[] {
        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const dataSourceName = context.uri.path.split('/').pop()?.replace('.ts', '');
        if (!dataSourceName) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the data source '${dataSourceName}'? This action cannot be undone.`,
            'Yes, Delete'
        );

        if (confirmation !== 'Yes, Delete') {
            return;
        }

        const payload: DeleteDataSourcePayload = {
            dataSourceName,
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
        workspaceEdit.deleteFile(change.uri);
        return workspaceEdit;
    }
}
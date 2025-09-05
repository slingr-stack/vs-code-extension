import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, RenameDataSourcePayload } from '../refactorInterfaces';
import { MetadataCache } from '../../cache/cache';

export class RenameDataSourceTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.renameDataSource';
    }

    getTitle(): string {
        return 'Rename Data Source';
    }

    getHandledChangeTypes(): string[] {
        return ['RENAME_DATA_SOURCE'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return true;
    }

    analyze(): ChangeObject[] {
        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const oldName = context.uri.path.split('/').pop()?.replace('.ts', '');
        if (!oldName) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `Rename data source '${oldName}'`,
            value: oldName,
            validateInput: (value) => {
                if (!value) {
                    return 'Data source name cannot be empty';
                }
                if (!/^[a-zA-Z0-9_]+$/.test(value)) {
                    return 'Invalid data source name. Only alphanumeric characters and underscores are allowed.';
                }
                return null;
            },
        });

        if (!newName || newName === oldName) {
            return;
        }

        const payload: RenameDataSourcePayload = {
            oldName,
            newName,
            isManual: true,
        };

        return {
            type: 'RENAME_DATA_SOURCE',
            uri: context.uri,
            description: `Rename data source '${oldName}' to '${newName}'`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const payload = change.payload as RenameDataSourcePayload;
        const { oldName, newName } = payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const oldUri = change.uri;
        const newUri = vscode.Uri.joinPath(oldUri, '..', `${newName}.ts`);

        workspaceEdit.renameFile(oldUri, newUri);

        return workspaceEdit;
    }
}
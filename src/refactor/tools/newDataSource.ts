import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, NewDataSourcePayload } from '../refactorInterfaces';
import { MetadataCache } from '../../cache/cache';

export class NewDataSourceTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.newDataSource';
    }

    getTitle(): string {
        return 'New Data Source';
    }

    getHandledChangeTypes(): string[] {
        return ['NEW_DATA_SOURCE'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        return true;
    }

    analyze(): ChangeObject[] {
        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const dataSourceName = await vscode.window.showInputBox({
            prompt: 'Enter the name of the new data source',
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

        if (!dataSourceName) {
            return;
        }

        const payload: NewDataSourcePayload = {
            dataSourceName,
            isManual: true,
        };

        return {
            type: 'NEW_DATA_SOURCE',
            uri: context.uri,
            description: `Create new data source '${dataSourceName}'`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const payload = change.payload as NewDataSourcePayload;
        const { dataSourceName } = payload;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            return workspaceEdit;
        }

        const dataSourcePath = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'dataSources', `${dataSourceName}.ts`);
        const template = `
import { TypeOrmSqlDataSource } from '@slingr/slingr-framework';

export const ${dataSourceName} = new TypeOrmSqlDataSource({
    type: "postgres",
    managed: true,
    host: "localhost",
    port: 5432,
    username: "admin",
    password: "admin"
});
`;

        workspaceEdit.createFile(dataSourcePath);
        workspaceEdit.insert(dataSourcePath, new vscode.Position(0, 0), template);

        return workspaceEdit;
    }
}
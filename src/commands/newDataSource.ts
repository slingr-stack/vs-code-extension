import * as vscode from 'vscode';

export class NewDataSourceTool {
    public async createNewDataSource(): Promise<void> {
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
            return; // User cancelled
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const dataSourcePath = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'dataSources', `${dataSourceName}.ts`);
        const template = `
import { TypeORMSqlDataSource } from 'slingr-framework';

export const ${dataSourceName} = new TypeORMSqlDataSource({
    type: "postgres",
    managed: true,
    host: "localhost",
    port: 5432,
    username: "admin",
    password: "admin"
});
`;
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.createFile(dataSourcePath);
        workspaceEdit.insert(dataSourcePath, new vscode.Position(0, 0), template);

        await vscode.workspace.applyEdit(workspaceEdit);

        // Open the newly created file
        const document = await vscode.workspace.openTextDocument(dataSourcePath);
        await vscode.window.showTextDocument(document);
    }
}
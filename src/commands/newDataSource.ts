import * as vscode from 'vscode';

interface DatabasePickOption {
    label: string;
    value: string;
    description: string;
    importPath?: string;
    className?: string;
    port?: number;
    username?: string;
    password?: string;
}

export class NewDataSourceTool {
    private getAvailableDataSources(): DatabasePickOption[] {
        return [
            {
                label: 'TypeORM SQL Data Source',
                value: 'typeorm-sql',
                description: 'SQL databases using TypeORM (PostgreSQL, MySQL, etc.)',
                importPath: 'TypeORMSqlDataSource',
                className: 'TypeORMSqlDataSource'
            }
            // Future data sources can be added here
        ];
    }

    private getDatabaseTypesForDataSource(dataSourceType: string): DatabasePickOption[] {
        switch (dataSourceType) {
            case 'typeorm-sql':
                return [
                    { 
                        label: 'PostgreSQL', 
                        value: 'postgres', 
                        description: 'PostgreSQL database',
                        port: 5432,
                        username: 'postgres',
                        password: 'postgres'
                    },
                    { 
                        label: 'MySQL', 
                        value: 'mysql', 
                        description: 'MySQL database',
                        port: 3306,
                        username: 'root',
                        password: 'root'
                    },
                    {
                        label: 'mariadb',
                        value: 'mariadb',
                        description: 'MariaDB database',
                        port: 3306,
                        username: 'root',
                        password: 'root'
                    }   
                ];
            default:
                return [];
        }
    }

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

        // Select data source type
        const availableDataSources = this.getAvailableDataSources();
        const selectedDataSource = await vscode.window.showQuickPick(availableDataSources, {
            placeHolder: 'Select the data source type',
            ignoreFocusOut: true
        });

        if (!selectedDataSource) {
            return; // User cancelled
        }

        // Select database type within the chosen data source
        const availableDatabases = this.getDatabaseTypesForDataSource(selectedDataSource.value);
        const databaseType = await vscode.window.showQuickPick(availableDatabases, {
            placeHolder: `Select the database type for ${selectedDataSource.label}`,
            ignoreFocusOut: true
        });

        if (!databaseType) {
            return; // User cancelled
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const dataSourcePath = vscode.Uri.joinPath(workspaceFolder.uri, 'src', 'dataSources', `${dataSourceName}.ts`);
        
        let template: string;
        
        template = `
import { ${selectedDataSource.importPath} } from 'slingr-framework';

export const ${dataSourceName} = new ${selectedDataSource.className}({
    type: "${databaseType.value}",
    managed: true,
    host: "localhost",
    port: ${databaseType.port || 5432},
    username: "${databaseType.username || 'admin'}",
    password: "${databaseType.password || 'admin'}",
    database: "${dataSourceName.toLowerCase()}_db"
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
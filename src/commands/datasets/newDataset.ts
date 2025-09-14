import * as vscode from 'vscode';
import { AppTreeItem } from '../../explorer/appTreeItem';
import { exec } from 'child_process';

export class NewDatasetTool {
    public async newDataset(item: AppTreeItem) {
        const datasetName = await vscode.window.showInputBox({ prompt: 'Enter the name for the new dataset' });
        if (datasetName) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const dataSourceName = item.label;
                const command = `slingr ds ${dataSourceName} generate-dataset ${datasetName}`;
                exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
                    if (error) {
                        vscode.window.showErrorMessage(`Error creating dataset: ${stderr}`);
                        return;
                    }
                    vscode.window.showInformationMessage(`Dataset '${datasetName}' created successfully for data source '${dataSourceName}'.`);
                });
            }
        }
    }
}
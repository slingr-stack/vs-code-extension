import * as vscode from 'vscode';
import { AppTreeItem } from '../../explorer/appTreeItem';
import { exec } from 'child_process';

export class RegenerateDatasetTool {
    public async regenerateDataset(item: AppTreeItem) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const [dataSourceName, datasetName] = item.label.split('-');
            const command = `slingr ds ${dataSourceName} generate-dataset ${datasetName}`;
            exec(command, { cwd: workspaceFolder.uri.fsPath }, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`Error regenerating dataset: ${stderr}`);
                    return;
                }
                vscode.window.showInformationMessage(`Dataset '${datasetName}' regenerated successfully for data source '${dataSourceName}'.`);
            });
        }
    }
}
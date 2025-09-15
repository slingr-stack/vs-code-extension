import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Checks for and creates the launch.json file for a Slingr project.
 */
export async function createLaunchConfiguration() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a Slingr project folder first.');
        return;
    }

    const projectRoot = workspaceFolders[0].uri.fsPath;
    const dotVscodePath = path.join(projectRoot, '.vscode');
    const launchJsonPath = path.join(dotVscodePath, 'launch.json');

    if (fs.existsSync(launchJsonPath)) {
        return;
    }

    // Ensure the .vscode directory exists
    if (!fs.existsSync(dotVscodePath)) {
        fs.mkdirSync(dotVscodePath);
    }

    const launchConfigContent = `{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "attach",
            "name": "Slingr: Debug App",
            "port": 9229,
            "restart": true,
            "preLaunchTask": {
                "type": "slingr",
                "task": "run"
            }
        }
    ]
}`;

    await vscode.workspace.fs.writeFile(vscode.Uri.file(launchJsonPath), Buffer.from(launchConfigContent, 'utf8'));
}
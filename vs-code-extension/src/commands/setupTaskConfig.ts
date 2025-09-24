import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Checks for and creates the tasks.json file for a Slingr project.
 */
export async function createTasksConfiguration() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        // No workspace open, so we can't create the file.
        return;
    }

    const projectRoot = workspaceFolders[0].uri.fsPath;
    const dotVscodePath = path.join(projectRoot, '.vscode');
    const tasksJsonPath = path.join(dotVscodePath, 'tasks.json');

    // If the file already exists, do nothing to avoid overwriting user changes.
    if (fs.existsSync(tasksJsonPath)) {
        return;
    }

    // Ensure the .vscode directory exists
    if (!fs.existsSync(dotVscodePath)) {
        fs.mkdirSync(dotVscodePath);
    }

    // This is the content of the tasks.json file we will create.
    const tasksConfigContent = `{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "slingr: run environment",
            "type": "shell",
            "command": "slingr run",
            "isBackground": true,
            "presentation": {
                "reveal": "always",
                "panel": "new"
            },
            "problemMatcher": {
                "owner": "slingr-runner",
                "pattern": {
                    "regexp": ".*"
                },
                "background": {
                    "activeOnStart": true,
                    "beginsPattern": "^(Starting infrastructure services...)",
                    "endsPattern": "^(\\\\w+) application initialized"
                }
            }
        }
    ]
}`;

    await vscode.workspace.fs.writeFile(vscode.Uri.file(tasksJsonPath), Buffer.from(tasksConfigContent, 'utf8'));
}
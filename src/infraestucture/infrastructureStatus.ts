import * as vscode from 'vscode';

export class InfrastructureStatus {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }

    public showUpdateNeeded(): void {
        this.statusBarItem.text = `$(warning) Slingr: Infra Update Needed`;
        this.statusBarItem.tooltip = 'Your data source configuration has changed. Click to update the infrastructure.';
        this.statusBarItem.command = 'slingr.runInfraUpdate';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.show();
    }

    public hide(): void {
        this.statusBarItem.hide();
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
}
import * as vscode from 'vscode';

export class InfrastructureStatus {
    private statusBarItem: vscode.StatusBarItem;
    private hideTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }

    /**
     * Shows a button in the status bar prompting the user to run the update.
     */
    public showUpdateNeeded(): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(sync) Slingr: Infra Update Required`;
        this.statusBarItem.tooltip = 'Data source changes detected. Click to run infrastructure update.';
        this.statusBarItem.command = 'slingr.runInfraUpdate'; 
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.statusBarItem.show();
    }

    public showSyncing(): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(sync~spin) Slingr: Syncing Infra...`;
        this.statusBarItem.tooltip = 'Executing `slingr infra update -a`...';
        this.statusBarItem.command = undefined; 
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }

    public showSynced(): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(check) Slingr: Infra Synced`;
        this.statusBarItem.tooltip = 'Infrastructure is up to date.';
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();

        this.hideTimer = setTimeout(() => this.hide(), 5000);
    }

    public showError(errorMessage: string): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(error) Slingr: Infra Sync Failed`;
        this.statusBarItem.tooltip = `Click to view error and retry.`;
        this.statusBarItem.command = 'slingr.showInfraError'; 
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.show();
    }

    public hide(): void {
        this.statusBarItem.hide();
    }

    private clearHideTimer(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = undefined;
        }
    }

    public dispose() {
        this.clearHideTimer();
        this.statusBarItem.dispose();
    }
}
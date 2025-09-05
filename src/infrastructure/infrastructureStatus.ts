import * as vscode from 'vscode';

export class InfrastructureStatus {
    private statusBarItem: vscode.StatusBarItem;
    private hideTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }

    public showSyncing(): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(sync~spin) Slingr: Syncing Infra...`;
        this.statusBarItem.tooltip = 'Automatically updating infrastructure based on data source changes.';
        this.statusBarItem.command = undefined; // Not clickable while syncing
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }

    public showSynced(): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(check) Slingr: Infra Synced`;
        this.statusBarItem.tooltip = 'Infrastructure is up to date with your data sources.';
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();

        // Hide the success message after 5 seconds to keep the UI clean
        this.hideTimer = setTimeout(() => this.hide(), 5000);
    }

    public showError(errorMessage: string): void {
        this.clearHideTimer();
        this.statusBarItem.text = `$(error) Slingr: Infra Sync Failed`;
        this.statusBarItem.tooltip = `Click to see the error. Last error: ${errorMessage}`;
        this.statusBarItem.command = 'slingr.showInfraError'; // A new command to show the error
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
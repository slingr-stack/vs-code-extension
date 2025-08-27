import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { ExplorerProvider } from './explorerProvider';
import { QuickInfoProvider } from '../quickInfoPanel/quickInfoProvider';
import { AppTreeItem } from './appTreeItem';

export function registerExplorer(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    quickInfoProvider: QuickInfoProvider
): vscode.TreeView<AppTreeItem> {
    
    const explorerProvider = new ExplorerProvider(cache, context.extensionUri);

    const treeView = vscode.window.createTreeView('slingrExplorer', {
        treeDataProvider: explorerProvider,
        dragAndDropController: explorerProvider,
        showCollapseAll: true
    });

    // The logic to link the explorer's selection to the info panel belongs here
    const selectionDisposable = treeView.onDidChangeSelection(e => {
        const selectedItem = e.selection?.[0] as AppTreeItem;
        quickInfoProvider.update(selectedItem);
    });

    context.subscriptions.push(treeView, selectionDisposable);
    
    return treeView;
}
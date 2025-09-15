import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { ExplorerProvider } from './explorerProvider';
import { QuickInfoProvider } from '../quickInfoPanel/quickInfoProvider';
import { AppTreeItem } from './appTreeItem';

let explorerProvider: ExplorerProvider;

export function registerExplorer(
    context: vscode.ExtensionContext, 
    cache: MetadataCache, 
    quickInfoProvider: QuickInfoProvider
): { treeView: vscode.TreeView<AppTreeItem>, provider: ExplorerProvider } {
    
    explorerProvider = new ExplorerProvider(cache, context.extensionUri);

    const treeView = vscode.window.createTreeView('slingrExplorer', {
        treeDataProvider: explorerProvider,
        dragAndDropController: explorerProvider,
        showCollapseAll: true
    });

    // Double-click tracking variables
    let lastClickTime = 0;
    let lastClickedItemKey: string | undefined;
    const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

    // Register the tree item click handler command
    const handleTreeItemClick = vscode.commands.registerCommand(
        'slingr-vscode-extension.handleTreeItemClick', 
        (item: AppTreeItem) => {
            const currentTime = Date.now();
            const currentItemKey = getItemKey(item);
            
            // Check for double-click
            if (lastClickedItemKey === currentItemKey && 
                (currentTime - lastClickTime) < DOUBLE_CLICK_THRESHOLD) {
                
                // Double-click: navigate to code
                navigateToItemCode(item);
                
                // Reset tracking
                lastClickTime = 0;
                lastClickedItemKey = undefined;
            } else {
                // Single-click: just update info panel
                quickInfoProvider.update(item.itemType, item.metadata as any);
                
                // Update tracking for potential double-click
                lastClickTime = currentTime;
                lastClickedItemKey = currentItemKey;
            }
        }
    );

    // Handle selection changes (for keyboard navigation and other selection events)
    const selectionDisposable = treeView.onDidChangeSelection(e => {
        const selectedItem = e.selection?.[0] as AppTreeItem;
        if (selectedItem) {
            // Update info panel for keyboard navigation
            quickInfoProvider.update(selectedItem.itemType, selectedItem.metadata as any);
        }
    });

    context.subscriptions.push(treeView, selectionDisposable, handleTreeItemClick);
    
    return { treeView, provider: explorerProvider };
}

/**
 * Create a unique key for an tree item to enable proper double-click detection
 */
function getItemKey(item: AppTreeItem): string {
    // Create a unique key based on item type, label, and metadata
    const metadataKey = item.metadata && 'name' in item.metadata ? item.metadata.name : '';
    const parentKey = item.parent ? item.parent.label : '';
    return `${item.itemType}:${item.label}:${metadataKey}:${parentKey}`;
}

export function getExplorerProvider(): ExplorerProvider {
    return explorerProvider;
}

/**
 * Navigate to the code definition for the given tree item
 */
function navigateToItemCode(item: AppTreeItem): void {
    if (!item.metadata || !('declaration' in item.metadata)) {
        return;
    }

    // Execute the navigate to code command
    vscode.commands.executeCommand('slingr-vscode-extension.navigateToCode', item.metadata.declaration);
}
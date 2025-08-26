import * as vscode from 'vscode';
import { DecoratedClass, PropertyMetadata, MethodMetadata, DecoratorMetadata } from '../cache/cache';
import { AppTreeItem } from '../explorer/appTreeItem';
import { IMetadataRenderer } from './renderers/iMetadataRenderer';  
import { ModelRenderer } from './renderers/modelRenderer';
import { FieldRenderer } from './renderers/fieldRenderer';

export class QuickInfoProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'slingrQuickInfo';
    private _view?: vscode.WebviewView;
    private readonly rendererRegistry: Map<string, IMetadataRenderer>;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        this.rendererRegistry = new Map<string, IMetadataRenderer>([
            ['model', new ModelRenderer()],
            ['field', new FieldRenderer()],
        ]);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        // Initially, show a message to select an item
        this.update(undefined);
    }

    /**
     * Updates the content of the webview with the metadata from the selected tree item.
     * @param item The selected AppTreeItem from the explorer.
     */
    public update(item: AppTreeItem | undefined): void {
        if (!this._view) { return; }

        if (!item || !item.metadata) {
            this._view.webview.html = this._getHtmlForWebview(
                'generic', { info: "Select an item in the explorer to see details." }
            );
            return;
        }
        
        this._view.webview.html = this._getHtmlForWebview(item.itemType, item.metadata);
    }

    private _getHtmlForWebview(itemType: string, metadata: any): string {
        // Find the correct renderer for the given itemType
        const renderer = this.rendererRegistry.get(itemType);

        let contentHtml: string;
        if (renderer) {
            // If we found a specialist, delegate the rendering task
            contentHtml = renderer.render(metadata);
        } else {
            // Fallback for unknown types
            contentHtml = `<pre><code>${JSON.stringify(metadata, null, 2)}</code></pre>`;
        }

        // The HTML wrapper remains the same
        return `<!DOCTYPE html>...[HTML shell code]...<body>${contentHtml}</body></html>`;
    }
    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }
}
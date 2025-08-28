import * as vscode from 'vscode';
import { DecoratedClass, MetadataCache } from '../cache/cache';
import { rendererRegistry } from './renderers/rendererRegistry';
import { IMetadataRenderer, IRendererContext } from './renderers/iMetadataRenderer';  

export class QuickInfoProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'slingrQuickInfo';
    private _view?: vscode.WebviewView;
    private readonly rendererRegistry: Map<string, IMetadataRenderer> = rendererRegistry;
    private _navigationHistory: { itemType: string; metadata: any }[] = [];
    private _currentState: { itemType: string; metadata: any } | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly cache: MetadataCache
    ) {}

    public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
) {
    this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // This listener now correctly handles clicks from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'itemClicked') {
                this._handleItemClicked(message.data);
            }
            if (message.command === 'navigateBack') {
                this._navigateBack();
            }
            if (message.command === 'goToLocation') {
                const locData = message.data;

                // Check if the received data has the structure we expect
                if (locData && locData.uri && locData.range) {
                    try {
                        // Reconstruct the vscode.Uri and vscode.Range from the plain object data
                        const uri = vscode.Uri.file(locData.uri.path);
                
                        // Note: A serialized Range becomes an array of two Position objects
                        const startPosition = new vscode.Position(locData.range[0].line, locData.range[0].character);
                        const endPosition = new vscode.Position(locData.range[1].line, locData.range[1].character);
                        const range = new vscode.Range(startPosition, endPosition);

                        const location = new vscode.Location(uri, range);
                
                        // Now we pass a real, functional Location object to the command
                        vscode.commands.executeCommand('slingr-vscode-extension.navigateToCode', location);

                    } catch (e) {
                        console.error('Failed to reconstruct location for navigation:', e);
                        vscode.window.showErrorMessage('Could not navigate to the selected function.');
                    }
                }
            }
        });

        this.update(undefined, undefined);
}

    /**
     * Updates the content of the webview with the metadata from the selected tree item.
     * @param item The selected AppTreeItem from the explorer.
     */
    public update(itemType: string | undefined, metadata: any, isNavigatingBack = false): void {
        if (!this._view) {
            return;
        }

        if (!isNavigatingBack && this._currentState) {
            this._navigationHistory.push(this._currentState);
        }

        if (!itemType || !metadata) {
            const contentHtml = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:1.5em;">
                <div style="width:100%;max-width:560px;text-align:center;border:1px solid var(--vscode-editor-widget-border);background:var(--vscode-editor-widget-background);padding:1.25em;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <div style="font-size:48px;line-height:1;margin-bottom:0.25em;color:var(--vscode-icon-foreground)">📘</div>
                <h1 style="margin:0.25em 0;color:var(--vscode-editor-foreground);font-size:1.25em;justify-content:center;">No item selected</h1>
                <p style="margin:0.5em 0;color:var(--vscode-description-foreground);">Select a metadata in the Explorer to view its metadata and quick navigation options.</p>
                </div>
            </div>
            `;
            this._view.webview.html = this._buildHtmlShell(contentHtml, '');
            return;
        }
        
        this._currentState = { itemType, metadata };
        this._view.webview.html = this._getHtmlForWebview(itemType, metadata);
    }

    /**
     * Handles the logic for an 'itemClicked' event from the webview.
     */
    private _handleItemClicked(data: { itemType: string; name: string; parentClassName?: string }): void {
        const { itemType, name, parentClassName } = data;
        let foundMetadata: any;

        if (itemType === 'field' && parentClassName) {
            // Logic to find a specific field within a parent class
            const [parentClass] = this.cache.findMetadata(
                item => 'properties' in item && item.name === parentClassName
            ) as DecoratedClass[];
            
            if (parentClass) {
                foundMetadata = parentClass.properties[name];
            }
        } else if (itemType === 'model') {
            // Logic to find a model by its class name
            const [modelClass] = this.cache.findMetadata(
                item => 'properties' in item && item.name === name
            ) as DecoratedClass[];
            foundMetadata = modelClass;
        }

        if (foundMetadata) {
            // If we found the metadata, update the panel with it
            this.update(itemType, foundMetadata);
        } else {
            vscode.window.showWarningMessage(`Could not find metadata for "${name}".`);
        }
    }

    private _navigateBack(): void {
        const lastState = this._navigationHistory.pop();
        if (lastState) {
            this.update(lastState.itemType, lastState.metadata, true);
        }
    }

    private _getHtmlForWebview(itemType: string, metadata: any): string {
        // Find the correct renderer for the given itemType
        const renderer = this.rendererRegistry.get(itemType);
        let contentHtml: string;

        if (renderer && this._view) {
            // If we found a specialist, delegate the rendering task
            const context: IRendererContext = {
                webview: this._view.webview,
                extensionUri: this._extensionUri,
                findModel: (name: string) => this.cache.findMetadata(
                    item => 'properties' in item && item.name === name
                )[0] as DecoratedClass | undefined
            };
            contentHtml = renderer.render(metadata, context);
        } else {
            // Fallback for unknown types
            contentHtml = `<pre><code>${JSON.stringify(metadata, null, 2)}</code></pre>`;
        }

        const backButtonHtml = this._navigationHistory.length > 0
            ? `<button id="backButton" class="back-button">← Back</button>`
            : '';

        return this._buildHtmlShell(contentHtml, backButtonHtml);

    }

    private _buildHtmlShell(contentHtml: string, backButtonHtml: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Quick Info</title>
            <style>
                /* Base styles */
                body {
                    padding: 0.5em 1em;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-editor-foreground);
                }

                /* Typography */
                h1 {
                    font-size: 1.2em;
                    margin: 0 0 0.8em 0;
                    padding-bottom: 0.3em;
                    border-bottom: 1px solid var(--vscode-editor-widget-border);
                    display: flex;
                    align-items: center;
                    gap: 0.5em;
                }

                h2 {
                    font-size: 1.1em;
                    font-weight: 600;
                    margin: 1.2em 0 0.5em 0;
                }

                code {
                    font-family: var(--vscode-editor-font-family);
                    background-color: var(--vscode-text-code-block-background);
                    padding: 0.1em 0.3em;
                    border-radius: 3px;
                }

                /* Table styles */
                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                td {
                    padding: 0.4em 0;
                    vertical-align: top;
                }

                td.label {
                    font-weight: 600;
                    width: 25%;
                    min-width: 70px;
                    color: var(--vscode-description-foreground);
                }

                /* Interactive elements */
                .clickable {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    cursor: pointer;
                }

                .clickable:hover {
                    text-decoration: underline;
                }

                .back-button {
                    margin-bottom: 1em;
                    padding: 0.2em 0.8em;
                    background-color: transparent;
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 4px;
                    cursor: pointer;
                }

                .back-button:hover {
                    background-color: var(--vscode-button-secondary-hover-background);
                }

                /* Tags and labels */
                .tag {
                    display: inline-block;
                    padding: 0.2em 0.7em;
                    border-radius: 1em;
                    font-size: 0.9em;
                    font-weight: 600;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .clickable-type {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-symbol-class-foreground);
                }

                /* Lists */
                .item-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-widget-background);
                    border: 1px solid var(--vscode-editor-widget-border);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .item-list li {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.4em 0.6em;
                    border-bottom: 1px solid var(--vscode-tree-table-border, rgba(128, 128, 128, 0.2));
                }

                .item-list li:last-child {
                    border-bottom: none;
                }

                /* Decorator styles */
                .decorators-container {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5em;
                }

                .decorator-block {
                    background-color: var(--vscode-editor-background);
                    border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground);
                    padding-left: calc(0.5em - 3px);
                }

                .decorator-name {
                    font-weight: 600;
                    color: lightgreen;
                    margin-bottom: 0.4em;
                }

                .decorator-args,
                .decorator-args-nested {
                    list-style: none;
                    padding-left: 1em;
                    margin: 0.2em 0 0 0;
                }

                .decorator-args {
                    color: var(--vscode-description-foreground);
                }

                /* Special content styles */
                .function-signature {
                    color: coral;
                }
            </style>
        </head>
        <body>
            ${backButtonHtml}
            ${contentHtml}
            <script>
                const vscode = acquireVsCodeApi();

                document.body.addEventListener('click', event => {
                    if (event.target.id === 'backButton') {
                        vscode.postMessage({ command: 'navigateBack' });
                        return;
                    }
                    const target = event.target.closest('[data-command]');
                    if (target) {
                        try {
                            const commandData = JSON.parse(target.dataset.command);
                            vscode.postMessage(commandData);
                        } catch (e) {
                            console.error('Error parsing command data:', e);
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }
}
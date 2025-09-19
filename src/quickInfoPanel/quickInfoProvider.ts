import * as vscode from 'vscode';
import { DecoratedClass, MetadataCache, PropertyMetadata, DecoratorMetadata, DataSourceMetadata, DatasetMetadata } from '../cache/cache';
import { rendererRegistry } from './renderers/rendererRegistry';
import { IMetadataRenderer, IRendererContext } from './renderers/iMetadataRenderer'; 

/**
 * Union type for info provider metadata items.
 * Represents all the different types of metadata that can be displayed in the Quick Info Panel.
 */
export type MetadataItem = DecoratedClass | PropertyMetadata | DecoratorMetadata | DataSourceMetadata | DatasetMetadata;

/**
 * The QuickInfoProvider class implements VS Code's WebviewViewProvider interface to create
 * a custom panel that displays detailed metadata information about Slingr components.
 * 
 * This provider creates a webview-based panel that shows:
 * - Model metadata with fields, decorators, and navigation
 * - Field metadata with types, decorators, and source locations
 * - Interactive navigation between related metadata items
 * - Code navigation to source definitions
 * 
 * Key Features:
 * - **Dynamic Content Rendering**: Uses specialized renderers for different metadata types
 * - **Navigation History**: Supports back/forward navigation through viewed items
 * - **Interactive Elements**: Clickable links for code navigation and related item exploration
 * - **Responsive Design**: Adapts to VS Code themes and provides a clean, readable interface
 */
export class QuickInfoProvider implements vscode.WebviewViewProvider {
    /** The unique identifier for this webview view type, used by VS Code for registration */
    public static readonly viewType = 'slingrQuickInfo';
    
    /** The webview view instance, set when the view is resolved */
    private _view?: vscode.WebviewView;
    
    /** Registry of specialized renderers for different metadata types */
    private readonly rendererRegistry: Map<string, IMetadataRenderer> = rendererRegistry;
    
    /** Navigation history stack for back/forward functionality */
    private _navigationHistory: { itemType: string; metadata: MetadataItem }[] = [];
    
    /** Current state representing the currently displayed metadata item */
    private _currentState: { itemType: string; metadata: MetadataItem } | undefined;

    /**
     * Creates a new QuickInfoProvider instance.
     * 
     * @param _extensionUri - The URI of the extension, used for resolving local resources
     * @param cache - The metadata cache containing parsed Slingr metadata
     */
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly cache: MetadataCache
    ) {}

    /**
     * Resolves the webview view when VS Code creates it.
     * This method is called by VS Code when the webview view needs to be displayed.
     * 
     * Sets up:
     * - Webview options (script execution, local resource access)
     * - Message handlers for user interactions
     * - Initial content display
     * 
     * @param webviewView - The webview view instance created by VS Code
     * @param context - Context information about the webview view
     * @param _token - Cancellation token (unused)
     */
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

        // Set up message handling for webview interactions
        // This listener handles clicks from the webview and processes various commands
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'itemClicked') {
                this._handleItemClicked(message.data);
            }
            if (message.command === 'navigateBack') {
                this._navigateBack();
            }
            if (message.command === 'goToLocation') {
                const locData = message.data;
                if (locData && locData.uri && locData.range) {
                    try {
                        const uri = vscode.Uri.file(locData.uri.path);
                        const startPosition = new vscode.Position(locData.range[0].line, locData.range[0].character);
                        const endPosition = new vscode.Position(locData.range[1].line, locData.range[1].character);
                        const range = new vscode.Range(startPosition, endPosition);
                        const location = new vscode.Location(uri, range);
            
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
     * 
     * This method handles:
     * - Navigation history management (unless navigating back)
     * - Content rendering using appropriate renderers
     * - Fallback display when no item is selected
     * 
     * @param itemType - The type of metadata item ('model', 'field', etc.)
     * @param metadata - The metadata object to display
     * @param isNavigatingBack - Whether this update is part of a back navigation (default: false)
     */
    public update(itemType: string | undefined, metadata: MetadataItem | undefined, isNavigatingBack = false): void {
        if (!this._view) {
            return;
        }

        if (this._currentState?.itemType === itemType && this._currentState?.metadata === metadata) {
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
     * 
     * Processes clicks on interactive elements within the webview and navigates
     * to the corresponding metadata items. Supports:
     * - Field navigation within model contexts
     * - Model navigation by class name
     * 
     * @param data - Click event data containing item type, name, and optional parent context
     */
    private _handleItemClicked(data: { itemType: string; name: string; parentClassName?: string }): void {
        const { itemType, name, parentClassName } = data;
        let foundMetadata: MetadataItem | undefined;

        if (itemType === 'field' && parentClassName) {
            const [parentClass] = this.cache.findMetadata(
                item => 'properties' in item && item.name === parentClassName
            ) as DecoratedClass[];
            
            if (parentClass) {
                foundMetadata = parentClass.properties[name];
            }
        } else if (itemType === 'model') {
            const [modelClass] = this.cache.findMetadata(
                item => 'properties' in item && item.name === name
            ) as DecoratedClass[];
            foundMetadata = modelClass;
        } else if (itemType === 'dataSource') {
            const dataSources = this.cache.getDataSources();
            foundMetadata = dataSources.find(ds => ds.name === name);
        } else if (itemType === 'dataset') {
            // Find dataset by name across all data sources
            const dataSources = this.cache.getDataSources();
            for (const dataSource of dataSources) {
                const dataset = dataSource.datasets.find(ds => ds.name === name);
                if (dataset) {
                    foundMetadata = dataset;
                    break;
                }
            }
        }
        if (foundMetadata) {
            // If we found the metadata, update the panel with it
            this.update(itemType, foundMetadata);
        } else {
            vscode.window.showWarningMessage(`Could not find metadata for "${name}".`);
        }
    }

    /**
     * Navigates back to the previous item in the navigation history.
     * Removes the last item from the history stack and displays it.
     */
    private _navigateBack(): void {
        const lastState = this._navigationHistory.pop();
        if (lastState) {
            this.update(lastState.itemType, lastState.metadata, true);
        }
    }

    /**
     * Generates the HTML content for the webview based on the provided metadata.
     * 
     * Uses the renderer registry to find appropriate specialized renderers for
     * different metadata types. Falls back to JSON display for unknown types.
     * 
     * @param itemType - The type of metadata item to render
     * @param metadata - The metadata object to render
     * @returns Complete HTML string for the webview content
     */
    private _getHtmlForWebview(itemType: string, metadata: MetadataItem | undefined): string {
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
                )[0] as DecoratedClass | undefined,
                findDataSource: (name: string) => this.cache.getDataSources().find(ds => ds.name === name),
                findDataset: (name: string) => {
                    // Find dataset by name across all data sources
                    const dataSources = this.cache.getDataSources();
                    for (const dataSource of dataSources) {
                        const dataset = dataSource.datasets.find(ds => ds.name === name);
                        if (dataset) {
                            return dataset;
                        }
                    }
                    return undefined;
                }
            };
            if (!metadata) {
                contentHtml = `<h1>No metadata found</h1>`;
            } else {
                contentHtml = renderer.render(metadata, context);
            }
        } else {
            // Special handling for specific item types that shouldn't show content
            if (itemType === 'datasetFile') {
                // Dataset files (JSONL) shouldn't show detailed info - the dataset itself provides that context
                contentHtml = `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:1.5em;">
                    <div style="width:100%;max-width:560px;text-align:center;border:1px solid var(--vscode-editor-widget-border);background:var(--vscode-editor-widget-background);padding:1.25em;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <div style="font-size:48px;line-height:1;margin-bottom:0.25em;color:var(--vscode-icon-foreground)">📄</div>
                    <h1 style="margin:0.25em 0;color:var(--vscode-editor-foreground);font-size:1.25em;justify-content:center;">Dataset File</h1>
                    <p style="margin:0.5em 0;color:var(--vscode-description-foreground);">This is a dataset file. Select the parent dataset to view detailed information.</p>
                    </div>
                </div>
                `;
            } else {
                // Fallback for other unknown types
                contentHtml = `<pre><code>${JSON.stringify(metadata, null, 2)}</code></pre>`;
            }
        }

        const backButtonHtml = this._navigationHistory.length > 0
            ? `<button id="backButton" class="back-button">← Back</button>`
            : '';

        return this._buildHtmlShell(contentHtml, backButtonHtml);

    }

    /**
     * Builds the complete HTML shell for the webview.
     * 
     * Creates a full HTML document with:
     * - VS Code theme-aware CSS styling
     * - Interactive JavaScript for handling user interactions
     * - Navigation controls (back button when appropriate)
     * - Content area for rendered metadata
     * 
     * @param contentHtml - The main content HTML to display
     * @param backButtonHtml - HTML for the back navigation button
     * @returns Complete HTML document string
     */
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
}
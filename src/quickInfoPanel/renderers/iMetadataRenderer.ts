import vscode from 'vscode';
import { DecoratedClass } from '../../cache/cache';
import { MetadataItem } from '../quickInfoProvider';


/**
 * A context object passed to all renderers, providing access to
 * useful vscode components like the webview and extension URI.
 */
export interface IRendererContext {
    webview: vscode.Webview;
    extensionUri: vscode.Uri;
    findModel: (name: string) => DecoratedClass | undefined;
}

/**
 * The interface that all metadata renderers must implement.
 */
export interface IMetadataRenderer {
    render(metadata: MetadataItem, context: IRendererContext): string;
}
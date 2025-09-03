import vscode from 'vscode';
import { DecoratedClass } from '../../cache/cache';
import { MetadataItem } from '../quickInfoProvider';

/**
 * Context interface providing renderers with access to VS Code components and utilities.
 * 
 * This interface defines the context object passed to all metadata renderers,
 * giving them access to:
 * - VS Code webview for resource URI generation
 * - Extension URI for local resource resolution
 * - Model lookup functionality for cross-references
 * 
 * The context ensures renderers can create interactive elements, resolve resources,
 * and navigate between related metadata items.
 */
export interface IRendererContext {
    /** The VS Code webview instance for generating resource URIs */
    webview: vscode.Webview;
    
    /** The extension's URI for resolving local resources like icons and stylesheets */
    extensionUri: vscode.Uri;
    
    /** Function to find model metadata by name for creating cross-references */
    findModel: (name: string) => DecoratedClass | undefined;
}

/**
 * Interface that all metadata renderers must implement.
 * 
 * Defines the contract for specialized renderers that convert metadata objects
 * into HTML representations for display in the Quick Info Panel.
 * 
 * Renderers are responsible for:
 * - Converting metadata into semantic HTML
 * - Creating interactive elements for navigation
 * - Applying appropriate styling and structure
 * - Handling renderer-specific formatting requirements
 */
export interface IMetadataRenderer {
    /**
     * Renders metadata into HTML for display in the webview.
     * 
     * @param metadata - The metadata object to render
     * @param context - Rendering context with VS Code components and utilities
     * @returns HTML string representing the rendered metadata
     */
    render(metadata: MetadataItem, context: IRendererContext): string;
}
import * as vscode from 'vscode';
import { DecoratorMetadata } from '../../cache/cache';
import { IMetadataRenderer, IRendererContext } from './iMetadataRenderer';
import { isMethodMetadata } from '../../utils/metadata';
import { MetadataItem } from '../quickInfoProvider';

/**
 * Abstract base class providing common functionality for all metadata renderers.
 * 
 * This class implements the IMetadataRenderer interface and provides shared utilities
 * that specialized renderers can use to create consistent, interactive HTML output.
 * 
 * Key Features:
 * - **Table Row Generation**: Standardized table row creation with labels and values
 * - **Decorator Rendering**: Comprehensive decorator display with interactive elements
 * - **Click Handler Support**: Automatic generation of clickable elements for navigation
 * - **Type-Specific Formatting**: Special handling for method signatures and choice labels
 * 
 * Subclasses must implement the abstract `render` method to provide type-specific
 * rendering logic while leveraging the common utilities provided here.
 */
export abstract class BaseRenderer implements IMetadataRenderer {
    /**
     * Abstract method that must be implemented by subclasses.
     * Defines the specific rendering logic for each metadata type.
     * 
     * @param metadata - The metadata object to render
     * @param context - Optional rendering context with VS Code components
     * @returns HTML string representing the rendered metadata
     */
    abstract render(metadata: MetadataItem, context?: IRendererContext): string;

    /**
     * Creates a standardized table row with a label and value.
     * 
     * Provides consistent formatting for metadata properties display.
     * Automatically filters out empty, null, or undefined values.
     * 
     * @param label - The label text for the property
     * @param value - The value to display (can be HTML)
     * @returns HTML table row string, or empty string if value is empty
     */
    protected _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }

    /**
     * Renders a collection of decorators into interactive HTML.
     * 
     * Creates a comprehensive display of decorators with:
     * - Clickable decorator names that navigate to their definitions
     * - Formatted argument lists with type-specific handling
     * - Special formatting for method signatures and choice labels
     * - Interactive elements for method declarations
     * 
     * @param decorators - Array of decorator metadata to render
     * @param parentUri - URI of the file containing the decorated element
     * @returns HTML table row containing all decorator information
     */
    protected _renderDecorators(decorators: DecoratorMetadata[], parentUri: vscode.Uri): string {
        if (!decorators || decorators.length === 0) {
            return '';
        }

        const decoratorHtml = decorators
            .filter(dec => dec && dec.name)
            .map(dec => {
                // Create a Location object for this specific decorator
                const decoratorLocation = new vscode.Location(parentUri, dec.position);
                const commandData = {
                    command: 'goToLocation',
                    data: decoratorLocation
                };
                let argsHtml = '';
                if (Array.isArray(dec.arguments) && dec.arguments.length > 0 && typeof dec.arguments[0] === 'object' && dec.arguments[0] !== null) {
                    const argsObject = dec.arguments[0];
                    const argList = Object.entries(argsObject).map(([key, value]) => {
                        if (isMethodMetadata(value)) {
                            const commandData = {
                                command: 'goToLocation',
                                data: value.declaration
                            };
                            const signature = `(${value.parameters.map(p => `${p.name}: ${p.type}`).join(', ')})`;
                            return `
                                <li>
                                    <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                                        <code class="function-signature">${key}: ${signature}</code>
                                    </a>
                                </li>`;
                        }
                        if (dec.name === 'Choice' && key === 'labels' && typeof value === 'object' && value !== null) {
                            const choiceLabels = Object.entries(value)
                                .map(([valKey, valLabel]) => `<li><code>${valKey}</code>: "${valLabel}"</li>`)
                                .join('');
                            return `<li><code>${key}:</code><ul class="decorator-args-nested">${choiceLabels}</ul></li>`;
                        }
                        return `<li><code>${key}:</code> ${JSON.stringify(value)}</li>`;
                    }).join('');

                    if (argList) {
                        argsHtml = `<ul class="decorator-args">${argList}</ul>`;
                    }
                }
            
                const decoratorClass = dec.name === 'Field' ? 'field-decorator' : '';

                return `
                    <div class="decorator-block ${decoratorClass}">
                        <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                            <div class="decorator-name">@${dec.name}</div>
                        </a>
                        ${argsHtml}
                    </div>`;
            }).join('');

        return `<tr><td class="label">Decorators</td><td><div class="decorators-container">${decoratorHtml}</div></td></tr>`;
    }
}
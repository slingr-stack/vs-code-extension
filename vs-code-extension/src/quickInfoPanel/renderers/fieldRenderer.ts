import { PropertyMetadata } from '../../cache/cache';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';

/**
 * Specialized renderer for Slingr field metadata display.
 * 
 * The FieldRenderer creates a detailed view of field properties including:
 * - Field name with source code navigation
 * - Type information with appropriate styling
 * - Complete decorator information with interactive elements
 */
export class FieldRenderer extends BaseRenderer {
    /**
     * Renders field metadata into a structured HTML display.
     * @param metadata - The field property metadata to render
     * @param context - Rendering context (currently unused but available for future enhancements)
     * @returns HTML string with complete field information display
     */
    public render(metadata: PropertyMetadata, context: IRendererContext): string {
        const prop = metadata;

        const titleCommand = {
            command: 'goToLocation',
            data: prop.declaration
        };

        return `
            <h1>
                <span class="tag">Field</span>
                <a href="#" class="clickable" data-command='${JSON.stringify(titleCommand)}'>${prop.name}</a>
            </h1>
            <table>
                ${this._renderTableRow('Name', `<code>${prop.name}</code>`)}
                ${this._renderTableRow('Type', `<span class="tag">${prop.type}</span>`)}
                ${this._renderDecorators(prop.decorators, prop.declaration.uri)} 
            </table>
        `;
    }
}
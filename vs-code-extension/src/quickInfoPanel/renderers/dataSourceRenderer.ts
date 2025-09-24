import { DataSourceMetadata } from '../../cache/cache';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';

/**
 * Specialized renderer for Slingr data source metadata display.
 *
 * The DataSourceRenderer creates a view of data source configurations including:
 * - Data source name with source code navigation
 * - Type information
 * - Connection details (excluding sensitive information)
 */
export class DataSourceRenderer extends BaseRenderer {
    /**
     * Renders data source metadata into a structured HTML display.
     * @param metadata - The data source metadata to render
     * @param context - Rendering context (currently unused but available for future enhancements)
     * @returns HTML string with complete data source information display
     */
    public render(metadata: DataSourceMetadata, context: IRendererContext): string {
        const ds = metadata;

        const titleCommand = {
            command: 'goToLocation',
            data: ds.declaration
        };

        return `
            <h1>
                <span class="tag">Data Source</span>
                <a href="#" class="clickable" data-command='${JSON.stringify(titleCommand)}'>${ds.name}</a>
            </h1>
            <table>
                ${this._renderTableRow('Name', `<code>${ds.name}</code>`)}
                ${this._renderTableRow('Type', `<span class="tag">${ds.type}</span>`)}
                ${this._renderTableRow('Host', ds.options.host)}
                ${this._renderTableRow('Port', ds.options.port)}
                ${this._renderTableRow('Database', ds.options.database)}
            </table>
        `;
    }
}
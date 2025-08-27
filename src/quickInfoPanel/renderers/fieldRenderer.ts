import { PropertyMetadata } from '../../cache/cache';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';

export class FieldRenderer extends BaseRenderer {
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
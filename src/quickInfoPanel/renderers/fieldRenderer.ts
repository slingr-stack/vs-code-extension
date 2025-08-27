import { IMetadataRenderer } from './iMetadataRenderer';
import { DecoratorMetadata, PropertyMetadata } from '../../cache/cache';
import { renderDecorators } from './rendererUtils';

export class FieldRenderer implements IMetadataRenderer {
    public render(metadata: PropertyMetadata): string {
        const prop = metadata;
        return `
            <h1><span class="tag">Field</span> ${prop.name}</h1>
            <table>
                ${this._renderTableRow('Name', `<code>${prop.name}</code>`)}
                ${this._renderTableRow('Type', `<span class="tag">${prop.type}</span>`)}
                ${renderDecorators(prop.decorators)}
            </table>
        `;
    }
    // ... (_renderTableRow method remains the same)
    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }

    private _renderDecorators(decorators: DecoratorMetadata[]): string {
        if (!decorators || decorators.length === 0) {
            return '';
        }

        const decoratorHtml = decorators.map(dec => {
            if (!dec || !dec.name) {
                return '';
            }
            // We are interested in decorators like @Field, @Text, not internal ones
            if (dec.name === 'Model' || dec.name === 'Field') {
                return '';
            }

            let argsHtml = '';
            if (Array.isArray(dec.arguments) && dec.arguments.length > 0 && typeof dec.arguments[0] === 'object' && dec.arguments[0] !== null) {
                const argsObject = dec.arguments[0];
                const argList = Object.entries(argsObject).map(([key, value]) => {
                    return `<li><code>${key}:</code> ${JSON.stringify(value)}</li>`;
                }).join('');
                argsHtml = `<ul class="decorator-args">${argList}</ul>`;
            }
        
            return `<div class="decorator-block">
                    <div class="decorator-name">@${dec.name}</div>
                    ${argsHtml}
                    </div>`;

        }).join('');

        return `<tr><td class="label">Decorators</td><td><div class="decorators-container">${decoratorHtml}</div></td></tr>`;
    }
}
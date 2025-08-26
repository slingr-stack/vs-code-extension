import { IMetadataRenderer } from './iMetadataRenderer';
import { PropertyMetadata } from '../../cache/cache';

export class FieldRenderer implements IMetadataRenderer {
    public render(metadata: PropertyMetadata): string {
        const prop = metadata;
        return `
            <h1>Field: ${prop.name}</h1>
            <table>
                ${this._renderTableRow('Name', `<code>${prop.name}</code>`)}
                ${this._renderTableRow('Type', `<span class="tag">${prop.type}</span>`)}
            </table>
        `;
    }

    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }
}
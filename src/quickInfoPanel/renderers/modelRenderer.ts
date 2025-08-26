import { IMetadataRenderer } from './iMetadataRenderer';
import { DecoratedClass } from '../../cache/cache';
import * as vscode from 'vscode';

export class ModelRenderer implements IMetadataRenderer {
    public render(metadata: DecoratedClass): string {
        const cls = metadata;
        const mainDecorator = cls.decorators.find(d => d.name === 'Model');
        const label = mainDecorator?.arguments[0]?.label || cls.name;
        
        return `
            <h1>Model: ${label}</h1>
            <table>
                ${this._renderTableRow('Name', `<code>${cls.name}</code>`)}
                ${this._renderTableRow('Source', `<code>${vscode.workspace.asRelativePath(cls.declaration.uri)}</code>`)}
            </table>
        `;
    }

    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }
}
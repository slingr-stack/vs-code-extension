import { IMetadataRenderer } from './iMetadataRenderer';
import { DecoratedClass } from '../../cache/cache';
import * as vscode from 'vscode';

export class ModelRenderer implements IMetadataRenderer {
    public render(metadata: DecoratedClass): string {
        const cls = metadata;
        const mainDecorator = cls.decorators.find(d => d.name === 'Model');
        const label = mainDecorator?.arguments[0]?.label || cls.name;

        // Generate the list of fields
        const fieldsListHtml = Object.values(cls.properties)
            .filter(prop => prop.decorators.some(d => d.name === 'Field'))
            .map(prop => {
                // This creates the clickable data attribute for each field
                const commandData = {
                    command: 'itemClicked',
                    data: {
                        itemType: 'field',
                        name: prop.name,
                        parentClassName: cls.name
                    }
                };
                return `
                    <li>
                        <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                            <code>${prop.name}</code>
                        </a>
                        <span class="tag">${prop.type}</span>
                    </li>
                `;
            }).join('');

        return `
            <h1><span class="tag">Model</span> ${label}</h1>
            <table>
                ${this._renderTableRow('Class Name', `<code>${cls.name}</code>`)}
                ${this._renderTableRow('Source', `<code>${vscode.workspace.asRelativePath(cls.declaration.uri)}</code>`)}
            </table>

            ${fieldsListHtml ? `<h2>Fields</h2><ul class="item-list">${fieldsListHtml}</ul>` : ''}
        `;
    }
    // ... (_renderTableRow method remains the same)
    private _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }
}
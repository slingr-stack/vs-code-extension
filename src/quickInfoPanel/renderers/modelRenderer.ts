import { IMetadataRenderer } from './iMetadataRenderer';
import { DecoratedClass, DecoratorMetadata } from '../../cache/cache';
import * as vscode from 'vscode';
import { renderDecorators } from './rendererUtils';

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
                ${renderDecorators(cls.decorators)} 
            </table>
            ${fieldsListHtml ? `<h2>Fields</h2><ul class="item-list">${fieldsListHtml}</ul>` : ''}
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
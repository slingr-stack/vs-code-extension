import { DecoratedClass } from '../../cache/cache';
import * as vscode from 'vscode';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';

/**
 * Specialized renderer for Slingr model metadata display.
 * 
 * The ModelRenderer creates a comprehensive view of model classes including:
 * - Model identification with name and label information
 * - Source file navigation capabilities
 * - Complete decorator information with interactive elements
 * - Field listing with type information and navigation
 * - Cross-references to related models
 */
export class ModelRenderer extends BaseRenderer {
    /**
     * Renders model metadata into a structured HTML display.
     * @param metadata - The model class metadata to render
     * @param context - Rendering context providing model lookup and webview access
     * @returns HTML string with complete model information display
     */
    public render(metadata: DecoratedClass, context: IRendererContext): string {
        const cls = metadata;
        const mainDecorator = cls.decorators.find(d => d.name === 'Model');
        const sourceFileLocation = new vscode.Location(cls.declaration.uri, new vscode.Position(0, 0));
        const sourceCommand = {
            command: 'goToLocation',
            data: sourceFileLocation
        };

        const dataSourceName = mainDecorator?.arguments[0]?.dataSource;
        let dataSourceHtml = '';
        if (dataSourceName && context.findDataSource(dataSourceName)) {
            const dataSourceClickCommand = {
                command: 'itemClicked',
                data: {
                    itemType: 'dataSource',
                    name: dataSourceName
                }
            };
            dataSourceHtml = `<a href="#" class="clickable" data-command='${JSON.stringify(dataSourceClickCommand)}'><code>${dataSourceName}</code></a>`;
        } else if (dataSourceName) {
            dataSourceHtml = `<code>${dataSourceName}</code>`;
        }

        const fieldsListHtml = Object.values(cls.properties)
            .filter(prop => prop.decorators.some(d => d.name === 'Field'))
            .map(prop => {
                // This creates the clickable data attribute for each field
                const fieldClickCommand  = {
                    command: 'itemClicked',
                    data: {
                        itemType: 'field',
                        name: prop.name,
                        parentClassName: cls.name
                    }
                };
                const typeAsModel = context.findModel(prop.type);
                let typeHtml: string;
                if (typeAsModel) {
                    // If it's a model, make the type clickable
                    const typeClickCommand = {
                        command: 'itemClicked',
                        data: {
                            itemType: 'model',
                            name: prop.type
                        }
                    };
                    typeHtml = `
                            <a href="#" class="clickable" data-command='${JSON.stringify(typeClickCommand)}'>
                                <span class="tag clickable-type">${prop.type}</span>
                            </a>`;
                } else {
                    // Otherwise, just display it as a normal tag
                    typeHtml = `<span class="tag">${prop.type}</span>`;
                }

                return `
                    <li>
                        <a href="#" class="clickable item-link" data-command='${JSON.stringify(fieldClickCommand)}'>
                            <code>${prop.name}</code>
                        </a>
                        ${typeHtml}
                    </li>
                `;
            }).join('');

        return `
            <h1>
                <h1><span class="tag">Model</span> ${cls.name}</h1>
            </h1>
            <table>
                ${this._renderTableRow('Source', `<a href="#" class="clickable" data-command='${JSON.stringify(sourceCommand)}'><code>${vscode.workspace.asRelativePath(cls.declaration.uri)}</code></a>`)}
                ${this._renderTableRow('Data Source', dataSourceHtml)}
                ${this._renderDecorators(cls.decorators, cls.declaration.uri)} 
            </table>
            ${fieldsListHtml ? `<h2>Fields</h2><ul class="item-list">${fieldsListHtml}</ul>` : ''}
        `;
    }
}
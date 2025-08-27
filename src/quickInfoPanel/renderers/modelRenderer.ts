import { DecoratedClass } from '../../cache/cache';
import * as vscode from 'vscode';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';

export class ModelRenderer extends BaseRenderer {
    public render(metadata: DecoratedClass, context: IRendererContext): string {
        const cls = metadata;
        const mainDecorator = cls.decorators.find(d => d.name === 'Model');
        const label = mainDecorator?.arguments[0]?.label || cls.name;

        const titleCommand = {
            command: 'goToLocation',
            data: cls.declaration
        };

        const sourceFileLocation = new vscode.Location(cls.declaration.uri, new vscode.Position(0, 0));
        const sourceCommand = {
            command: 'goToLocation',
            data: sourceFileLocation
        };

        // Generate the list of fields
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
                ${this._renderDecorators(cls.decorators, cls.declaration.uri)} 
            </table>
            ${fieldsListHtml ? `<h2>Fields</h2><ul class="item-list">${fieldsListHtml}</ul>` : ''}
        `;
    }
}
import * as vscode from 'vscode';
import { DecoratorMetadata } from '../../cache/cache';
import { IMetadataRenderer, IRendererContext } from './iMetadataRenderer';
import { isMethodMetadata } from '../../utils/metadata';
import { MetadataItem } from '../quickInfoProvider';

export abstract class BaseRenderer implements IMetadataRenderer {
    // The main render method must be implemented by subclasses. The context is optional.
    abstract render(metadata: MetadataItem, context?: IRendererContext): string;

    protected _renderTableRow(label: string, value: any): string {
        if (value === undefined || value === null || value === '') { return ''; }
        return `<tr><td class="label">${label}</td><td>${value}</td></tr>`;
    }

    protected _renderDecorators(decorators: DecoratorMetadata[], parentUri: vscode.Uri): string {
        if (!decorators || decorators.length === 0) {
            return '';
        }

        const decoratorHtml = decorators
            .filter(dec => dec && dec.name)
            .map(dec => {
                // Create a Location object for this specific decorator
                const decoratorLocation = new vscode.Location(parentUri, dec.position);
                const commandData = {
                    command: 'goToLocation',
                    data: decoratorLocation
                };
                let argsHtml = '';
                if (Array.isArray(dec.arguments) && dec.arguments.length > 0 && typeof dec.arguments[0] === 'object' && dec.arguments[0] !== null) {
                    const argsObject = dec.arguments[0];
                    const argList = Object.entries(argsObject).map(([key, value]) => {
                        if (isMethodMetadata(value)) {
                            const commandData = {
                                command: 'goToLocation',
                                data: value.declaration
                            };
                            const signature = `(${value.parameters.map(p => `${p.name}: ${p.type}`).join(', ')})`;
                            return `
                                <li>
                                    <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                                        <code class="function-signature">${key}: ${signature}</code>
                                    </a>
                                </li>`;
                        }
                        if (dec.name === 'Choice' && key === 'labels' && typeof value === 'object' && value !== null) {
                            const choiceLabels = Object.entries(value)
                                .map(([valKey, valLabel]) => `<li><code>${valKey}</code>: "${valLabel}"</li>`)
                                .join('');
                            return `<li><code>${key}:</code><ul class="decorator-args-nested">${choiceLabels}</ul></li>`;
                        }
                        return `<li><code>${key}:</code> ${JSON.stringify(value)}</li>`;
                    }).join('');

                    if (argList) {
                        argsHtml = `<ul class="decorator-args">${argList}</ul>`;
                    }
                }
            
                const decoratorClass = dec.name === 'Field' ? 'field-decorator' : '';

                return `
                    <div class="decorator-block ${decoratorClass}">
                        <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                            <div class="decorator-name">@${dec.name}</div>
                        </a>
                        ${argsHtml}
                    </div>`;
            }).join('');

        return `<tr><td class="label">Decorators</td><td><div class="decorators-container">${decoratorHtml}</div></td></tr>`;
    }
}
import { DecoratorMetadata } from '../../cache/cache';
import { isMethodMetadata } from '../../utils/metadata';

/**
 * Utility functions for rendering metadata components in the Quick Info Panel.
 * 
 * This module provides reusable rendering functions that can be shared across
 * different renderer implementations. It serves as a centralized location for
 * common rendering logic, ensuring consistency and reducing code duplication.
 * 
 * Key Features:
 * - **Decorator Rendering**: Comprehensive decorator display with interactive elements
 * - **Method Signature Formatting**: Special handling for method metadata
 * - **Choice Label Processing**: Enhanced formatting for @Choice decorator arguments
 * - **Click Handler Generation**: Automatic creation of navigation commands
 * 
 * @param decorators - Array of decorator metadata to render
 * @returns HTML table row containing formatted decorator information
 */
export function renderDecorators(decorators: DecoratorMetadata[]): string {
    if (!decorators || decorators.length === 0) {
        return '';
    }

    const decoratorHtml = decorators
        .filter(dec => dec && dec.name) // Ensure decorator is valid
        .map(dec => {
            let argsHtml = '';
            if (Array.isArray(dec.arguments) && dec.arguments.length > 0 && typeof dec.arguments[0] === 'object' && dec.arguments[0] !== null) {
                const argsObject = dec.arguments[0];
                const argList = Object.entries(argsObject).map(([key, value]) => {
                    if (isMethodMetadata(value)) {
                        const commandData = {
                            command: 'goToLocation',
                            data: value.declaration 
                        };
            
                        // Build the signature string from the parameters array
                        const signature = `(${value.parameters.map(p => `${p.name}: ${p.type}`).join(', ')})`;

                        return `
                            <li>
                                <a href="#" class="clickable" data-command='${JSON.stringify(commandData)}'>
                                    <code class="function-signature">${key}: ${signature}</code>
                                </a>
                            </li>`;
                    }
                    // Special, more readable formatting for @Choice labels
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
            
            return `
                <div class="decorator-block">
                    <div class="decorator-name">@${dec.name}</div>
                    ${argsHtml}
                </div>`;
        }).join('');

    return `<tr><td class="label">Decorators</td><td><div class="decorators-container">${decoratorHtml}</div></td></tr>`;
}
import { DecoratorMetadata } from '../../cache/cache';

/**
 * Renders a list of decorators into a clean HTML string.
 * This function is designed to be the single source of truth for decorator display.
 */
export function renderDecorators(decorators: DecoratorMetadata[]): string {
    if (!decorators || decorators.length === 0) {
        return '';
    }

    const decoratorHtml = decorators
        .filter(dec => dec && dec.name) // Ensure decorator is valid
        .map(dec => {
            let argsHtml = '';
            // Check if the first argument is an object, which is the common case (e.g., @Field({ label: '...' }))
            if (Array.isArray(dec.arguments) && dec.arguments.length > 0 && typeof dec.arguments[0] === 'object' && dec.arguments[0] !== null) {
                const argsObject = dec.arguments[0];
                const argList = Object.entries(argsObject).map(([key, value]) => {
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
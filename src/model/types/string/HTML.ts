import 'reflect-metadata';
import { validateStringType } from '../utils';
import { Text } from './Text';
import { IsArray, IsString } from 'class-validator';
import { Transform, TransformationType } from 'class-transformer';

/**
 * HTML type decorator.
 * - Must be used on `string` or `string[]` fields.
 * - For single strings: identical to `Text()` without extra options.
 * - For string arrays: validates each element is a string.
 */
// Custom key types for clearer IntelliSense errors
type HtmlKey<T, K extends keyof T & string> = T[K] extends string | string[]
    ? K
    : `HTML: requires string or string[] field`;

/**
 * Validates that a property is of string or string array type at runtime.
 */
function validateHtmlType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== String && designType !== Array) {
        throw new Error(`@HTML can only be applied to 'string' or 'string[]' properties: ${propertyKey}`);
    }
}

/**
 * HTML type decorator for string or string array properties.
 *
 * This decorator can be applied to properties of type `string` or `string[]` and provides
 * validation capabilities. For single strings, it behaves identically to the Text decorator.
 * For string arrays, it validates that each element is a string. It also stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation to indicate this field contains HTML content.
 *
 * @example
 * ```typescript
 * class Article {
 *   @HTML()
 *   content: string;
 *   
 *   @HTML()
 *   sections: string[];
 * }
 * ```
 *
 * @returns A property decorator function that applies text validation and stores HTML metadata
 *
 * @throws {Error} When applied to non-string or non-string[] properties
 *
 * @remarks
 * - For strings: identical to Text() decorator in functionality
 * - For arrays: validates each element is a string
 * - Metadata is stored under 'field:type' key with value 'html' or 'array:html'
 * - The decorator uses reflection to verify the property type at runtime
 * - Inherits validation capabilities from the Text decorator for single strings
 */
export function HTML() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: HtmlKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateHtmlType(proto, propName);
        
        const designType = Reflect.getMetadata('design:type', proto, propName);
        
        if (designType === Array) {
            // Handle string array case
            Reflect.defineMetadata('field:type', 'array:html', proto, propName);
            
            // Use built-in class-validator decorators for array validation
            IsArray()(target as any, propName);
            IsString({ each: true })(target as any, propName);

            // Apply transformation for JSON serialization/deserialization
            Transform(({ value, type }) => {
                if (type === TransformationType.CLASS_TO_PLAIN) {
                    // Serialization: array -> JSON
                    if (value == null) return value;
                    if (!Array.isArray(value)) return value;
                    return value;
                } else if (type === TransformationType.PLAIN_TO_CLASS) {
                    // Deserialization: JSON -> array
                    if (value == null) return value;
                    if (!Array.isArray(value)) return value;
                    
                    // Ensure all elements are strings
                    return value.map(element => String(element));
                }
                
                return value;
            })(target as any, propName);
        } else {
            // Handle single string case
            Reflect.defineMetadata('field:type', 'html', proto, propName);
            Text()(target as any, propName as any);
        }
    };
}

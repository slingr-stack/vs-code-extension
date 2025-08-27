import 'reflect-metadata';
import { validateStringType } from './utils';
import { Text } from './Text';

/**
 * HTML type decorator.
 * - Must be used on `string` fields.
 * - Currently identical to `Text()` without extra options.
 */
// Custom key types for clearer IntelliSense errors
type HtmlKey<T, K extends keyof T & string> = T[K] extends string
    ? K
    : `HTML: requires string field`;

/**
 * HTML type decorator for string properties.
 *
 * This decorator can only be applied to properties of type `string` and provides
 * the same validation capabilities as the Text decorator. It also stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation to indicate this field contains HTML content.
 *
 * @example
 * ```typescript
 * class Article {
 *   @HTML()
 *   content: string;
 * }
 * ```
 *
 * @returns A property decorator function that applies text validation and stores HTML metadata
 *
 * @throws {Error} When applied to non-string properties
 *
 * @remarks
 * - Currently identical to Text() decorator in functionality
 * - Metadata is stored under 'field:type' key with value 'html'
 * - The decorator uses reflection to verify the property type at runtime
 * - Inherits all validation capabilities from the Text decorator
 */
export function HTML() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: HtmlKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateStringType(proto, propName);
        Reflect.defineMetadata('field:type', 'html', proto, propName);
        Text()(target as any, propName as any);
    };
}

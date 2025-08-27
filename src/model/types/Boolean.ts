import 'reflect-metadata';
import { validateBooleanType } from './utils';

/**
 * Boolean type decorator.
 * - Must be used on `boolean` fields.
 * - No options for now.
 */
// Custom key types for clearer IntelliSense errors
type BooleanKey<T, K extends keyof T & string> = T[K] extends boolean
    ? K
    : `Boolean: requires boolean field`;

/**
 * Boolean type decorator for boolean properties.
 *
 * This decorator can only be applied to properties of type `boolean` and stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation.
 *
 * @example
 * ```typescript
 * class User {
 *   @Boolean()
 *   isActive: boolean;
 * 
 *   @Boolean()
 *   isVerified: boolean;
 * }
 * ```
 *
 * @returns A property decorator function that stores metadata
 *
 * @throws {Error} When applied to non-boolean properties
 *
 * @remarks
 * - This is a very simple type with no validation options
 * - Metadata is stored under 'field:type' key with value 'boolean'
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Boolean() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: BooleanKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateBooleanType(proto, propName);
        Reflect.defineMetadata('field:type', 'boolean', proto, propName);
    };
}

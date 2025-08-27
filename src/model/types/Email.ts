import 'reflect-metadata';
import { IsEmail } from 'class-validator';
import { validateStringType } from './utils';

/**
 * Email type decorator.
 * - Must be used on `string` fields.
 * - Uses standard class-validator email validation.
 * - No options.
 */
// Custom key types for clearer IntelliSense errors
type EmailKey<T, K extends keyof T & string> = T[K] extends string
    ? K
    : `Email: requires string field`;

/**
 * Email type decorator for string properties.
 *
 * This decorator can only be applied to properties of type `string` and provides
 * email validation capabilities through class-validator decorators. It also stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation.
 *
 * @example
 * ```typescript
 * class User {
 *   @Email()
 *   email: string;
 * }
 * ```
 *
 * @returns A property decorator function that applies email validation and stores metadata
 *
 * @throws {Error} When applied to non-string properties
 *
 * @remarks
 * - Uses standard class-validator email validation
 * - Metadata is stored under 'field:logicalType' key with value 'email'
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Email() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: EmailKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateStringType(proto, propName);
        Reflect.defineMetadata('field:logicalType', 'email', proto, propName);
        
        // Use standard class-validator email decorator
        IsEmail()(target as any, propName);
    };
}

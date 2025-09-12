import 'reflect-metadata';
import { IsEmail, IsArray } from 'class-validator';
import { Transform, TransformationType } from 'class-transformer';
import { validateStringType } from '../utils';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';
import { FIELD_TYPE, FIELD_TYPE_EMAIL, FIELD_TYPE_ARRAY_EMAIL } from '../../metadata/MetadataKeys';

/**
 * Email type decorator.
 * - Must be used on `string` or `string[]` fields.
 * - For single strings: uses standard class-validator email validation.
 * - For string arrays: validates each element as an email address.
 * - No options.
 */
// Custom key types for clearer IntelliSense errors
type EmailKey<T, K extends keyof T & string> = T[K] extends string | string[]
    ? K
    : `Email: requires string or string[] field`;

/**
 * Validates that a property is of string or string array type at runtime.
 */
function validateEmailType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== String && designType !== Array) {
        throw new Error(`@Email can only be applied to 'string' or 'string[]' properties: ${propertyKey}`);
    }
}

/**
 * Email type decorator for string or string array properties.
 *
 * This decorator can be applied to properties of type `string` or `string[]` and provides
 * email validation capabilities through class-validator decorators. For single strings,
 * it validates email format. For string arrays, it validates that each element is a valid
 * email address. It also stores metadata that can be consumed by other layers such as 
 * database mapping or documentation generation.
 *
 * @example
 * ```typescript
 * class User {
 *   @Email()
 *   email: string;
 *   
 *   @Email()
 *   alternativeEmails: string[];
 * }
 * ```
 *
 * @returns A property decorator function that applies email validation and stores metadata
 *
 * @throws {Error} When applied to non-string or non-string[] properties
 *
 * @remarks
 * - For strings: uses standard class-validator email validation
 * - For arrays: validates each element as an email address
 * - Metadata is stored under 'field:type' key with value 'email' or 'array:email'
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Email() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: EmailKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateEmailType(proto, propName);
        
        const designType = Reflect.getMetadata('design:type', proto, propName);
        
        if (designType === Array) {
            // Handle email array case
            Reflect.defineMetadata(FIELD_TYPE, FIELD_TYPE_ARRAY_EMAIL, proto, propName);
            
            // Use built-in class-validator decorators for array validation
            IsArray()(target as any, propName);
            IsEmail({}, { each: true })(target as any, propName);

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
            // Handle single email case
            Reflect.defineMetadata(FIELD_TYPE, FIELD_TYPE_EMAIL, proto, propName);
            
            // Use standard class-validator email decorator
            IsEmail()(target as any, propName);
        }
    };
}

/**
 * Configuration object for Email field TypeORM mapping.
 * Email fields are essentially text fields with email validation.
 */
export const EmailTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: any, nullable: boolean = true): any {
        return {
            type: 'varchar',
            length: 255, // Standard email length limit
            nullable: nullable
        };
    },

    getArrayElementColumnConfig(fieldOptions?: any): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the email type configuration
FieldTypeRegistry.register('email', EmailTypeConfig);

import 'reflect-metadata';
import {
    MinLength,
    MaxLength,
    Matches,
    IsArray,
    IsString,
    ArrayMinSize,
    ArrayMaxSize,
} from 'class-validator';
import { Transform, TransformationType } from 'class-transformer';
import { validateStringType } from '../utils';

/**
 * Options for the Text decorator.
 */
export interface TextOptions {
    /** Minimum allowed length for the string. */
    minLength?: number;
    /** Maximum allowed length for the string. */
    maxLength?: number;
    /** Regular expression to validate the value. */
    regex?: RegExp;
    /** Message to show if the regex fails. Required when `regex` is provided. */
    regexMessage?: string;
}

/**
 * Text type decorator.
 * - Can be applied to properties of type `string` or `string[]`.
 * - For single strings: applies class-validator decorators based on provided options.
 * - For string arrays: validates each element as a string and applies array-level constraints.
 * - Stores basic metadata that could be used by other layers (e.g., DB mapping).
 */
// Custom key types for clearer IntelliSense errors
type TextKey<T, K extends keyof T & string> = T[K] extends string | string[]
    ? K
    : `Text: requires string or string[] field`;

/**
 * Validates that a property is of string or string array type at runtime.
 */
function validateTextType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== String && designType !== Array) {
        throw new Error(`@Text can only be applied to 'string' or 'string[]' properties: ${propertyKey}`);
    }
}


/**
 * Stores metadata for the text field that can be consumed by other layers.
 * @param proto - The prototype object
 * @param propName - The property name
 * @param options - Text options to store
 */
function storeTextMetadata(proto: Object, propName: string, options?: TextOptions): void {
    Reflect.defineMetadata('field:type', 'text', proto, propName);
    if (options) {
        Reflect.defineMetadata('field:type:options', options, proto, propName);
    }
}

/**
 * Text type decorator for string or string array properties.
 *
 * This decorator can be applied to properties of type `string` or `string[]` and provides
 * validation capabilities through class-validator decorators. For single strings, it applies
 * length and regex validations. For string arrays, it validates each element as a string
 * and can apply array-level length constraints. It also stores metadata that can be consumed 
 * by other layers such as database mapping or documentation generation.
 *
 * @example
 * ```typescript
 * class User {
 *   @Text({ minLength: 2, maxLength: 50 })
 *   name: string;
 *   
 *   @Text({ regex: /^[A-Z]+$/, regexMessage: 'Must be uppercase letters only' })
 *   code: string;
 *   
 *   @Text({ minLength: 1, maxLength: 5 })
 *   tags: string[];
 * }
 * ```
 *
 * @param options - Configuration options for text validation and behavior
 * @param options.minLength - For strings: minimum length. For arrays: minimum array size
 * @param options.maxLength - For strings: maximum length. For arrays: maximum array size  
 * @param options.regex - Regular expression pattern (only for single strings)
 * @param options.regexMessage - Error message for regex validation (required when regex is provided)
 *
 * @returns A property decorator function that applies validation and stores metadata
 *
 * @throws {Error} When applied to non-string or non-string[] properties
 * @throws {Error} When regex is provided without regexMessage
 * @throws {Error} When regex is used with array properties
 *
 * @remarks
 * - For strings: validates length and regex patterns
 * - For arrays: validates array length and ensures each element is a string
 * - Metadata is stored under 'field:type' ('text' or 'array:text') and 'field:type:options' keys
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Text(options?: TextOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: TextKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateTextType(proto, propName);
        
        const designType = Reflect.getMetadata('design:type', proto, propName);
        
        if (designType === Array) {
            // Handle string array case
            Reflect.defineMetadata('field:type', 'array:text', proto, propName);
            if (options) {
                Reflect.defineMetadata('field:type:options', options, proto, propName);
            }
            
            // Validate that regex is not used with arrays
            if (options?.regex) {
                throw new Error(`@Text on '${propName}': regex validation is not supported for string arrays`);
            }
            
            // Use built-in class-validator decorators for array validation
            IsArray()(target as any, propName);
            IsString({ each: true })(target as any, propName);
            
            // Apply array size constraints
            if (options?.minLength !== undefined) {
                ArrayMinSize(options.minLength)(target as any, propName);
            }
            
            if (options?.maxLength !== undefined) {
                ArrayMaxSize(options.maxLength)(target as any, propName);
            }

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
            storeTextMetadata(proto, propName, options);

            // Apply class-validator decorators directly for single strings
            if (options?.minLength !== undefined) {
                MinLength(options.minLength)(target as any, propName);
            }

            if (options?.maxLength !== undefined) {
                MaxLength(options.maxLength)(target as any, propName);
            }
            
            if (options?.regex) {
                if (!options.regexMessage) {
                    throw new Error(`@Text on '${propName}' requires 'regexMessage' when 'regex' is provided`);
                }
                Matches(options.regex, { message: options.regexMessage })(target as any, propName);
            }
        }
    };
}
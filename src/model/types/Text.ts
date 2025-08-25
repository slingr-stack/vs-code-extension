import 'reflect-metadata';
import {
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
    minLength,
    maxLength,
    matches,
    isEmail,
} from 'class-validator';

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
 * - Can only be applied to properties of type `string`.
 * - Applies class-validator decorators based on provided options.
 * - Stores basic metadata that could be used by other layers (e.g., DB mapping).
 */
// Custom key types for clearer IntelliSense errors
type TextKey<T, K extends keyof T & string> = T[K] extends string
    ? K
    : `Text: requires string field`;
type EmailKey<T, K extends keyof T & string> = T[K] extends string
    ? K
    : `Email: requires string field`;
type HtmlKey<T, K extends keyof T & string> = T[K] extends string
    ? K
    : `HTML: requires string field`;


/**
 * Validates that a property is of string type at runtime.
 */
function validateStringType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== String) {
        throw new Error(`@Text can only be applied to 'string' properties: ${propertyKey}`);
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
 * Custom MinLength validator that only validates non-empty values
 */
function MinLengthIfNotEmpty(min: number, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        const decoratorOptions: any = {
            name: 'minLength',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [min],
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value == null || value === '') {
                        return true;
                    }
                    return minLength(value, args.constraints[0]);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be longer than or equal to ${args.constraints[0]} characters`;
                }
            },
        };
        if (validationOptions) {
            decoratorOptions.options = validationOptions;
        }
        registerDecorator(decoratorOptions);
    };
}

/**
 * Custom MaxLength validator that only validates non-empty values
 */
function MaxLengthIfNotEmpty(max: number, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        const decoratorOptions: any = {
            name: 'maxLength',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [max],
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value == null || value === '') {
                        return true;
                    }
                    return maxLength(value, args.constraints[0]);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be shorter than or equal to ${args.constraints[0]} characters`;
                }
            },
        };
        if (validationOptions) {
            decoratorOptions.options = validationOptions;
        }
        registerDecorator(decoratorOptions);
    };
}

/**
 * Custom Matches validator that only validates non-empty values
 */
function MatchesIfNotEmpty(pattern: RegExp, message: string, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'matches',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [pattern],
            options: { ...(validationOptions || {}), message },
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value == null || value === '') {
                        return true;
                    }
                    return matches(value, args.constraints[0]);
                },
                defaultMessage() {
                    return message;
                }
            },
        });
    };
}

/**
 * Custom Email validator that only validates non-empty values
 */
function IsEmailIfNotEmpty(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        const decoratorOptions: any = {
            name: 'isEmail',
            target: object.constructor,
            propertyName: propertyName,
            validator: {
                validate(value: any) {
                    if (value == null || value === '') {
                        return true;
                    }
                    return isEmail(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be an email`;
                }
            },
        };
        if (validationOptions !== undefined) {
            decoratorOptions.options = validationOptions;
        }
        registerDecorator(decoratorOptions);
    };
}

/**
 * Text type decorator for string properties.
 *
 * This decorator can only be applied to properties of type `string` and provides
 * validation capabilities through class-validator decorators. It also stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation.
 * * @example
 * ```typescript
 * class User {
 * @Text({ minLength: 2, maxLength: 50 })
 * name: string;
 * * @Text({ regex: /^[A-Z]+$/, regexMessage: 'Must be uppercase letters only' })
 * code: string;
 * }
 * ```
 * * @param options - Configuration options for text validation and behavior
 * @param options.minLength - Minimum allowed length for the string value
 * @param options.maxLength - Maximum allowed length for the string value  
 * @param options.regex - Regular expression pattern to validate the string against
 * @param options.regexMessage - Error message to display when regex validation fails (required when regex is provided)
 * * @returns A property decorator function that applies validation and stores metadata
 * * @throws {Error} When applied to non-string properties
 * @throws {Error} When regex is provided without regexMessage
 * * @remarks
 * - All validators are optional and only execute when the value is present (not null, undefined, or empty string)
 * - This allows the decorator to work alongside other validation decorators like @Required
 * - Metadata is stored under 'field:type' (always 'text') and 'field:type:options' keys
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Text(options?: TextOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: TextKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateStringType(proto, propName);
        storeTextMetadata(proto, propName, options);

        // Use custom validators that skip validation for empty values
        if (options?.minLength !== undefined) {
            MinLengthIfNotEmpty(options.minLength)(target as any, propName);
        }

        if (options?.maxLength !== undefined) {
            MaxLengthIfNotEmpty(options.maxLength)(target as any, propName);
        }
        
        if (options?.regex) {
            if (!options.regexMessage) {
                throw new Error(`@Text on '${propName}' requires 'regexMessage' when 'regex' is provided`);
            }
            MatchesIfNotEmpty(options.regex, options.regexMessage)(target as any, propName);
        }
    };
}

/**
 * Email type decorator.
 * - Must be used on `string` fields.
 * - Internally uses `Text` with a reasonable email regex.
 * - No options.
 */
export function Email() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: EmailKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        Reflect.defineMetadata('field:logicalType', 'email', target as unknown as Object, propName);
        
        // Use custom email validator that skips validation for empty strings
        IsEmailIfNotEmpty()(target as any, propName);
    };
}

/**
 * HTML type decorator.
 * - Must be used on `string` fields.
 * - Currently identical to `Text()` without extra options.
 */
export function HTML() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: HtmlKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        Reflect.defineMetadata('field:logicalType', 'html', target as unknown as Object, propName);
        Text()(target as any, propName as any);
    };
}
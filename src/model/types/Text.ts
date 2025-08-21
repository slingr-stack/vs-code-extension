import 'reflect-metadata';
import { registerDecorator } from 'class-validator';

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
 * @param proto - The prototype object
 * @param propertyKey - The property name
 * @throws {Error} When the property is not of string type
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
 * Creates a helper function to add optional validators that only run when value is present.
 * @param proto - The prototype object
 * @param propName - The property name
 * @returns A function to add optional validators
 */
function createOptionalValidatorAdder(proto: Object, propName: string) {
    return (
        name: string,
        validate: (value: unknown) => boolean,
        defaultMessage: string
    ) => {
        registerDecorator({
            name,
            target: (proto as any).constructor,
            propertyName: propName,
            validator: {
                validate(value: unknown) {
                    if (value === undefined || value === null || value === '') return true; // skip when empty
                    return validate(value);
                },
                defaultMessage() {
                    return defaultMessage;
                },
            },
        });
    };
}

/**
 * Applies validation rules based on the provided text options.
 * @param addOptionalValidator - Function to add optional validators
 * @param propName - The property name for error messages
 * @param options - Text validation options
 */
function applyTextValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options?: TextOptions
): void {
    // Type check
    addOptionalValidator('isString', (v) => typeof v === 'string', `${propName} must be a string`);

    // Min length validation
    if (typeof options?.minLength === 'number') {
        const min = options.minLength;
        addOptionalValidator(
            'minLength',
            (v) => typeof v === 'string' && v.length >= min,
            `${propName} must be longer than or equal to ${min} characters`
        );
    }

    // Max length validation
    if (typeof options?.maxLength === 'number') {
        const max = options.maxLength;
        addOptionalValidator(
            'maxLength',
            (v) => typeof v === 'string' && v.length <= max,
            `${propName} must be shorter than or equal to ${max} characters`
        );
    }

    // Regex validation
    if (options?.regex) {
        if (!options.regexMessage) {
            throw new Error(`@Text on '${propName}' requires 'regexMessage' when 'regex' is provided`);
        }
        const rx = options.regex;
        const message = options.regexMessage;
        addOptionalValidator('matches', (v) => typeof v === 'string' && rx.test(v), message);
    }
}

/**
 * Text type decorator for string properties.
 * 
 * This decorator can only be applied to properties of type `string` and provides
 * validation capabilities through class-validator decorators. It also stores
 * metadata that can be consumed by other layers such as database mapping or
 * documentation generation.
 * 
 * @example
 * ```typescript
 * class User {
 *   @Text({ minLength: 2, maxLength: 50 })
 *   name: string;
 * 
 *   @Text({ regex: /^[A-Z]+$/, regexMessage: 'Must be uppercase letters only' })
 *   code: string;
 * }
 * ```
 * 
 * @param options - Configuration options for text validation and behavior
 * @param options.minLength - Minimum allowed length for the string value
 * @param options.maxLength - Maximum allowed length for the string value  
 * @param options.regex - Regular expression pattern to validate the string against
 * @param options.regexMessage - Error message to display when regex validation fails (required when regex is provided)
 * 
 * @returns A property decorator function that applies validation and stores metadata
 * 
 * @throws {Error} When applied to non-string properties
 * @throws {Error} When regex is provided without regexMessage
 * 
 * @remarks
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

        // Validate that the property is of string type
        validateStringType(proto, propName);

        // Store metadata for potential consumers
        storeTextMetadata(proto, propName, options);

        // Create validator helper and apply validations
        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyTextValidations(addOptionalValidator, propName, options);
    };
}

/**
 * Email type decorator.
 * - Must be used on `string` fields.
 * - Internally uses `Text` with a reasonable email regex.
 * - No options.
 */
export function Email() {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: EmailKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        // Mark logical type for potential consumers
        Reflect.defineMetadata('field:logicalType', 'email', target as unknown as Object, propName);
        // Delegate to Text with regex
        Text({ regex: EMAIL_REGEX, regexMessage: 'must be a valid email' })(target as any, propName as any);
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

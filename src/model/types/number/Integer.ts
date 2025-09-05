import 'reflect-metadata';
import { registerDecorator } from 'class-validator';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';

/**
 * Options for the Integer decorator.
 */
export interface IntegerOptions {
    /** The minimum allowed value. Optional. */
    min?: number;
    /** The maximum allowed value. Optional. */
    max?: number;
    /** Boolean indicating the value must be positive (> 0). Optional. */
    positive?: boolean;
    /** Boolean indicating the value must be negative (< 0). Optional. */
    negative?: boolean;
}

/**
 * A type-safe key for the Integer decorator.
 * Ensures that the decorator is only applied to properties of type 'number'.
 */
type IntegerKey<T, K extends keyof T & string> = T[K] extends number
    ? K
    : `Integer: requires number field`;

/**
 * Validates that a property is of number type at runtime.
 */
function validateIntegerType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== Number && designType?.name !== 'Number') {
        throw new Error(`@Integer can only be applied to 'number' properties, but it was used on '${propertyKey}'.`);
    }
}

/**
 * Stores metadata for the integer field.
 */
function storeIntegerMetadata(proto: Object, propName: string, options?: IntegerOptions): void {
    Reflect.defineMetadata('field:type', 'integer', proto, propName);
    if (options) {
        Reflect.defineMetadata('field:type:options', options, proto, propName);
    }
}

/**
 * Creates a helper function to add optional validators.
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
                    if (value === undefined || value === null) return true;
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
 * Applies validation rules based on the provided integer options.
 */
function applyIntegerValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options?: IntegerOptions
): void {
    // Basic type check
    addOptionalValidator('isNumber', (v) => typeof v === 'number', `${propName} must be a number`);
    addOptionalValidator('isInteger', (v) => Number.isInteger(v), `${propName} must be an integer`);

    if (typeof options?.min === 'number') {
        const min = options.min;
        addOptionalValidator(
            'min',
            (v) => typeof v === 'number' && v >= min,
            `${propName} must not be less than ${min}`
        );
    }

    if (typeof options?.max === 'number') {
        const max = options.max;
        addOptionalValidator(
            'max',
            (v) => typeof v === 'number' && v <= max,
            `${propName} must not be greater than ${max}`
        );
    }

    if (options?.positive === true) {
        addOptionalValidator(
            'isPositive',
            (v) => typeof v === 'number' && v > 0,
            `${propName} must be a positive number`
        );
    }

    if (options?.negative === true) {
        addOptionalValidator(
            'isNegative',
            (v) => typeof v === 'number' && v < 0,
            `${propName} must be a negative number`
        );
    }
}

/**
 * Integer type decorator for number properties that must be whole numbers.
 *
 * @param options - Configuration options for integer validation.
 */
export function Integer(options?: IntegerOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: IntegerKey<T, K>
    ) {
        const propName = propertyKey as string;
        const proto = target as Object;

        validateIntegerType(proto, propName);
        storeIntegerMetadata(proto, propName, options);

        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyIntegerValidations(addOptionalValidator, propName, options);
    };
}

/**
 * Configuration object for Integer field TypeORM mapping.
 */
export const IntegerTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: IntegerOptions, nullable: boolean = true): any {
        return {
            type: 'int',
            nullable: nullable
        };
    },

    getArrayElementColumnConfig(fieldOptions?: IntegerOptions): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the integer type configuration
FieldTypeRegistry.register('integer', IntegerTypeConfig);
import 'reflect-metadata';
import { registerDecorator } from 'class-validator';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';
import { FIELD_TYPE, FIELD_TYPE_OPTIONS, FIELD_TYPE_NUMBER, DESIGN_TYPE } from '../../metadata/MetadataKeys';

/**
 * Options for the Number decorator.
 */
export interface NumberOptions {
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
 * A type-safe key for the Number decorator.
 * Ensures that the decorator is only applied to properties of type 'number'.
 * Provides a clear error message in IntelliSense if used on a different type.
 */
type NumberKey<T, K extends keyof T & string> = T[K] extends number
    ? K
    : `Number: requires number field`;

/**
 * Validates that a property is of number type at runtime.
 * @param proto - The prototype of the class.
 * @param propertyKey - The name of the property.
 * @throws {Error} When the property is not of type 'number'.
 */
function validateNumberType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata(DESIGN_TYPE, proto, propertyKey);
    if (designType !== Number && designType?.name !== 'Number') {
        throw new Error(`@Number can only be applied to 'number' properties, but it was used on '${propertyKey}'.`);
    }
}

/**
 * Stores metadata for the number field that can be consumed by other layers.
 * @param proto - The prototype of the class.
 * @param propName - The name of the property.
 * @param options - The NumberOptions to store.
 */
function storeNumberMetadata(proto: Object, propName: string, options?: NumberOptions): void {
    Reflect.defineMetadata(FIELD_TYPE, FIELD_TYPE_NUMBER, proto, propName);
    if (options) {
        Reflect.defineMetadata(FIELD_TYPE_OPTIONS, options, proto, propName);
    }
}

/**
 * Creates a helper function to add optional validators that only run when a value is present.
 * @param proto - The prototype of the class.
 * @param propName - The name of the property.
 * @returns A function to add optional validators.
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
                    // Skip validation for empty values (null, undefined).
                    // This allows @Number to work alongside @Required.
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
 * Applies validation rules based on the provided number options.
 * @param addOptionalValidator - Function to add optional validators.
 * @param propName - The property name for error messages.
 * @param options - The NumberOptions for validation.
 */
function applyNumberValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options?: NumberOptions
): void {
    // Basic type check
    addOptionalValidator('isNumber', (v) => typeof v === 'number', `${propName} must be a number`);

    // Min value validation
    if (typeof options?.min === 'number') {
        const min = options.min;
        addOptionalValidator(
            'min',
            (v) => typeof v === 'number' && v >= min,
            `${propName} must not be less than ${min}`
        );
    }

    // Max value validation
    if (typeof options?.max === 'number') {
        const max = options.max;
        addOptionalValidator(
            'max',
            (v) => typeof v === 'number' && v <= max,
            `${propName} must not be greater than ${max}`
        );
    }

    // Positive value validation
    if (options?.positive === true) {
        addOptionalValidator(
            'isPositive',
            (v) => typeof v === 'number' && v > 0,
            `${propName} must be a positive number`
        );
    }

    // Negative value validation
    if (options?.negative === true) {
        addOptionalValidator(
            'isNegative',
            (v) => typeof v === 'number' && v < 0,
            `${propName} must be a negative number`
        );
    }
}

/**
 * Number type decorator for number properties.
 *
 * This decorator can only be applied to properties of type `number` and provides
 * validation capabilities. It also stores metadata that can be consumed by other
 * layers such as database mapping or documentation generation.
 *
 * @example
 * ```typescript
 * class Product {
 * @Number({ min: 0, max: 100 })
 * stock: number;
 *
 * @Number({ positive: true })
 * price: number;
 * }
 * ```
 *
 * @param options - Configuration options for number validation.
 * @returns A property decorator function that applies validation and stores metadata.
 * @throws {Error} When applied to non-number properties.
 */
export function Number(options?: NumberOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: NumberKey<T, K>
    ) {
        const propName = propertyKey as string;
        const proto = target as Object;

        // 1. Validate that the property is of number type at runtime
        validateNumberType(proto, propName);

        // 2. Store metadata for potential consumers
        storeNumberMetadata(proto, propName, options);

        // 3. Create validator helper and apply all specified validations
        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyNumberValidations(addOptionalValidator, propName, options);
    };
}

/**
 * Configuration object for Number field TypeORM mapping.
 */
export const NumberTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: NumberOptions, nullable: boolean = true): any {
        return {
            type: 'decimal',
            precision: 10,
            scale: 2,
            nullable: nullable
        };
    },

    getArrayElementColumnConfig(fieldOptions?: NumberOptions): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the number type configuration
FieldTypeRegistry.register('number', NumberTypeConfig);

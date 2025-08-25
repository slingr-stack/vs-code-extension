import 'reflect-metadata';
import { registerDecorator } from 'class-validator';
import { Money as BigintMoney } from 'bigint-money';
import RoundingMode from 'bigint-money'
/**
 * Options for the Money decorator.
 */
export interface MoneyOptions {
    /** The exact number of decimals the value must have. */
    decimals: number;
    /** The rounding mode to apply when converting from a string with more decimals. */
    roundingType?: keyof typeof RoundingMode;
    /** Boolean indicating the value must be positive (> 0). Optional. */
    positive?: boolean;
}

/**
 * A type-safe key to ensure the decorator is applied to a Money property.
 */
type MoneyKey<T, K extends keyof T & string> = T[K] extends BigintMoney
    ? K
    : `Money: requires a property of type 'Money'`;

/**
 * Validates that a property is of type Money at runtime.
 */
function validateMoneyType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    // The reflected type for a class is its constructor function.
    if (designType !== BigintMoney) {
        throw new Error(`@Money can only be applied to properties of type 'Money', but it was used on '${propertyKey}'.`);
    }
}

/**
 * Stores metadata for the money field.
 */
function storeMoneyMetadata(proto: Object, propName: string, options: MoneyOptions): void {
    Reflect.defineMetadata('field:type', 'money', proto, propName);
    Reflect.defineMetadata('field:type:options', options, proto, propName);
}

/**
 * Creates a helper to register custom validators that only run when a value is present.
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
                    if (value === undefined || value === null) return true; // Skip if empty
                    return validate(value);
                },
                defaultMessage() { return defaultMessage; },
            },
        });
    };
}

/**
 * Applies all validation rules based on the MoneyOptions.
 */
function applyMoneyValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options: MoneyOptions
): void {
    // Check if the value is a valid Money object
    addOptionalValidator('isMoney', (v) => v instanceof BigintMoney, `${propName} must be a Money object`);

    // Check if the number of decimals is correct
    addOptionalValidator(
        'hasCorrectDecimals',
        (v) => v instanceof BigintMoney && v.getDecimals() === options.decimals,
        `${propName} must have exactly ${options.decimals} decimals`
    );

    // Check if the value is positive, if required
    if (options.positive) {
        addOptionalValidator(
            'isPositive',
            (v) => v instanceof BigintMoney && v.isPositive(),
            `${propName} must be a positive amount`
        );
    }
}

/**
 * Money type decorator for properties of type Money.
 *
 * Provides validation for decimals and positivity, and enables automatic conversion
 * from strings/numbers in the `fromJSON` method of BaseModel.
 *
 * @param options Configuration options for money validation and rounding.
 */
export function Money(options: MoneyOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: MoneyKey<T, K>
    ) {
        const propName = propertyKey as string;
        const proto = target as Object;

        validateMoneyType(proto, propName);
        storeMoneyMetadata(proto, propName, options);

        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyMoneyValidations(addOptionalValidator, propName, options);
    };
}

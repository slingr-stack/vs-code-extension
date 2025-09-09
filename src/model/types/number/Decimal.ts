import 'reflect-metadata';
import { registerDecorator } from 'class-validator';
import number, { FinancialNumber, RoundingStrategy } from 'financial-number';
import { Expose, Transform } from 'class-transformer';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';
import { createFinancialNumberTransformer } from '../../../datasources/typeorm/ValueTransformers';

/**
 * Type alias for the `FinancialNumber` object.
 * This should be used for all monetary or high-precision decimal values.
 */
export type Decimal = FinancialNumber;

/**
 * Configuration options for the @Decimal decorator.
 * Note: financial-number primarily supports 'trim' (truncate) and 'round' (round half up).
 */
export interface DecimalOptions {
    /** The number of decimal places to maintain. Required. */
    decimals: number;
    /** Defines the rounding strategy when parsing data. */
    roundingType: 'truncate' | 'roundHalfToEven';
    /** The minimum allowed value as a string (e.g., "10.50"). Optional. */
    min?: string;
    /** The maximum allowed value as a string (e.g., "100.00"). Optional. */
    max?: string;
    /** If true, the value must be positive (> 0). Optional. */
    positive?: boolean;
    /** If true, the value must be negative (< 0). Optional. */
    negative?: boolean;
}

/**
 * Maps the decorator's roundingType string to the financial-number rounding strategy.
 * @private
 */
function getRoundingStrategy(roundingType: DecimalOptions['roundingType']): RoundingStrategy {
    switch (roundingType) {
        case 'truncate':
            return number.trim;
        case 'roundHalfToEven':
            return number.round;
        default:
            return number.trim; // Default to truncate
    }
}

type DecimalKey<T, K extends keyof T & string> = T[K] extends Decimal | undefined | null ? K : `Decimal: requires a property of type 'Decimal'`;

function validateDecimalType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType && designType !== Object && designType.name !== 'Decimal' && designType.name !== 'Object') {
        throw new Error(`@Decimal can only be applied to properties of type 'Decimal', but it was used on '${propertyKey}' which is of type '${designType?.name}'.`);
    }
}

function storeDecimalMetadata(proto: Object, propName: string, options: DecimalOptions): void {
    Reflect.defineMetadata('field:type', 'decimal', proto, propName);
    Reflect.defineMetadata('field:type:options', options, proto, propName);
}

function createOptionalValidatorAdder(proto: Object, propName: string) {
    return (name: string, validate: (value: unknown) => boolean, defaultMessage: string) => {
        registerDecorator({
            name,
            target: (proto as any).constructor,
            propertyName: propName,
            validator: {
                validate(value: unknown) {
                    if (value === undefined || value === null) return true;
                    return validate(value);
                },
                defaultMessage() { return defaultMessage; },
            },
        });
    };
}

function applyDecimalValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options: DecimalOptions
): void {
    addOptionalValidator('isDecimal', (value: any) => {
        if (!value || typeof value.toString !== 'function' || typeof value.plus !== 'function') {
            return false;
        }
        const stringValue = value.toString();
        const parts = stringValue.split('.');
        const numDecimalPlaces = parts.length === 2 ? parts[1].length : 0;
        return numDecimalPlaces === options.decimals;
    }, `${propName} must have exactly ${options.decimals} decimal places.`);

    if (options.positive) {
        addOptionalValidator('isPositive', (value: unknown) => {
            if (typeof value === 'object' && value !== null && 'gt' in value && typeof (value as FinancialNumber).gt === 'function') {
                return (value as FinancialNumber).gt('0');
            }
            return false;
        }, `${propName} must be a positive amount`);
    }
    if (options.negative) {
        addOptionalValidator('isNegative', (value: unknown) => {
            if (typeof value === 'object' && value !== null && 'lt' in value && typeof (value as FinancialNumber).lt === 'function') {
                return (value as FinancialNumber).lt('0');
            }
            return false;
        }, `${propName} must be a negative amount`);
    }
    if (options.min) {
        addOptionalValidator('min', (value: unknown) => {
            if (typeof value === 'object' && value !== null && 'gte' in value && typeof (value as FinancialNumber).gte === 'function') {
                return (value as FinancialNumber).gte(options.min!);
            }
            return false;
        }, `${propName} must not be less than ${options.min}`);
    }
    if (options.max) {
        addOptionalValidator('max', (value: unknown) => {
            if (typeof value === 'object' && value !== null && 'lte' in value && typeof (value as FinancialNumber).lte === 'function') {
                return (value as FinancialNumber).lte(options.max!);
            }
            return false;
        }, `${propName} must not be greater than ${options.max}`);
    }
}

export function Decimal(options: DecimalOptions) {
    return function <T extends Object, K extends keyof T & string>(target: T, propertyKey: DecimalKey<T, K>) {
        const propName = propertyKey as string;
        const proto = target as Object;

        validateDecimalType(proto, propName);
        storeDecimalMetadata(proto, propName, options);


        // Serialization (toJSON)
        Transform(({ value }) => {
            if (value && typeof value.toString === 'function') {
                const roundingStrategy = getRoundingStrategy(options.roundingType);
                return value.toString(options.decimals, roundingStrategy);
            }
            return value;
        }, { toPlainOnly: true })(target, propertyKey);


        // Deserialization (fromJSON)
        Transform(({ value }) => {
            if (typeof value === 'string' || typeof value === 'number') {
                try {
                    const roundingStrategy = getRoundingStrategy(options.roundingType);
                    const formattedValue = number(String(value)).toString(options.decimals, roundingStrategy);
                    return number(formattedValue);
                } catch {
                    return value;
                }
            }
            return value;
        }, { toClassOnly: true })(target, propertyKey);

        // Expose the property for serialization/deserialization
        Expose()(target, propertyKey);

        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyDecimalValidations(addOptionalValidator, propName, options);
    };
}

/**
 * Configuration object for Decimal field TypeORM mapping.
 */
export const DecimalTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: DecimalOptions, nullable: boolean = true): any {
        const transformer = createFinancialNumberTransformer(
            fieldOptions?.decimals || 2, 
            fieldOptions?.roundingType || 'truncate'
        );
        
        let precision = 10;
        if (fieldOptions?.max) {
            // Remove decimal point and count total digits
            const maxDigits = fieldOptions.max.replace('.', '').length;
            precision = maxDigits;
        }
        
        return {
            type: 'decimal',
            precision: precision,
            scale: fieldOptions?.decimals || 2,
            nullable: nullable,
            transformer: transformer
        };
    },

    getArrayElementColumnConfig(fieldOptions?: DecimalOptions): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the decimal type configuration
FieldTypeRegistry.register('decimal', DecimalTypeConfig);
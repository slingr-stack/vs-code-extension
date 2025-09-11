import 'reflect-metadata';
import {
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
    ValidateNested,
    IsOptional
} from 'class-validator';
import { Type, Transform, TransformationType, Expose } from 'class-transformer';
import { dateToISO8601, dateFromJSON } from '../utils';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';

/**
 * Options for the DateTimeRange decorator.
 */
export interface DateTimeRangeOptions {
    /** If set to true, the 'from' field can be empty (open start). */
    from?: boolean;
    /** If set to true, the 'to' field can be empty (open end). */
    to?: boolean;
}

/**
 * DateTimeRange class that represents a range between two dates.
 * Used as a nested object in models that need date ranges.
 */
export class DateTimeRangeType {
    @IsOptional()
    @Expose()
    @Transform(({ value, type }) => {
        if (type === TransformationType.CLASS_TO_PLAIN) {
            // Serialization: Date -> ISO 8601 string
            return dateToISO8601(value);
        } else if (type === TransformationType.PLAIN_TO_CLASS) {
            // Deserialization: string/number -> Date
            return dateFromJSON(value);
        }
        return value;
    })
    from?: Date;

    @IsOptional()
    @Expose()
    @Transform(({ value, type }) => {
        if (type === TransformationType.CLASS_TO_PLAIN) {
            // Serialization: Date -> ISO 8601 string
            return dateToISO8601(value);
        } else if (type === TransformationType.PLAIN_TO_CLASS) {
            // Deserialization: string/number -> Date
            return dateFromJSON(value);
        }
        return value;
    })
    to?: Date;
}

// Custom key types for clearer IntelliSense errors
type DateTimeRangeKey<T, K extends keyof T & string> = T[K] extends DateTimeRangeType | DateTimeRangeType[] | undefined
    ? K
    : `DateTimeRange: requires DateTimeRange field`;

/**
 * Validates that a property is of DateTimeRange type at runtime.
 */
function validateDateTimeRangeType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    // Be more flexible with type checking since TypeScript may not preserve exact type info
    // We accept DateTimeRangeType, Object, or undefined types
    if (
        designType &&
        designType !== DateTimeRangeType &&
        designType !== Object &&
        designType !== Array
    ) {
        throw new Error(`@DateTimeRange can only be applied to 'DateTimeRange' or 'DateTimeRange[]' properties: ${propertyKey}`);
    }
}

/**
 * Stores metadata for the datetime range field that can be consumed by other layers.
 */
function storeDateTimeRangeMetadata(proto: Object, propName: string, options?: DateTimeRangeOptions): void {
    const designType = Reflect.getMetadata('design:type', proto, propName);
    
    if (designType === Array) {
        // Handle DateTimeRange array case
        Reflect.defineMetadata('field:type', 'array:datetimerange', proto, propName);
    } else {
        // Handle single DateTimeRange case
        Reflect.defineMetadata('field:type', 'datetimerange', proto, propName);
    }
    
    if (options) {
        Reflect.defineMetadata('field:type:options', options, proto, propName);
    }
}

/**
 * Helper function to validate a single DateTimeRange
 */
function validateSingleRange(value: any, args: ValidationArguments): boolean {
    if (value == null) {
        return true; // Allow null/undefined values in arrays
    }

    if (!(value instanceof DateTimeRangeType)) {
        return false;
    }

    const rangeOptions = args.constraints[0] as DateTimeRangeOptions | undefined;

    // Check if from is required (when openStart is false or undefined)
    if (!rangeOptions?.from && !value.from) {
        return false;
    }

    // Check if to is required (when openEnd is false or undefined)
    if (!rangeOptions?.to && !value.to) {
        return false;
    }

    // If both dates are present, validate that from is before to
    if (value.from && value.to) {
        if (value.from >= value.to) {
            return false;
        }
    }

    return true;
}

/**
 * Custom DateTimeRange validator that validates range constraints
 */
function IsValidDateTimeRange(options?: DateTimeRangeOptions, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isValidDateTimeRange',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [options],
            options: validationOptions || {},
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value == null) {
                        return true; // Allow null/undefined values
                    }

                    // Handle arrays of DateTimeRangeType
                    if (Array.isArray(value)) {
                        return value.every(item => validateSingleRange(item, args));
                    }

                    // Handle single DateTimeRangeType
                    return validateSingleRange(value, args);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid date range where 'from' is before 'to'`;
                }
            },
        });
    };
}

/**
 * DateTimeRange type decorator for DateTimeRange properties.
 *
 * This decorator can only be applied to properties of type `DateTimeRange` and provides
 * validation for date ranges with optional open start/end capabilities.
 *
 * @example
 * ```typescript
 * class Reservation {
 *   @DateTimeRange({ openStart: false, openEnd: false })
 *   dateRange: DateTimeRange;
 * 
 *   @DateTimeRange({ openStart: true, openEnd: true })
 *   flexibleRange: DateTimeRange;
 * }
 * ```
 *
 * @param options - Configuration options for datetime range validation
 * @param options.openStart - If true, 'from' field can be empty (open start)
 * @param options.openEnd - If true, 'to' field can be empty (open end)
 *
 * @returns A property decorator function that applies validation and stores metadata
 *
 * @throws {Error} When applied to non-DateTimeRange properties
 *
 * @remarks
 * - Validates that 'from' date is before 'to' date when both are present
 * - Supports open-ended ranges when openStart or openEnd options are enabled
 * - Metadata is stored under 'field:type' ('datetimerange') and 'field:type:options' keys
 */
export function DateTimeRange(options?: DateTimeRangeOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: DateTimeRangeKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateDateTimeRangeType(proto, propName);
        storeDateTimeRangeMetadata(proto, propName, options);

        const designType = Reflect.getMetadata('design:type', proto, propName);
        
        if (designType === Array) {
            // Handle DateTimeRange array case
            const { IsArray } = require('class-validator');
            
            // Apply array validation
            IsArray()(target as any, propName);
            
            // Apply nested validation for each array element
            ValidateNested({ each: true })(target as any, propName);
            Type(() => DateTimeRangeType)(target as any, propName);
            
            // Apply custom range validation for each array element
            IsValidDateTimeRange(options)(target as any, propName);
        } else {
            // Handle single DateTimeRange case
            // Apply nested validation for DateTimeRange
            ValidateNested()(target as any, propName);
            Type(() => DateTimeRangeType)(target as any, propName);

            // Apply custom range validation
            IsValidDateTimeRange(options)(target as any, propName);
        }
    };
}

/**
 * DateTimeRange field configuration for TypeORM persistence.
 * Uses JSON column type with custom transformer to store DateTimeRange objects.
 */
export const DateTimeRangeTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: DateTimeRangeOptions, nullable: boolean = true): any {
        const { dateTimeRangeTransformer } = require('../../../datasources/typeorm/ValueTransformers');
        return {
            type: 'text',
            nullable: nullable,
            transformer: dateTimeRangeTransformer
        };
    },

    getArrayElementColumnConfig(fieldOptions?: DateTimeRangeOptions): any {
        const { dateTimeRangeTransformer } = require('../../../datasources/typeorm/ValueTransformers');
        return {
            type: 'text', 
            nullable: false,
            transformer: dateTimeRangeTransformer
        };
    }
};

// Register the datetime range type configuration
FieldTypeRegistry.register('datetimerange', DateTimeRangeTypeConfig);

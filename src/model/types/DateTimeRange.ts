import 'reflect-metadata';
import {
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
    ValidateNested,
    IsOptional
} from 'class-validator';
import { Type, Transform, TransformationType, Expose } from 'class-transformer';
import { dateToISO8601, dateFromJSON } from './utils';

/**
 * Options for the DateTimeRange decorator.
 */
export interface DateTimeRangeOptions {
    /** If set to true, the 'from' field can be empty (open start). */
    openStart?: boolean;
    /** If set to true, the 'to' field can be empty (open end). */
    openEnd?: boolean;
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
type DateTimeRangeKey<T, K extends keyof T & string> = T[K] extends DateTimeRangeType | undefined
    ? K
    : `DateTimeRange: requires DateTimeRange field`;

/**
 * Validates that a property is of DateTimeRange type at runtime.
 */
function validateDateTimeRangeType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== DateTimeRangeType) {
        throw new Error(`@DateTimeRange can only be applied to 'DateTimeRange' properties: ${propertyKey}`);
    }
}

/**
 * Stores metadata for the datetime range field that can be consumed by other layers.
 */
function storeDateTimeRangeMetadata(proto: Object, propName: string, options?: DateTimeRangeOptions): void {
    Reflect.defineMetadata('field:type', 'datetimerange', proto, propName);
    if (options) {
        Reflect.defineMetadata('field:type:options', options, proto, propName);
    }
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

                    if (!(value instanceof DateTimeRangeType)) {
                        return false;
                    }

                    const rangeOptions = args.constraints[0] as DateTimeRangeOptions | undefined;

                    // Check if from is required (when openStart is false or undefined)
                    if (!rangeOptions?.openStart && !value.from) {
                        return false;
                    }

                    // Check if to is required (when openEnd is false or undefined)
                    if (!rangeOptions?.openEnd && !value.to) {
                        return false;
                    }

                    // If both dates are present, validate that from is before to
                    if (value.from && value.to) {
                        if (value.from >= value.to) {
                            return false;
                        }
                    }

                    return true;
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

        // Apply nested validation for DateTimeRange
        ValidateNested()(target as any, propName);
        Type(() => DateTimeRangeType)(target as any, propName);

        // Apply custom range validation
        IsValidDateTimeRange(options)(target as any, propName);
    };
}

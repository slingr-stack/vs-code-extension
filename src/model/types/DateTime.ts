import 'reflect-metadata';
import {
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
    ValidateNested,
    IsOptional} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Options for the DateTime decorator.
 */
export interface DateTimeOptions {
    /** Minimum allowed date (ISO 8601 string or Date object). */
    min?: Date | string;
    /** Maximum allowed date (ISO 8601 string or Date object). */
    max?: Date | string;
}

/**
 * Options for the DateTimeRange decorator.
 */
export interface DateTimeRangeOptions {
    /** If set to true, the 'from' field can be empty (open start). */
    openStart?: boolean;
    /** If set to true, the 'to' field can be empty (open end). */
    openEnd?: boolean;
}

// Custom key types for clearer IntelliSense errors
type DateTimeKey<T, K extends keyof T & string> = T[K] extends Date | undefined
    ? K
    : `DateTime: requires Date field`;

type DateTimeRangeKey<T, K extends keyof T & string> = T[K] extends DateTimeRangeClass | undefined
    ? K
    : `DateTimeRange: requires DateTimeRange field`;

/**
 * Validates that a property is of Date type at runtime.
 */
function validateDateType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== Date) {
        throw new Error(`@DateTime can only be applied to 'Date' properties: ${propertyKey}`);
    }
}

/**
 * Validates that a property is of DateTimeRange type at runtime.
 */
function validateDateTimeRangeType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== DateTimeRangeClass) {
        throw new Error(`@DateTimeRange can only be applied to 'DateTimeRange' properties: ${propertyKey}`);
    }
}

/**
 * Stores metadata for the datetime field that can be consumed by other layers.
 */
function storeDateTimeMetadata(proto: Object, propName: string, options?: DateTimeOptions): void {
    Reflect.defineMetadata('field:type', 'datetime', proto, propName);
    if (options) {
        Reflect.defineMetadata('field:type:options', options, proto, propName);
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
 * Custom Date validator that only validates non-null values and supports min/max dates
 */
function IsDateWithRange(min?: Date | string, max?: Date | string, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isDateWithRange',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [min, max],
            options: validationOptions || {},
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (value == null) {
                        return true; // Allow null/undefined values - required validation handles this
                    }

                    // Check if it's a valid date
                    const date = value instanceof Date ? value : new Date(value);
                    if (isNaN(date.getTime())) {
                        return false;
                    }

                    // Check min constraint
                    if (args.constraints[0]) {
                        const minDate = args.constraints[0] instanceof Date ? 
                            args.constraints[0] : new Date(args.constraints[0]);
                        if (date < minDate) {
                            return false;
                        }
                    }

                    // Check max constraint
                    if (args.constraints[1]) {
                        const maxDate = args.constraints[1] instanceof Date ? 
                            args.constraints[1] : new Date(args.constraints[1]);
                        if (date > maxDate) {
                            return false;
                        }
                    }

                    return true;
                },
                defaultMessage(args: ValidationArguments) {
                    const [min, max] = args.constraints;
                    if (min && max) {
                        return `${args.property} must be a valid date between ${min} and ${max}`;
                    } else if (min) {
                        return `${args.property} must be a valid date after ${min}`;
                    } else if (max) {
                        return `${args.property} must be a valid date before ${max}`;
                    }
                    return `${args.property} must be a valid date`;
                }
            },
        });
    };
}

/**
 * DateTime type decorator for Date properties.
 *
 * This decorator can only be applied to properties of type `Date` and provides
 * validation capabilities for dates with optional min/max constraints.
 * It uses ISO 8601 format for JSON serialization/deserialization.
 *
 * @example
 * ```typescript
 * class Event {
 *   @DateTime({ min: new Date('2024-01-01'), max: new Date('2024-12-31') })
 *   eventDate: Date;
 * 
 *   @DateTime()
 *   createdAt: Date;
 * }
 * ```
 *
 * @param options - Configuration options for datetime validation
 * @param options.min - Minimum allowed date (ISO 8601 string or Date object)
 * @param options.max - Maximum allowed date (ISO 8601 string or Date object)
 *
 * @returns A property decorator function that applies validation and stores metadata
 *
 * @throws {Error} When applied to non-Date properties
 *
 * @remarks
 * - Validators are optional and only execute when the value is present (not null or undefined)
 * - This allows the decorator to work alongside other validation decorators like @Required
 * - Metadata is stored under 'field:type' ('datetime') and 'field:type:options' keys
 * - Uses ISO 8601 format for consistent date handling
 */
export function DateTime(options?: DateTimeOptions) {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: DateTimeKey<T, K>
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateDateType(proto, propName);
        storeDateTimeMetadata(proto, propName, options);

        // Apply date validation with optional min/max constraints
        IsDateWithRange(options?.min, options?.max)(target as any, propName);

        // Add JSON transformation metadata for ISO 8601 handling
        Type(() => Date)(target as any, propName);
    };
}

/**
 * DateTimeRange class that represents a range between two dates.
 * Used as a nested object in models that need date ranges.
 */
export class DateTimeRangeClass {
    @IsOptional()
    @Type(() => Date)
    from?: Date;

    @IsOptional()
    @Type(() => Date)
    to?: Date;
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

                    if (!(value instanceof DateTimeRangeClass)) {
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
        Type(() => DateTimeRangeClass)(target as any, propName);

        // Apply custom range validation
        IsValidDateTimeRange(options)(target as any, propName);
    };
}

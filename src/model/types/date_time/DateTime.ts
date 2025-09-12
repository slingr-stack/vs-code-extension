import 'reflect-metadata';
import {
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
} from 'class-validator';
import { Transform, TransformationType } from 'class-transformer';
import { validateDateType, dateToISO8601, dateFromJSON } from '../utils';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';
import { FIELD_TYPE, FIELD_TYPE_OPTIONS, FIELD_TYPE_DATETIME } from '../../metadata/MetadataKeys';

/**
 * Options for the DateTime decorator.
 */
export interface DateTimeOptions {
    /** Minimum allowed date (ISO 8601 string or Date object). */
    min?: Date | string;
    /** Maximum allowed date (ISO 8601 string or Date object). */
    max?: Date | string;
}

// Custom key types for clearer IntelliSense errors
type DateTimeKey<T, K extends keyof T & string> = T[K] extends Date | undefined
    ? K
    : `DateTime: requires Date field`;

/**
 * Stores metadata for the datetime field that can be consumed by other layers.
 */
function storeDateTimeMetadata(proto: Object, propName: string, options?: DateTimeOptions): void {
    Reflect.defineMetadata(FIELD_TYPE, FIELD_TYPE_DATETIME, proto, propName);
    if (options) {
        Reflect.defineMetadata(FIELD_TYPE_OPTIONS, options, proto, propName);
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

        // Custom transformation for JSON serialization/deserialization
        Transform(({ value, type }) => {
            if (type === TransformationType.CLASS_TO_PLAIN) {
                // Serialization: Date -> ISO 8601 string
                return dateToISO8601(value);
            } else if (type === TransformationType.PLAIN_TO_CLASS) {
                // Deserialization: string/number -> Date
                return dateFromJSON(value);
            }
            return value;
        })(target as any, propName);
    };
}

/**
 * Configuration object for DateTime field TypeORM mapping.
 */
export const DateTimeTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: DateTimeOptions, nullable: boolean = true): any {
        return {
            type: 'datetime',
            nullable: nullable
        };
    },

    getArrayElementColumnConfig(fieldOptions?: DateTimeOptions): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the datetime type configuration
FieldTypeRegistry.register('datetime', DateTimeTypeConfig);
import 'reflect-metadata';
import { Transform, TransformationType } from 'class-transformer';
import { validateEnumType } from '../utils';
import { FieldTypeConfig, FieldTypeRegistry } from '../FieldTypeConfig';

/**
 * Choice type decorator.
 * - Must be used on enum fields.
 * - Handles serialization/deserialization of enum values.
 * - For now, there are no options for choice fields.
 */

/**
 * Choice type decorator for enum properties.
 *
 * This decorator can only be applied to properties of enum types and handles
 * the serialization and deserialization of enum values. It ensures that enum
 * values are properly converted to their string representation in JSON and
 * restored from JSON back to the appropriate enum value.
 *
 * @example
 * ```typescript
 * enum TaskStatus {
 *   ToDo = 'toDo',
 *   InProgress = 'inProgress',
 *   Done = 'done'
 * }
 * 
 * class Task extends BaseModel {
 *   @Field()
 *   @Choice()
 *   status: TaskStatus = TaskStatus.ToDo;
 * }
 * ```
 *
 * @returns A property decorator function that handles enum transformation and stores metadata
 *
 * @throws {Error} When applied to non-enum properties
 *
 * @remarks
 * - The decorator uses enum values (not keys) for JSON serialization
 * - Metadata is stored under 'field:type' key with value 'choice'
 * - The decorator uses reflection to verify the property type at runtime
 * - Supports any enum type, including string and numeric enums
 */
export function Choice() {
    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: K
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        validateEnumType(proto, propName);
        Reflect.defineMetadata('field:type', 'choice', proto, propName);

        // Custom transformation for JSON serialization/deserialization
        Transform(({ value, type }) => {
            if (type === TransformationType.CLASS_TO_PLAIN) {
                // Serialization: enum value -> enum value (already the correct string/number)
                return value;
            } else if (type === TransformationType.PLAIN_TO_CLASS) {
                // Deserialization: JSON value -> enum value
                // The value should already be the correct enum value since enums are 
                // typically stored as their actual values
                return value;
            }
            return value;
        })(target as any, propName);
    };
}

/**
 * Configuration object for Choice field TypeORM mapping.
 */
export const ChoiceTypeConfig: FieldTypeConfig = {
    getTypeORMColumnConfig(fieldOptions?: any, nullable: boolean = true): any {
        return {
            type: 'varchar',
            length: 50,
            nullable: nullable
        };
    },

    getArrayElementColumnConfig(fieldOptions?: any): any {
        return this.getTypeORMColumnConfig(fieldOptions, false);
    }
};

// Register the choice type configuration
FieldTypeRegistry.register('choice', ChoiceTypeConfig);

import { IsNotEmpty, ValidateIf } from 'class-validator';
import { Exclude, Expose, Transform } from 'class-transformer';
import { CustomValidate } from '../validators/CustomValidationConstraint';

/**
 * Custom validation function type for field validation.
 * 
 * @param value - The value of the field being validated
 * @param object - The entire object containing the field being validated
 * @returns Array of validation error objects, each containing a code and message. Return empty array if validation passes.
 * 
 * @example
 * ```typescript
 * const validateAge: CustomValidationFunction = (value, object) => {
 *   if (value < 0) {
 *     return [{ code: 'INVALID_AGE', message: 'Age cannot be negative' }];
 *   }
 *   return [];
 * };
 * ```
 */
export type ValidationIssue = { code: string; message: string };

type CustomValidationFunction<TValue, TObject> = (
  value: TValue,
  object: TObject
) => ValidationIssue[];

type CustomRequiredFunction<TObject> = (object: TObject) => boolean;

type CustomAvailableFunction<TObject> = (object: TObject) => boolean;

/**
 * Configuration options for the Field decorator.
 * 
 * This interface defines all available options that can be passed to the ``@Field`` decorator
 * to configure validation, documentation, and field behavior.
 */
export interface FieldOptions<TObject extends object = object, TValue = unknown> {
  /**
   * Specifies whether the field is required.
   * 
   * - `true`: Field is always required and cannot be empty
   * - `false`: Field is optional
   * - `CustomRequiredFunction`: Field requirement is determined dynamically based on the function's return value
   * 
   * @example
   * ```typescript
   * // Always required
   * @Field({ required: true })
   * name: string;
   * 
   * // Conditionally required
   * @Field({ required: (obj) => obj.isAdult })
   * guardianName: string;
   * ```
   */
  required?: boolean | CustomRequiredFunction<TObject>;

  /**
   * Documentation string for the field.
   * 
   * This string will be stored as metadata and can be used for generating
   * documentation, API schemas, or providing contextual help.
   * 
   * @example
   * ```typescript
   * // Simple documentation
   * @Field({ docs: 'The full name of the person' })
   * name: string;
   * ```
   */
  docs?: string;

  /**
   * Validation configuration for the field.
   * 
   * Can be either:
   * - A `PropertyDecorator` from class-validator (e.g., ``@IsEmail``, ``@Length``, etc.)
   * - A `CustomValidationFunction` that returns validation errors
   * 
   * @example
   * ```typescript
   * // Using class-validator decorator
   * Field({ validation: IsEmail() })
   * email: string;
   * 
   * // Using custom validation function
   * Field({ 
   *   validation: (value) => {
   *     if (value.length < 3) {
   *       return [{ code: 'TOO_SHORT', message: 'Name must be at least 3 characters' }];
   *     }
   *     return [];
   *   }
   * })
   * name: string;
   * ```
   */
  validation?: CustomValidationFunction<TValue, TObject>;

  /**
   * Indicates whether the field should be available for JSON serialization and deserialization.
   * 
   * When set to `false`, the field will be excluded from JSON conversion operations.
   * When set to `true` or not specified, the field will be included in JSON operations.
   * 
   * @default true
   * 
   * @example
   * ```typescript
   * // Field available for JSON operations (default behavior)
   * @Field({ available: true })
   * name: string;
   * 
   * // Field excluded from JSON operations
   * @Field({ available: false })
   * internalId: string;
   * ```
   */
  available?: boolean | CustomAvailableFunction<TObject>;
}

/**
 * Decorator for model fields that applies validation, documentation, and metadata based on provided options.
 *
 * - Adds documentation metadata if `docs` is present in options.
 * - Applies required validation using `IsNotEmpty` and optionally `ValidateIf` if `required` is a function.
 * - Applies custom validation if `validation` is provided, supporting both function and decorator types.
 * - Controls field availability for JSON serialization using `class-transformer` decorators.
 *
 * @param options - Configuration options for the field, including validation, documentation, and required logic.
 * @returns The property decorator function.
 *
 * @example
 * ```typescript
 * class Person {
 *     Field({ required: true, docs: 'The name of the person.' })
 *     name: string;
 * }
 * ```
 */
export function Field<TObject extends object = object, TValue = unknown>(options: FieldOptions<TObject, TValue>) {
  return function (target: Object, propertyKey: string) {
    if (options?.docs) {
      Reflect.defineMetadata('field:docs', options.docs, target, propertyKey);
    }

    // Handle field availability for JSON serialization/deserialization
    if (options?.available === false) {
      Exclude()(target, propertyKey);
    } else if (typeof options?.available === 'function') {
      // For function-based availability, we need to use Transform to conditionally include/exclude
      const availableFn = options.available as CustomAvailableFunction<TObject>;
      
      // Store the availability function in metadata for potential future use
      Reflect.defineMetadata('field:available', availableFn, target, propertyKey);
      
      // Use Transform to control the field's presence in JSON
      Transform(({ obj, key }) => {
        try {
          const shouldBeAvailable = availableFn(obj as TObject);
          // If the field should not be available, return undefined (which excludes it from JSON)
          // If it should be available, return the actual value
          return shouldBeAvailable ? obj[key] : undefined;
        } catch {
          // If there's an error evaluating the function, default to excluding the field
          return undefined;
        }
      }, { toPlainOnly: true })(target, propertyKey);
      
      // Also expose the field by default for cases where the function returns true
      Expose()(target, propertyKey);
    } else {
      // Default behavior is to expose the field (available: true or undefined)
      Expose()(target, propertyKey);
    }

    if (options?.required !== undefined) {
      if (typeof options.required === 'function') {
        ValidateIf((object: unknown) => {
          try {
            const reqFn = options.required as CustomRequiredFunction<TObject>;
            return !!reqFn(object as TObject);
          }
          catch {
            return false;
          }
        })(target, propertyKey);
        IsNotEmpty()(target, propertyKey);
      } else if (options.required) {
        // Simple boolean required
        IsNotEmpty()(target, propertyKey);
      }
    }

    if (options?.validation) {
      // Store the custom validation function in metadata
      Reflect.defineMetadata('field:validation', options.validation, target, propertyKey);
      // Apply the custom validator decorator to integrate with class-validator
      CustomValidate()(target, propertyKey);
    }
  };
}




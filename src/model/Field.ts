import { IsNotEmpty, ValidateIf } from 'class-validator';
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
type CustomValidationFunction = (
  value: any,
  object: any
) => { code: string; message: string }[];

/**
 * Custom required function type for conditional field requirements.
 * 
 * @param object - The entire object containing the field being evaluated
 * @returns Boolean indicating whether the field is required (``true``) or optional (``false``)
 * 
 * @example
 * ```typescript
 * const isRequiredIfAdult: CustomRequiredFunction = (object) => {
 *   return object.age >= 18;
 * };
 * ```
 */
type CustomRequiredFunction = (
  object: any
) => Boolean;

/**
 * Configuration options for the Field decorator.
 * 
 * This interface defines all available options that can be passed to the ``@Field`` decorator
 * to configure validation, documentation, and field behavior.
 */
export interface FieldOptions {
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
  required?: boolean | CustomRequiredFunction;

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
  validation?: PropertyDecorator | CustomValidationFunction;
}

/**
 * Decorator for model fields that applies validation, documentation, and metadata based on provided options.
 *
 * - Adds documentation metadata if `docs` is present in options.
 * - Applies required validation using `IsNotEmpty` and optionally `ValidateIf` if `required` is a function.
 * - Applies custom validation if `validation` is provided, supporting both function and decorator types.
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
export function Field(options: FieldOptions) {
  return function (target: any, propertyKey: string) {
    if (options?.docs) {
      Reflect.defineMetadata('field:docs', options.docs, target, propertyKey);
    }

    if (options?.required !== undefined) {
      if (typeof options.required === 'function') {
        ValidateIf((object: any) => {
          try {
            const reqFn = options.required as (object: any) => boolean;
            return !!reqFn(object);
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
      if (typeof options.validation === 'function' && options.validation.length > 1) {
        // Store the custom validation function in metadata
        Reflect.defineMetadata('field:validation', options.validation, target, propertyKey);
        // Apply the custom validator decorator to integrate with class-validator
        CustomValidate()(target, propertyKey);
      } else {
        // Apply decorator directly if it's already a decorator
        (options.validation as PropertyDecorator)(target, propertyKey);
      }
    }
  };
}




import { IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';
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
   * Defines the calculation strategy for a getter field.
   * - `'automatic'` (default): The getter works as a standard TypeScript getter, calculated on every access.
   * - `'manual'`: The getter's calculation is only executed when the `calculate()` method is called on the model instance. The result is then memoized (cached).
   */
  calculation?: 'manual' | 'automatic';
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
export function Field<TObject extends object = object, TValue = unknown>(options: FieldOptions<TObject, TValue>) {
  return function (target: Object, propertyKey: string, descriptor?: PropertyDescriptor) {
    if (options?.docs) {
      Reflect.defineMetadata('field:docs', options.docs, target, propertyKey);
    }
    if (!options.required) {
      IsOptional()(target, propertyKey);
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

    // If calculation is manual apply memoization
    // If is automatic, no special handling is needed
    if (options?.calculation === 'manual') {
      // This feature can only be applied to getters
      if (!descriptor || typeof descriptor.get !== 'function') {
        throw new Error(`@Field({ calculation: 'manual' }) can only be applied to a getter, but it was used on '${propertyKey}'.`);
      }

      const originalGetter = descriptor.get;
      const memoizedSymbol = Symbol(`_memoized_${propertyKey}`); // Use a Symbol to avoid property collisions

      // Store the original calculation function in metadata so `calculate()` can find it
      Reflect.defineMetadata('field:calculation', originalGetter, target, propertyKey);

      // Replace the original getter with one that returns the memoized value
      descriptor.get = function () {
        return (this as any)[memoizedSymbol];
      };

      // Also define a setter so the `calculate()` method can store the result
      descriptor.set = function (value: any) {
        (this as any)[memoizedSymbol] = value;
      };
    }
  };
}




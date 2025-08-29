import { IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';
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
export type ValidationIssue = { constraint: string; message: string };

/**
 * Type for a custom validation function.
 * @param value - The value of the field being validated.
 * @param object - The entire object containing the field.
 * @returns An array of validation issues, or an empty array if valid.
 */
type CustomValidationFunction<TValue, TObject> = (
  value: TValue,
  object: TObject
) => ValidationIssue[];

/**
 * Type for a function that dynamically determines if a field is required.
 * @param object - The entire object containing the field.
 * @returns `true` if the field is required, otherwise `false`.
 */
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
   * Defines the calculation strategy for a getter field.
   * - `'automatic'` (default): The getter works as a standard TypeScript getter, calculated on every access.
   * - `'manual'`: The getter's calculation is only executed when the `calculate()` method is called on the model instance. The result is then memoized (cached).
   */
  calculation?: 'manual' | 'automatic';

  /**
   * Indicates whether the field should be available for JSON serialization and deserialization.
   * 
   * - When set to `false`, the field will be excluded from JSON conversion operations (applies `@Exclude()`).
   * - When set to `true` or not specified, the field will be included in JSON operations (applies `@Expose()`).
   * - When set to a function, the field availability is determined dynamically (applies `@Transform()` and `@Expose()`).
   * 
   * @default true
   * 
   * @example
   * ```typescript
   * // Field available for JSON operations (default behavior) - uses Expose()
   * @Field({ available: true })
   * name: string;
   * 
   * // Field excluded from JSON operations - uses Exclude()
   * @Field({ available: false })
   * internalId: string;
   * 
   * // Field conditionally available based on object state - uses Transform()+Expose()
   * @Field({ 
   *   available: (obj) => obj.isPublic,
   *   docs: 'Phone number only available for public profiles'
   * })
   * phoneNumber: string;
   * 
   * // Complex conditional availability example
   * @Field({ 
   *   available: (person) => person.age >= 18 && person.hasConsent,
   *   docs: 'Sensitive data only for adults with consent'
   * })
   * sensitiveData: string;
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
 * - Controls field availability for JSON serialization using `class-transformer` decorators:
 *   - `@Exclude()` when `available: false`
 *   - `@Expose()` when `available: true` or undefined
 *   - `@Transform()` + `@Expose()` when `available` is a function
 *
 * @param options - Configuration options for the field, including validation, documentation, and required logic.
 * @returns The property decorator function.
 *
 * @example
 * ```typescript
 * class Person {
 *     // Basic required field with documentation
 *     @Field({ required: true, docs: 'The name of the person.' })
 *     name: string;
 *     
 *     // Field excluded from JSON serialization (@Exclude applied)
 *     @Field({ available: false, docs: 'Internal ID not exposed in API' })
 *     internalId: string;
 *     
 *     // Field included in JSON serialization (@Expose applied - default behavior)
 *     @Field({ available: true })
 *     email: string;
 *     
 *     // Conditionally available field (@Transform+@Expose applied)
 *     @Field({ 
 *       available: (person) => person.age >= 18,
 *       docs: 'Phone number only available for adults'
 *     })
 *     phoneNumber: string;
 * 
 *     // Complex example: Admin-only field with custom validation
 *     @Field({
 *       available: (user) => user.role === 'admin',
 *       validation: (value) => {
 *         if (value && value.length < 8) {
 *           return [{ code: 'WEAK_TOKEN', message: 'Admin token too short' }];
 *         }
 *         return [];
 *       },
 *       docs: 'Administrative access token (admin users only)'
 *     })
 *     adminToken?: string;
 * }
 * ```
 */
export function Field<TObject extends object = object, TValue = unknown>(options: FieldOptions<TObject, TValue>) {
  return function (target: Object, propertyKey: string, descriptor?: PropertyDescriptor) {
    // Add documentation metadata if provided
    if (options.docs) {
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
    if (!options.required) {
      IsOptional()(target, propertyKey);
    }
    if (options?.required !== undefined) {
      if (typeof options.required === 'function') {
        // Conditionally require the field based on the provided function
        ValidateIf((object: TObject) => {
          try {
            return (options.required as CustomRequiredFunction<TObject>)(object);
          } catch {
            return false;
          }
        })(target, propertyKey);
        IsNotEmpty()(target, propertyKey);
      } else {
        // Always require the field
        IsNotEmpty()(target, propertyKey);
      }
    } else {
      // If not required, the field is optional
      IsOptional()(target, propertyKey);
    }

    // Handle custom validation logic
    if (options.validation) {
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
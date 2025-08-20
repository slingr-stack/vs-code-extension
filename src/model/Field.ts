import { IsNotEmpty, ValidateIf } from 'class-validator';

type CustomValidationFunction = (
  value: any,
  object: any
) => { code: string; message: string }[];

type CustomRequiredFunction = (
  object: any
) => Boolean;

export interface FieldOptions {
  required?: boolean | CustomRequiredFunction;
  docs?: string;
  validation?: PropertyDecorator | CustomValidationFunction;
}

/**
 * Decorator for model fields that applies validation, documentation, and metadata based on provided options.
 *
 * - Adds documentation metadata if `docs` is present in options.
 * - Applies required validation using `IsNotEmpty` and optionally `ValidateIf` if `required` is a function.
 * - Applies custom validation if `validation` is provided, supporting both function and decorator types.
 *
 * @param {FieldOptions} options - Configuration options for the field, including validation, documentation, and required logic.
 * @returns {PropertyDecorator} The property decorator function.
 *
 * @example
 * ```typescript
 * class Person {
 *     @Field({ required: true, docs: 'The name of the person.' })
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
        Reflect.defineMetadata('field:validation', options.validation, target, propertyKey);
      } else {
        (options.validation as PropertyDecorator)(target, propertyKey);
      }
    }
  };
}




import { ValidationError, validate } from "class-validator";
import type { ValidationIssue } from "./types/SharedTypes";

/**
 * Abstract base class for all model classes in the framework.
 * 
 * This class provides common functionality for model validation and should be extended
 * by all model classes that use the ``@Field`` decorator for validation.
 * 
 * @abstract
 * 
 * @example
 * ```typescript
 * class Person extends BaseModel {
 *   Field({ required: true, docs: 'Person\'s full name' })
 *   name: string;
 * 
 *   Field({ validation: IsEmail() })
 *   email: string;
 * }
 * 
 * const person = new Person();
 * person.name = 'John Doe';
 * person.email = 'john@example.com';
 * 
 * const errors = await person.validate();
 * if (errors.length === 0) {
 *   console.log('Person is valid');
 * }
 * ```
 */
export abstract class BaseModel {
  /**
   * Validates the current model instance using class-validator and custom validation rules.
   * 
   * This method runs all validation rules defined by ``@Field`` decorators on the model properties.
   * It supports both built-in class-validator decorators and custom validation functions.
   * 
   * For custom validations, the method preserves original error codes and messages from
   * the custom validation functions, ensuring meaningful error reporting.
   * 
   * @returns A Promise that resolves to an array of ValidationError objects.
   *          - Empty array: validation passed, no errors found
   *          - Non-empty array: validation failed, contains detailed error information
   * 
   * @example
   * ```typescript
   * const person = new Person();
   * person.name = ''; // Invalid: required field
   * person.email = 'invalid-email'; // Invalid: not a valid email
   * 
   * const errors = await person.validate();
   * console.log(`Found ${errors.length} validation errors`);
   * 
   * errors.forEach(error => {
   *   console.log(`Property: ${error.property}`);
   *   console.log(`Constraints:`, error.constraints);
   * });
   * ```
   * 
   * @throws {Error} May throw if reflection metadata is corrupted or validation setup is invalid
   */
  public async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Transform constraint names for custom validations to preserve original error codes
    errors.forEach(error => {
      if (error.constraints) {
        const constraintKeys = Object.keys(error.constraints);

        // Check if this is a custom validation error (contains "customValidation")
        const customConstraint = constraintKeys.find(key => key.includes('customValidation'));

        if (customConstraint) {
          // Get the custom validation function to extract error codes
          const customValidationFn = Reflect.getMetadata(
            "field:validation",
            this,
            error.property
          );

          if (typeof customValidationFn === "function") {
            const validationResults = customValidationFn(error.value, this);

            if (validationResults && validationResults.length > 0) {
              // Replace constraints with original error codes
              const newConstraints: Record<string, string> = {};
              (validationResults as ValidationIssue[]).forEach((result) => {
                newConstraints[result.constraint] = result.message;
              });
              error.constraints = newConstraints;
            }
          }
        }
      }
    });

    return errors;
  }
}
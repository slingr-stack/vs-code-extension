import { ValidationError, validate } from "class-validator";
import type { ValidationIssue } from "./Field";

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
    errors.forEach((error) => {
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

  /**
   * Executes the calculation for all fields marked with `calculation: 'manual'`.
   * * It iterates multiple times to resolve dependencies where one calculated field
   * depends on another. The calculated value is then memoized (cached) on the instance
   * until this method is called again.
   * * @param {number} [maxIterations=10] - The maximum number of loops to prevent infinite recursion in case of circular dependencies.
   * @returns {Promise<void>}
   * * @example
   * ```typescript
   * const invoice = new Invoice();
   * invoice.price = 10;
   * invoice.quantity = 5;
   * * await invoice.calculate(); // invoice.total is now 50
   * * invoice.price = 20;
   * console.log(invoice.total); // Still 50, because it's memoized
   * * await invoice.calculate(); // Recalculates, invoice.total is now 100
   * ```
   */
  public async calculate(maxIterations: number = 10): Promise<void> {
    const calculatedFields = Object.getOwnPropertyNames(
      Object.getPrototypeOf(this)
    ).filter((key) => Reflect.hasMetadata("field:calculation", this, key));

    if (calculatedFields.length === 0) {
      return;
    }

  // TODO: Analyze this approach for resolving dependencies between calculated fields.
  // Iterate to resolve dependencies. A field calculated in one pass
  // may be used by another field in the next pass.
    for (let i = 0; i < maxIterations; i++) {
      let hasChanged = false;
      for (const key of calculatedFields) {
        const originalGetter = Reflect.getMetadata(
          "field:calculation",
          this,
          key
        );
        const oldValue = (this as any)[key];
        const newValue = originalGetter.call(this);

        // Compares the contents of objects, not references
        const valuesAreDifferent =
          (typeof oldValue === 'object' && oldValue !== null)
            ? JSON.stringify(oldValue) !== JSON.stringify(newValue)
            : oldValue !== newValue;

        if (valuesAreDifferent) {
          (this as any)[key] = newValue; // Triggers the replaced setter to memoize the value
          hasChanged = true;
        }
      }

      // If no fields changed their value in a full pass, we can safely exit
      if (!hasChanged) {
        break;
      }
    }
  }
}

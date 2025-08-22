import { ValidationError, validate } from "class-validator";
import type { ValidationIssue } from "./Field";
import { instanceToPlain, plainToInstance, Transform } from "class-transformer";

/**
 * Abstract base class for all model classes in the framework.
 * 
 * This class provides common functionality for model validation and JSON serialization/deserialization.
 * It should be extended by all model classes that use the ``@Field`` decorator for validation.
 * 
 * The class integrates with both ``class-validator`` for validation and ``class-transformer`` for
 * JSON conversion operations, providing a complete solution for model data handling.
 * 
 * @abstract
 * 
 * @example
 * ```typescript
 * class Person extends BaseModel {
 *   @Field({ required: true, docs: 'Person\'s full name' })
 *   name: string;
 * 
 *   @Field({ validation: IsEmail() })
 *   email: string;
 * 
 *   @Field({ available: false }) // Excluded from JSON operations
 *   internalId: string;
 * }
 * 
 * const person = new Person();
 * person.name = 'John Doe';
 * person.email = 'john@example.com';
 * 
 * // Validation
 * const errors = await person.validate();
 * if (errors.length === 0) {
 *   console.log('Person is valid');
 * }
 * 
 * // JSON serialization
 * const json = person.toJSON(); // { name: 'John Doe', email: 'john@example.com' }
 * 
 * // JSON deserialization
 * const restored = Person.fromJSON(json);
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
                newConstraints[result.code] = result.message;
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
   * Converts the current model instance to a JSON object.
   * 
   * This method uses class-transformer to serialize the object, respecting the `@Field` decorator's
   * `available` property to include or exclude fields from the JSON output. Fields marked with
   * `available: false` will be excluded from the resulting JSON.
   * 
   * @returns A plain JavaScript object representation of the model instance
   * 
   * @example
   * ```typescript
   * const person = new Person();
   * person.name = 'John Doe';
   * person.email = 'john@example.com';
   * 
   * const json = person.toJSON();
   * console.log(json); // { name: 'John Doe', email: 'john@example.com' }
   * ```
   */
  public toJSON(): Record<string, any> {
    return instanceToPlain(this, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Creates and populates a model instance from a JSON object.
   * 
   * This static method uses class-transformer to deserialize JSON data into a properly
   * typed model instance. It respects the `@Field` decorator's `available` property to
   * include or exclude fields during deserialization. The method also enables
   * transformation and coercion when possible to convert string values to appropriate types.
   * 
   * @param this - The constructor of the target model class
   * @param json - The JSON object to convert into a model instance
   * @returns A new instance of the model class populated with data from the JSON
   * 
   * @example
   * ```typescript
   * const jsonData = { 
   *   name: 'John Doe', 
   *   email: 'john@example.com',
   *   age: '25' // String will be coerced to number if the field is typed as number
   * };
   * 
   * const person = Person.fromJSON(jsonData);
   * console.log(person instanceof Person); // true
   * console.log(person.name); // 'John Doe'
   * console.log(typeof person.age); // 'number' (coerced from string)
   * ```
   */
  public static fromJSON<T extends BaseModel>(
    this: new () => T,
    json: Record<string, any>
  ): T {
    return plainToInstance(this, json, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true, // Enable coercion when possible
    });
  }
}
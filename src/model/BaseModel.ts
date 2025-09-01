import { ValidationError, validate } from "class-validator";
import { instanceToPlain, plainToInstance, Transform } from "class-transformer";
import { ValidationIssue } from "./types/SharedTypes";

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
 *   Field({ validation: IsEmail() })
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
    const plainObject = instanceToPlain(this, {
      excludeExtraneousValues: true,
    });

    // Remove properties with undefined values (which indicates field should not be available)
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(plainObject)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Creates and populates a model instance from a JSON object.
   * 
   * This static method uses class-transformer to deserialize JSON data into a properly
   * typed model instance. It respects the `@Field` decorator's `available` property to
   * include or exclude fields during deserialization. The method also enables
   * transformation and coercion when possible to convert string values to appropriate types.
   * 
   * Additionally, this method automatically fills empty values with:
   * - Default values defined in the class declaration
   * - Calculated values for fields marked with `calculation: 'manual'`
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
    // First, create the instance using class-transformer
    const instance = plainToInstance(this, json, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true, // Enable coercion when possible
    });

    // Apply default values for fields that are undefined/null but have defaults
    BaseModel.applyDefaultValues(instance);

    // Calculate manual calculation fields
    instance.calculate();

    return instance;
  }

  /**
   * Applies default values to fields that are undefined/null in the instance
   * but have default values defined in the class.
   * 
   * @param instance - The model instance to apply default values to
   */
  private static applyDefaultValues<T extends BaseModel>(instance: T): void {
    // Create a temporary instance to get the default values
    const defaultInstance = new (instance.constructor as new () => T)();
    
    // Get all property names from the prototype chain
    const propertyNames = this.getAllPropertyNames(instance);
    
    for (const propertyName of propertyNames) {
      // Check if this property has a Field decorator
      if (Reflect.hasMetadata('field:docs', instance, propertyName) || 
          Reflect.hasMetadata('field:validation', instance, propertyName) ||
          this.hasFieldDecorator(instance, propertyName)) {
        
        // Skip calculated fields as they will be handled by calculate()
        if (Reflect.hasMetadata('field:calculation', instance, propertyName)) {
          continue;
        }
        
        // If the property is undefined/null in the instance but has a default value
        if ((instance as any)[propertyName] === undefined || (instance as any)[propertyName] === null) {
          const defaultValue = (defaultInstance as any)[propertyName];
          if (defaultValue !== undefined && defaultValue !== null) {
            (instance as any)[propertyName] = defaultValue;
          }
        }
      }
    }
  }

  /**
   * Gets all property names from the instance and its prototype chain
   */
  private static getAllPropertyNames(instance: BaseModel): string[] {
    const propertyNames = new Set<string>();
    
    // Get properties from the instance itself
    Object.getOwnPropertyNames(instance).forEach(name => propertyNames.add(name));
    
    // Get properties from the prototype chain
    let prototype = Object.getPrototypeOf(instance);
    while (prototype && prototype !== BaseModel.prototype && prototype !== Object.prototype) {
      Object.getOwnPropertyNames(prototype).forEach(name => {
        if (name !== 'constructor') {
          propertyNames.add(name);
        }
      });
      prototype = Object.getPrototypeOf(prototype);
    }
    
    return Array.from(propertyNames);
  }

  /**
   * Checks if a property has any Field-related metadata
   */
  private static hasFieldDecorator(instance: BaseModel, propertyName: string): boolean {
    // Check for any metadata that would indicate a Field decorator was applied
    const metadataKeys = Reflect.getMetadataKeys(instance, propertyName) || [];
    return metadataKeys.some(key => 
      typeof key === 'string' && key.startsWith('field:')
    ) || metadataKeys.includes('custom:field') || 
       metadataKeys.includes('field') ||
       metadataKeys.includes('design:type');
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

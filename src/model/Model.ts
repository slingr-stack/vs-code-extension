import "reflect-metadata";
import { DataSource } from "../datasources";

/**
 * Collects all field names from a class and its parent classes in the inheritance chain.
 * This ensures that fields from base classes are included when configuring derived classes.
 * 
 * @param constructor - The class constructor to analyze
 * @returns Array of all field names from the inheritance chain
 */
function getAllFieldNames(constructor: Function): string[] {
  const allFields = new Set<string>();
  let currentClass = constructor;

  // Walk up the prototype chain to collect fields from all parent classes
  while (currentClass && currentClass !== Object) {
    // Check if the class has field metadata before trying to access it
    if (Reflect.hasMetadata('model:fields', currentClass)) {
      const fields = Reflect.getMetadata('model:fields', currentClass) || [];
      fields.forEach((field: string) => allFields.add(field));
    }

    // Move to the parent class
    currentClass = Object.getPrototypeOf(currentClass);
  }

  return Array.from(allFields);
}

/**
 * Configuration options for the Model decorator.
 */
export interface ModelOptions {
  /** Optional documentation string for the model. */
  docs?: string;

  /** Optional data source for persistence configuration. */
  dataSource?: DataSource;
}

/**
 * Decorator that marks a class as a model and stores metadata.
 * 
 * When a dataSource is provided, it will automatically configure the model
 * with the necessary decorators and metadata for persistence.
 * 
 * @param options - Optional configuration for the model
 * @returns A class decorator function
 * 
 * @example
 * ```typescript
 * // User model representing application users
 * // Simple model without data source
 * @Model({ docs: "User model representing application users" })
 * class User {
 *   // class implementation
 * }
 * 
 * // Persistent model with data source
 * @Model({ 
 *   docs: "User model with database persistence",
 *   dataSource: myTypeOrmDataSource 
 * })
 * class User extends PersistentModel {
 *   // class implementation
 * }
 * ```
 */
export function Model(options?: ModelOptions) {
  return function (constructor: Function) {
    Reflect.defineMetadata("model:docs", options?.docs, constructor);

    // If a data source is provided, configure the model for persistence
    if (options?.dataSource) {
      Reflect.defineMetadata("model:dataSource", options.dataSource, constructor);

      // Call configureModel on the data source
      options.dataSource.configureModel(constructor, options);

      // Configure all fields with the data source
      // Get the list of fields that have @Field decorators applied, including inherited fields
      const fieldNames = getAllFieldNames(constructor);

      fieldNames.forEach((fieldName: string) => {
        // Look for field metadata in the current class and parent classes
        let fieldType, fieldTypeOptions, fieldRequired, isEmbedded;
        let currentClass = constructor;

        // Walk up the prototype chain to find the field metadata
        while (currentClass && currentClass !== Object && currentClass.prototype) {
          if (!fieldType && Reflect.hasMetadata('field:type', currentClass.prototype, fieldName)) {
            fieldType = Reflect.getMetadata('field:type', currentClass.prototype, fieldName);
          }
          if (!fieldTypeOptions && Reflect.hasMetadata('field:type:options', currentClass.prototype, fieldName)) {
            fieldTypeOptions = Reflect.getMetadata('field:type:options', currentClass.prototype, fieldName);
          }
          if (fieldRequired === undefined && Reflect.hasMetadata('field:required', currentClass.prototype, fieldName)) {
            fieldRequired = Reflect.getMetadata('field:required', currentClass.prototype, fieldName);
          }
          if (!isEmbedded && Reflect.hasMetadata('field:embedded', currentClass.prototype, fieldName)) {
            isEmbedded = Reflect.getMetadata('field:embedded', currentClass.prototype, fieldName);
          }

          // Break early if we found all metadata
          if (fieldType && fieldTypeOptions !== undefined && fieldRequired !== undefined && isEmbedded !== undefined) {
            break;
          }

          currentClass = Object.getPrototypeOf(currentClass);
        }

        if (isEmbedded) {
          // For embedded fields, pass a special type indicator
          options.dataSource!.configureField(constructor.prototype, fieldName, 'embedded', {
            required: fieldRequired
          });
        } else if (fieldType) {
          // Combine field options including required information
          const allFieldOptions = {
            ...fieldTypeOptions,
            required: fieldRequired
          };

          // Configure the field with the data source
          options.dataSource!.configureField(constructor.prototype, fieldName, fieldType, allFieldOptions);
        }
      });
    }
  };
}

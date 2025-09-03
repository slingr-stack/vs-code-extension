import "reflect-metadata";
import { DataSource } from "../datasources";

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
      // Get the list of fields that have @Field decorators applied
      const fieldNames = Reflect.getMetadata('model:fields', constructor) || [];

      fieldNames.forEach((fieldName: string) => {
        const fieldType = Reflect.getMetadata('field:type', constructor.prototype, fieldName);
        const fieldTypeOptions = Reflect.getMetadata('field:type:options', constructor.prototype, fieldName);
        const fieldRequired = Reflect.getMetadata('field:required', constructor.prototype, fieldName);

        if (fieldType) {
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

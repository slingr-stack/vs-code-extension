import "reflect-metadata";
import { Expose, Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { 
  FIELD_EMBEDDED, 
  FIELD_EMBEDDED_TYPE, 
  FIELD_EMBEDDED_OPTIONS, 
  FIELD_EMBEDDED_DOCS, 
  MODEL_FIELDS, 
  DESIGN_TYPE 
} from './metadata';

/**
 * Configuration options for the Embedded decorator.
 */
export interface EmbeddedOptions {
  /** Optional documentation string for the embedded model. */
  docs?: string;
}

/**
 * Decorator that marks a field as an embedded model.
 * 
 * This decorator is used to embed one model into another, where the embedded
 * model extends BaseModel (not PersistentModel) and doesn't have a dataSource.
 * The embedded model's fields will be included as columns in the parent entity's table.
 * 
 * @param options - Optional configuration for the embedded field
 * @returns A property decorator function
 * 
 * @example
 * ```typescript
 * // Embedded model without data source
 * @Model()
 * class Address extends BaseModel {
 *   @Field()
 *   @Text()
 *   addressLine1: string;
 * 
 *   @Field()
 *   @Text()
 *   city: string;
 * }
 * 
 * // Parent model with embedded field
 * @Model({
 *   dataSource: mainDataSource
 * })
 * class Customer extends PersistentModel {
 *   @Field()
 *   @Text()
 *   name: string;
 * 
 *   @Embedded()
 *   address: Address;
 * }
 * ```
 */
export function Embedded(options?: EmbeddedOptions) {
  return function (target: any, propertyKey: string) {
    // Store metadata that this field is embedded
    Reflect.defineMetadata(FIELD_EMBEDDED, true, target, propertyKey);
    
    // Store embedded options
    if (options) {
      Reflect.defineMetadata(FIELD_EMBEDDED_OPTIONS, options, target, propertyKey);
    }
    
    // Store documentation if provided
    if (options?.docs) {
      Reflect.defineMetadata(FIELD_EMBEDDED_DOCS, options.docs, target, propertyKey);
    }

    // Get the type of the property
    const propertyType = Reflect.getMetadata(DESIGN_TYPE, target, propertyKey);
    if (propertyType) {
      Reflect.defineMetadata(FIELD_EMBEDDED_TYPE, propertyType, target, propertyKey);
    }

    // Register this field in the fields list for the containing class
    const existingFields = Reflect.getMetadata(MODEL_FIELDS, target.constructor) || [];
    if (!existingFields.includes(propertyKey)) {
      existingFields.push(propertyKey);
      Reflect.defineMetadata(MODEL_FIELDS, existingFields, target.constructor);
    }

    // Make the embedded field available in JSON serialization
    Expose()(target, propertyKey);

    // Enable nested validation for the embedded object
    ValidateNested()(target, propertyKey);

    // Set the type for class-transformer to properly handle nested objects
    if (propertyType) {
      Type(() => propertyType)(target, propertyKey);
    }
  };
}

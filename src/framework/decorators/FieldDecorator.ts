import { IsNotEmpty } from 'class-validator';

import type { Field } from "../model/Field";

export interface FieldOptions extends Field{}

export function Field(options: FieldOptions) {  
    return function (target: any, propertyKey: string) {
    // Store metadata for the field's documentation
    if (options?.docs) {
        Reflect.defineMetadata('field:docs', options.docs, target, propertyKey);
    }

    // Apply IsNotEmpty decorator if the field is required
    if (options?.required) {
      const isRequired = typeof options.required === 'function' 
        ? options.required(target) 
        : options.required;
      
      if (isRequired) {
        IsNotEmpty()(target, propertyKey);
      }
    }

    // Handle validation option
    if (options?.validation) {
        if (typeof options.validation === 'function' && options.validation.length > 1) {
            // This is our custom validation function for a field
            Reflect.defineMetadata('custom:validation', options.validation, target, propertyKey);
        } else {
            // This is a class-validator decorator
            (options.validation as PropertyDecorator)(target, propertyKey);
        }
    }
  };
}

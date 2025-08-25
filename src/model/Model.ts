import "reflect-metadata";

/**
 * Configuration options for the Model decorator.
 */
export interface ModelOptions {
  /** Optional documentation string for the model. */
  docs?: string;
}

/**
 * Decorator that marks a class as a model and stores metadata.
 * 
 * @param options - Optional configuration for the model
 * @returns A class decorator function
 * 
 * @example
 * ```typescript
 * // User model representing application users
 * @Model({ docs: "User model representing application users" })
 * class User {
 *   // class implementation
 * }
 * ```
 */
export function Model(options?: ModelOptions) {
  return function (constructor: Function) {
    Reflect.defineMetadata("model:docs", options?.docs, constructor);
  };
}

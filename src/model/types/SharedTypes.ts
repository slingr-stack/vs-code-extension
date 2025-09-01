/**
 * Represents a validation error from a custom validation function.
 */
export interface ValidationIssue {
  /**
   * The constraint code/identifier for this validation error.
   */
  constraint: string;

  /**
   * The human-readable error message.
   */
  message: string;
}

/**
 * Type for a custom validation function.
 * @param value - The value of the field being validated.
 * @param object - The entire object containing the field.
 * @returns An array of validation issues, or an empty array if valid.
 */
export type CustomValidationFunction<TValue = unknown, TObject extends object = object> = (
  value: TValue,
  object: TObject
) => ValidationIssue[];

/**
 * Type for a function that dynamically determines if a field is required.
 * @param object - The entire object containing the field.
 * @returns `true` if the field is required, otherwise `false`.
 */
export type CustomRequiredFunction<TObject extends object = object> = (object: TObject) => boolean;
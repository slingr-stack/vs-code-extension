/**
 * Validation issue interface for custom validation functions.
 */
export type ValidationIssue = {
  /** Error code identifier */
  constraint: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Type for a custom validation function.
 * @param value - The value of the field being validated.
 * @param object - The entire object containing the field.
 * @returns An array of validation issues, or an empty array if valid.
 */
export type CustomValidationFunction<TValue = unknown, TObject = object> = (
  value: TValue,
  object: TObject
) => ValidationIssue[];

/**
 * Type for a function that dynamically determines if a field is required.
 * @param object - The entire object containing the field.
 * @returns `true` if the field is required, otherwise `false`.
 */
export type CustomRequiredFunction<TObject = object> = (object: TObject) => boolean;

/**
 * Type for a function that dynamically determines if a field is available.
 * @param object - The entire object containing the field.
 * @returns `true` if the field is available, otherwise `false`.
 */
export type CustomAvailableFunction<TObject = object> = (object: TObject) => boolean;

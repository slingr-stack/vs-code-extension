/**
 * Represents a single validation error from a custom validation function.
 */
export type ValidationIssue = { constraint: string; message: string };

/**
 * A function that performs custom validation on a field's value.
 * @param TValue The type of the field's value.
 * @param TObject The type of the object being validated.
 * @returns An array of ValidationIssue objects. Returns an empty array if validation passes.
 */
export type CustomValidationFunction<TValue, TObject> = (
  value: TValue,
  object: TObject
) => ValidationIssue[];

/**
 * A function that conditionally determines if a field is required.
 * @param TObject The type of the object being validated.
 * @returns `true` if the field is required, `false` otherwise.
 */
export type CustomRequiredFunction<TObject> = (object: TObject) => boolean;

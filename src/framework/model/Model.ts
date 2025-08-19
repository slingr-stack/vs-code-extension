import { validate, ValidationError } from "class-validator";
import "reflect-metadata";

export abstract class BaseModel {
  /**
   * Validates the class instance using the rules defined by the @Field decorators.
   * @returns A promise that resolves to an array of validation errors. The array is empty if validation succeeds.
   */
  public async validate(): Promise<ValidationError[]> {
    // 1. Run standard class-validator validations
    const classValidatorErrors = await validate(this);

    // 2. Run custom validations
    const customErrors: ValidationError[] = [];
    const properties = Object.keys(this);

    for (const property of properties) {
      const customValidationFn = Reflect.getMetadata(
        "field:validation",
        this,
        property
      );

      if (typeof customValidationFn === "function") {
        const value = (this as any)[property];
        const validationResults = customValidationFn(value, this);

        if (validationResults && validationResults.length > 0) {
          // Convert custom errors to the ValidationError format
          validationResults.forEach((error: any) => {
            const validationError = new ValidationError();
            validationError.property = property;
            validationError.value = value;
            validationError.constraints = {
              [error.code]: error.message,
            };
            customErrors.push(validationError);
          });
        }
      }
    }

    // 3. Combine both types of errors
    return [...classValidatorErrors, ...customErrors];
  }
}

export interface Model {
  docs?: string;
}

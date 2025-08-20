import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Creates a custom validation decorator that integrates with class-validator
 * and preserves the original error codes from custom validation functions.
 */
export function CustomValidate(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions || {},
            constraints: [],
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const customValidationFn = Reflect.getMetadata(
                        "field:validation",
                        args.object,
                        args.property
                    );

                    if (typeof customValidationFn === "function") {
                        const validationResults = customValidationFn(value, args.object);
                        return !validationResults || validationResults.length === 0;
                    }
                    return true;
                },
                defaultMessage(args: ValidationArguments) {
                    const customValidationFn = Reflect.getMetadata(
                        "field:validation",
                        args.object,
                        args.property
                    );

                    if (typeof customValidationFn === "function") {
                        const validationResults = customValidationFn(args.value, args.object);
                        if (validationResults && validationResults.length > 0) {
                            return validationResults[0].message;
                        }
                    }
                    return 'Custom validation failed';
                }
            }
        });
    };
}

import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { FIELD_VALIDATION } from '../model/metadata/MetadataKeys';

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
                validate(value: unknown, args: ValidationArguments) {
                    const customValidationFn = Reflect.getMetadata(
                        FIELD_VALIDATION,
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
                        FIELD_VALIDATION,
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

import 'reflect-metadata';

/**
 * Validates that a property is of string type at runtime.
 */
export function validateStringType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== String) {
        throw new Error(`Decorator can only be applied to 'string' properties: ${propertyKey}`);
    }
}

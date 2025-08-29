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

/**
 * Validates that a property is of Date type at runtime.
 */
export function validateDateType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType !== Date) {
        throw new Error(`@DateTime can only be applied to 'Date' properties: ${propertyKey}`);
    }
}

/**
 * Transforms Date objects to ISO 8601 strings for JSON serialization.
 * @param value - The Date value to transform
 * @returns ISO 8601 string or undefined if value is null/undefined
 */
export function dateToISO8601(value: Date | undefined | null): string | undefined {
    if (value == null) {
        return undefined;
    }
    if (!(value instanceof Date)) {
        return undefined;
    }
    return value.toISOString();
}

/**
 * Transforms ISO 8601 strings or milliseconds to Date objects for JSON deserialization.
 * Supports both ISO 8601 strings and milliseconds for backwards compatibility.
 * @param value - The value to transform (ISO 8601 string, milliseconds number, or Date)
 * @returns Date object or undefined if value is null/undefined
 */
export function dateFromJSON(value: any): Date | undefined {
    if (value == null) {
        return undefined;
    }
    
    // If it's already a Date object, return it
    if (value instanceof Date) {
        return value;
    }
    
    // If it's a number, treat it as milliseconds (backwards compatibility)
    if (typeof value === 'number') {
        return new Date(value);
    }
    
    // If it's a string, try to parse as ISO 8601
    if (typeof value === 'string') {
        const date = new Date(value);
        // Check if the date is valid
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
    return undefined;
}

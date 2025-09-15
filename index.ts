import { PersistentModel } from './src/model';
import number from 'financial-number';

// Export all the core components of the framework
export { BaseModel } from './src/model/BaseModel';
export { Field } from './src/model/Field';
export type { FieldOptions } from './src/model/Field';
export { Model } from './src/model/Model';
export type { ModelOptions } from './src/model/Model';
export { CustomValidate } from './src/validators/CustomValidationConstraint';
export { Text } from './src/model/types/string/Text';
export type { TextOptions } from './src/model/types/string/Text';
export { Email } from './src/model/types/string/Email';
export { HTML } from './src/model/types/string/HTML';
export { Boolean } from './src/model/types/boolean/Boolean';
export { Choice } from './src/model/types/';
export { DateTime } from './src/model/types/';
export type { DateTimeOptions } from './src/model/types/';
export { DateTimeRange, DateTimeRangeValue, dateTimeRange } from './src/model/types/';
export type { DateTimeRangeOptions } from './src/model/types/';
export { Integer } from './src/model/types/number/Integer';
export { Money } from './src/model/types/number/Money';
export type { Money as MoneyNumber } from './src/model/types/number/Money';
export { Number } from './src/model/types/number/Number';
export { Decimal } from './src/model/types/number/Decimal';
export type { Decimal as DecimalNumber } from './src/model/types/number/Decimal';
export { PersistentModel } from './src/model';
export { TypeORMSqlDataSource } from './src/datasources';
export type { TypeORMSqlDataSourceOptions } from './src/datasources';
export { Relationship } from './src/model/types';

// Aliases for the number() function from financial-number library

/**
 * Creates a decimal number using the financial-number library.
 * This is an alias for number() that provides consistency with the Decimal type naming.
 * 
 * @param value - The numeric value as a string or number
 * @returns A FinancialNumber instance for decimal operations
 * 
 * @example
 * ```typescript
 * const price = decimal("123.45");
 * const total = price.plus("10.00");
 * ```
 */
export const decimal = number;

/**
 * Creates a money value using the financial-number library.
 * This is an alias for number() that provides consistency with the Money type naming.
 * 
 * @param value - The numeric value as a string or number
 * @returns A FinancialNumber instance for monetary operations
 * 
 * @example
 * ```typescript
 * const price = money("999.99");
 * const discounted = price.multiply("0.9");
 * ```
 */
export const money = number;

/**
 * This file imports all field types to ensure their configurations are registered
 * with the FieldTypeRegistry. This must be imported before using the TypeORM mapper.
 */

// Import all field types to trigger their registration
import './string/Text';
import './string/Email';
import './string/HTML';
import './number/Integer';
import './number/Number';
import './number/Decimal';
import './number/Money';
import './boolean/Boolean';
import './date_time/DateTime';
import './enum/Choice';

// Export the registry for convenience
export { FieldTypeRegistry } from './FieldTypeConfig';
export type { FieldTypeConfig } from './FieldTypeConfig';

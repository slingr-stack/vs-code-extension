/**
 * Metadata keys used throughout the Slingr Framework.
 * 
 * This file centralizes all metadata key constants to improve maintainability 
 * and readability of the codebase. Instead of using hardcoded strings throughout
 * the framework, these constants should be used.
 * 
 * @example
 * ```typescript
 * // Instead of:
 * Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
 * 
 * // Use:
 * Reflect.getMetadata(FIELD_TYPE, entityClass.prototype, fieldName);
 * ```
 */

// =============================================================================
// Field-related metadata keys
// =============================================================================

/** Metadata key for storing field type information (e.g., 'money', 'text', 'email') */
export const FIELD_TYPE = 'field:type';

/** Metadata key for storing field type options/configuration */
export const FIELD_TYPE_OPTIONS = 'field:type:options';

/** Metadata key for storing field required configuration (boolean or function) */
export const FIELD_REQUIRED = 'field:required';

/** Metadata key for storing field documentation */
export const FIELD_DOCS = 'field:docs';

/** Metadata key for storing custom field validation functions */
export const FIELD_VALIDATION = 'field:validation';

/** Metadata key for storing field calculation functions for manual calculation */
export const FIELD_CALCULATION = 'field:calculation';

/** Metadata key for storing field availability functions for JSON serialization */
export const FIELD_AVAILABLE = 'field:available';

/** Metadata key for storing field relationship type information */
export const FIELD_RELATIONSHIP_TYPE = 'field:relationship:type';

// =============================================================================
// Model-related metadata keys
// =============================================================================

/** Metadata key for storing the list of fields in a model */
export const MODEL_FIELDS = 'model:fields';

/** Metadata key for storing model documentation */
export const MODEL_DOCS = 'model:docs';

/** Metadata key for storing the data source associated with a model */
export const MODEL_DATASOURCE = 'model:dataSource';

// =============================================================================
// Datasource-related metadata keys
// =============================================================================

/** Metadata key for marking fields as configured by a datasource */
export const DATASOURCE_FIELD_CONFIGURED = 'datasource:field:configured';

/** Metadata key for storing datasource type information */
export const DATASOURCE_TYPE = 'datasource:type';

// =============================================================================
// Array field-related metadata keys
// =============================================================================

/** Metadata key for storing array field names */
export const ARRAY_FIELD_NAMES = 'array:field:names';

// =============================================================================
// TypeORM-related metadata keys
// =============================================================================

/** Metadata key for TypeORM column configuration */
export const TYPEORM_COLUMN = 'typeorm:column';

/** Metadata key for TypeORM entity configuration */
export const TYPEORM_ENTITY = 'typeorm:entity';

/** Metadata key for TypeORM table configuration */
export const TYPEORM_TABLE = 'typeorm:table';

/** Metadata key for TypeORM array field configuration */
export const TYPEORM_ARRAY_FIELD = 'typeorm:array-field';

/** Metadata key for TypeORM array relation configuration */
export const TYPEORM_ARRAY_RELATION_CONFIGURED = 'typeorm:array:relation:configured';

// =============================================================================
// Field type constants for common field types
// =============================================================================

/** Field type constant for money fields */
export const FIELD_TYPE_MONEY = 'money';

/** Field type constant for text fields */
export const FIELD_TYPE_TEXT = 'text';

/** Field type constant for email fields */
export const FIELD_TYPE_EMAIL = 'email';

/** Field type constant for number fields */
export const FIELD_TYPE_NUMBER = 'number';

/** Field type constant for decimal fields */
export const FIELD_TYPE_DECIMAL = 'decimal';

/** Field type constant for integer fields */
export const FIELD_TYPE_INTEGER = 'integer';

/** Field type constant for boolean fields */
export const FIELD_TYPE_BOOLEAN = 'boolean';

/** Field type constant for datetime fields */
export const FIELD_TYPE_DATETIME = 'datetime';

/** Field type constant for choice fields */
export const FIELD_TYPE_CHOICE = 'choice';

/** Field type constant for relationship fields */
export const FIELD_TYPE_RELATIONSHIP = 'relationship';

/** Field type constant for array text fields */
export const FIELD_TYPE_ARRAY_TEXT = 'array:text';

/** Field type constant for array email fields */
export const FIELD_TYPE_ARRAY_EMAIL = 'array:email';

/** Field type constant for array html fields */
export const FIELD_TYPE_ARRAY_HTML = 'array:html';

/** Field type constant for html fields */
export const FIELD_TYPE_HTML = 'html';

/** Field type constant for longText fields */
export const FIELD_TYPE_LONG_TEXT = 'longText';

/** Field type constant for shortText fields */
export const FIELD_TYPE_SHORT_TEXT = 'shortText';

/** Field type constant for timestamp fields */
export const FIELD_TYPE_TIMESTAMP = 'timestamp';

/** Field type constant for datetimerange fields */
export const FIELD_TYPE_DATETIME_RANGE = 'datetimerange';
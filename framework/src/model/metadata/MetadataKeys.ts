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

/** Metadata key for storing field relationship load configuration */
export const FIELD_RELATIONSHIP_LOAD = 'field:relationship:load';

/** Metadata key for storing field relationship onDelete configuration */
export const FIELD_RELATIONSHIP_ON_DELETE = 'field:relationship:onDelete';

/** Metadata key for storing parent entity relationship information */
export const RELATIONSHIP_PARENT_ENTITY = 'relationship:parent:entity';

/** Metadata key for marking a field as embedded */
export const FIELD_EMBEDDED = 'field:embedded';

/** Metadata key for storing embedded field type information */
export const FIELD_EMBEDDED_TYPE = 'field:embedded:type';

/** Metadata key for storing embedded field options/configuration */
export const FIELD_EMBEDDED_OPTIONS = 'field:embedded:options';

/** Metadata key for storing embedded field documentation */
export const FIELD_EMBEDDED_DOCS = 'field:embedded:docs';

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

/** Metadata key for marking embedded fields as configured by a datasource */
export const DATASOURCE_EMBEDDED_CONFIGURED = 'datasource:embedded:configured';

/** Metadata key for storing datasource type information */
export const DATASOURCE_TYPE = 'datasource:type';

// =============================================================================
// Array field-related metadata keys
// =============================================================================

/** Metadata key for storing array field names */
export const ARRAY_FIELD_NAMES = 'array:field:names';

// =============================================================================
// Reflection/Type metadata keys
// =============================================================================

/** Metadata key for design type (used by reflect-metadata, e.g., for TypeORM relations) */
export const DESIGN_TYPE = 'design:type';

// =============================================================================
// DateTimeRange-related metadata keys
// =============================================================================

/** Metadata key for storing DateTimeRange field names */
export const DATETIME_RANGE_FIELDS = 'datetimerange:fields';

/** Metadata key for storing hidden column names for DateTimeRange fields */
export const DATETIME_RANGE_HIDDEN_COLUMNS = 'datetimerange:hiddenColumns';

/** Metadata key for marking DateTimeRange fields as using hidden columns */
export const DATETIME_RANGE_USES_HIDDEN_COLUMNS = 'datetimerange:usesHiddenColumns';

// =============================================================================
// TypeORM-related metadata keys
// =============================================================================

/** Metadata key for TypeORM column configuration */
export const TYPEORM_COLUMN = 'typeorm:column';

/** Metadata key for TypeORM entity configuration */
export const TYPEORM_ENTITY = 'typeorm:entity';

/** Metadata key for TypeORM table configuration */
export const TYPEORM_TABLE = 'typeorm:table';

export const TYPEORM_RELATIONSHIP = 'typeorm:relationship';

/** Metadata key for TypeORM relationship type configuration */
export const TYPEORM_RELATIONSHIP_TYPE = 'typeorm:relationship:type';

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

export const FIELD_TYPE_ARRAY_DATETIME_RANGE = 'array:datetimerange';

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
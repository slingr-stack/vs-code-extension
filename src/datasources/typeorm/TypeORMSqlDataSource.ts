import 'reflect-metadata';
import {
  FindOptionsWhere,
  FindManyOptions,
  FindOneOptions,
  FindOptionsOrder,
  DataSource as TypeORMDataSource,
  DataSourceOptions as TypeORMDataSourceOptions,
  UpdateResult,
  DeleteResult,
  InsertResult
} from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'typeorm';
import { DataSource, DataSourceOptions } from '../DataSource';
import { TypeORMTypeMapper } from './TypeORMTypeMapper';
import { DatabaseConfigBuilder } from './DatabaseConfigBuilder';
import { ArrayFieldManager } from './ArrayFieldManager';
import { DateTimeRangeFieldManager } from './DateTimeRangeFieldManager';
import { RelationshipFieldManager } from './RelationshipFieldManager';
// Import to ensure field type registrations happen
import '../../model/types/TypeRegistry';
import { 
  DATASOURCE_TYPE, 
  MODEL_DATASOURCE, 
  DATASOURCE_FIELD_CONFIGURED,
  DATASOURCE_EMBEDDED_CONFIGURED,
  TYPEORM_ENTITY,
  TYPEORM_TABLE,
  TYPEORM_COLUMN,
  MODEL_FIELDS,
  FIELD_TYPE,
  FIELD_TYPE_OPTIONS,
  FIELD_RELATIONSHIP_TYPE,
  FIELD_RELATIONSHIP_LOAD,
  FIELD_RELATIONSHIP_ON_DELETE,
  FIELD_EMBEDDED,
  FIELD_EMBEDDED_TYPE,
  DESIGN_TYPE
} from '../../model/metadata/MetadataKeys';

/**
 * Configuration options for TypeORM SQL data source.
 * Extends base DataSourceOptions with TypeORM-specific settings.
 */
export interface TypeORMSqlDataSourceOptions extends DataSourceOptions {
  /** Database type (postgres, mysql, sqlite, etc.) */
  type: 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'mssql' | 'oracle';

  /** Database host */
  host?: string;

  /** Database port */
  port?: number;

  /** Database username */
  username?: string;

  /** Database password */
  password?: string;

  /** Database name */
  database?: string;

  /** SQLite database file path (for SQLite only) */
  filename?: string;

  /** Enable logging of SQL queries */
  logging?: boolean;

  /** 
   * Synchronize schema automatically (for development). 
   * When not explicitly set and managed=true, defaults to true for development.
   * When not explicitly set and managed=false, defaults to false.
   */
  synchronize?: boolean;

  /** Connection timeout in milliseconds */
  connectTimeout?: number;

  /** Maximum number of connections in pool */
  maxConnections?: number;

  /** Minimum number of connections in pool */
  minConnections?: number;

  /**
   * Drop the database schema on every initialization.
   * Test-only helper to ensure a pristine schema (maps to TypeORM dropSchema option).
   */
  dropSchema?: boolean;
}

/**
 * TypeORM SQL data source implementation.
 * 
 * Provides SQL database connectivity using TypeORM with support for
 * multiple database types including PostgreSQL, MySQL, SQLite, and others.
 * 
 * Features:
 * - Automatic connection management with pooling
 * - Schema synchronization for development (when managed=true)
 * - Model and field configuration for TypeORM entities
 * - Transaction support
 * - Migration management
 * 
 * Managed Schemas:
 * When managed=true, this data source will automatically handle schema changes:
 * - In development: Uses TypeORM's synchronize feature for rapid prototyping
 * - In production: Will use proper migration scripts (future implementation)
 * 
 * @example
 * ```typescript
 * const dataSource = new TypeORMSqlDataSource({
 *   type: "postgres",
 *   managed: true,  // Enable automatic schema management
 *   host: "localhost",
 *   port: 5432,
 *   username: "admin",
 *   password: "admin",
 *   database: "myapp"
 *   // synchronize will default to true when managed=true
 * });
 * 
 * await dataSource.initialize();
 * ```
 */
export class TypeORMSqlDataSource extends DataSource {
  private typeormDataSource: TypeORMDataSource | null = null;
  private registeredModels: Set<Function> = new Set();
  private arrayFieldManager: ArrayFieldManager = new ArrayFieldManager();
  private dateTimeRangeFieldManager: DateTimeRangeFieldManager = new DateTimeRangeFieldManager();
  private relationshipFieldManager: RelationshipFieldManager = new RelationshipFieldManager();

  constructor(options: TypeORMSqlDataSourceOptions) {
    super(options);
    // Validate configuration on construction
    this.validateConfiguration();
  }

  /**
   * Validate TypeORM-specific configuration.
   * Performs early validation of synchronize flag settings to prevent
   * configuration issues that could bypass validation.
   * 
   * @throws Error if configuration is invalid
   */
  protected validateSpecificConfiguration(): void {
    const options = this.options as TypeORMSqlDataSourceOptions;
    
    // Validate synchronize flag consistency with managed schemas
    // This mirrors the logic in DatabaseConfigBuilder.determineSynchronizeFlag()
    // to catch configuration issues early
    const wouldEnableSynchronize = this.wouldEnableSynchronization(options);
    
    if (wouldEnableSynchronize && !options.managed) {
      // If synchronize would be enabled but managed=false, warn about potential issues
      if (options.synchronize === true) {
        console.warn(
          'Warning: synchronize=true with managed=false. This bypasses Slingr schema management. ' +
          'Consider setting managed=true for automatic schema management.'
        );
      }
    }
    
    // Additional validation can be added here for other TypeORM-specific configurations
  }

  /**
   * Determines if synchronization would be enabled based on current options.
   * This mirrors the logic in DatabaseConfigBuilder.determineSynchronizeFlag()
   * for early validation purposes.
   * 
   * @param options - TypeORM data source options
   * @returns true if synchronization would be enabled
   */
  private wouldEnableSynchronization(options: TypeORMSqlDataSourceOptions): boolean {
    // If synchronize is explicitly provided, use that value
    if (options.synchronize !== undefined) {
      return options.synchronize;
    }

    // For managed schemas, enable synchronize by default (for development)
    if (options.managed) {
      return true;
    }

    // For non-managed schemas, default to false
    return false;
  }

  /**
   * Initialize the TypeORM data source.
   * Sets up the TypeORM DataSource, establishes database connection,
   * and configures connection pooling using options provided during construction.
   * 
   * @returns Promise resolving to the initialized TypeORM DataSource
   */
  async initialize(): Promise<TypeORMDataSource> {
    const typeormOptions = this.options as TypeORMSqlDataSourceOptions;

    // Get all entities (models + array element entities)
    const allEntities = [
      ...Array.from(this.registeredModels),
      ...this.arrayFieldManager.getArrayElementEntities()
    ];

    // Build TypeORM configuration using the dedicated builder
    const config = DatabaseConfigBuilder.buildConfig(typeormOptions, allEntities);

    // Create and initialize TypeORM DataSource
    this.typeormDataSource = new TypeORMDataSource(config);

    try {
      await this.typeormDataSource.initialize();
      this.isInitialized = true;
      
      // Log schema management configuration
      const isSynchronizeEnabled = config.synchronize;
      const managedStatus = typeormOptions.managed ? 'managed' : 'not managed';
      
      console.log(`TypeORM DataSource initialized successfully for ${typeormOptions.type}`);

      // Keep initialization logs concise in test runs

      console.log(`Schema is ${managedStatus} by Slingr`);
      if (isSynchronizeEnabled) {
        console.log('⚠️  Schema synchronization is ENABLED - database schema will be automatically updated');
        console.log('   This is recommended for development but may cause data loss on schema changes');
      } else {
        console.log('ℹ️  Schema synchronization is DISABLED - manual schema management required');
      }
      
      return this.typeormDataSource;
    } catch (error) {
      console.error('Failed to initialize TypeORM DataSource:', error);
      throw new Error(`Failed to initialize TypeORM DataSource: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the TypeORM DataSource instance.
   * Useful for direct TypeORM operations.
   * 
   * @returns The TypeORM DataSource instance
   * @throws Error if not initialized
   */
  getTypeORMDataSource(): TypeORMDataSource {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }
    return this.typeormDataSource;
  }

  /**
   * Get all array element entities for cleanup operations.
   * 
   * @returns Array of array element entity classes
   */
  getArrayElementEntities(): Function[] {
    return this.arrayFieldManager.getArrayElementEntities();
  }

  /**
   * Gracefully disconnect from the database.
   * Closes all connections and cleans up resources.
   * 
   * @returns Promise resolving when disconnection is complete
   */
  async disconnect(): Promise<void> {
    if (this.typeormDataSource && this.isInitialized) {
      await this.typeormDataSource.destroy();
      this.isInitialized = false;
      console.log('TypeORM DataSource disconnected successfully');
    }
  }

  /**
   * Check database connection status.
   * 
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.typeormDataSource?.isInitialized ?? false;
  }

  /**
   * Get connection statistics.
   * Useful for monitoring connection pool usage.
   * 
   * @returns Connection statistics object
   */
  getConnectionStats(): { isConnected: boolean; hasActiveConnections: boolean } {
    return {
      isConnected: this.isConnected(),
      hasActiveConnections: this.typeormDataSource?.isInitialized ?? false,
    };
  }

  /**
   * Configures a model class as a TypeORM Entity.
   * 
   * @param modelClass - The model class to configure
   * @param options - Additional configuration options (e.g., table name)
   */
  configureModel(modelClass: Function, options?: any): void {
    // Register this model for inclusion in TypeORM entities
    this.registeredModels.add(modelClass);

    // Apply the TypeORM @Entity decorator
    const tableName = options?.tableName || modelClass.name.toLowerCase();
    Entity(tableName)(modelClass as any);

    // Store metadata for testing purposes
    Reflect.defineMetadata(TYPEORM_ENTITY, true, modelClass);
    if (options?.tableName) {
      Reflect.defineMetadata(TYPEORM_TABLE, options.tableName, modelClass);
    }

    // Store that this model is configured for TypeORM
    Reflect.defineMetadata(DATASOURCE_TYPE, 'typeorm-sql', modelClass);

    // Store the dataSource instance in the model metadata for later access
    Reflect.defineMetadata(MODEL_DATASOURCE, this, modelClass);
  }

  /**
   * Configures a field with appropriate TypeORM column decorators.
   * For array fields, delegates to the array field manager.
   * For DateTimeRange fields, delegates to the DateTimeRange field manager.
   * For relationship fields, delegates to the relationship field manager.
   * 
   * @param target - The prototype of the class containing the field
   * @param propertyKey - The name of the property/field
   * @param fieldType - The framework field type
   * @param fieldOptions - Field-specific options
   */
  configureField(
    target: any,
    propertyKey: string,
    fieldType: string,
    fieldOptions?: any
  ): void {
    // Skip the id field if it's already configured with @PrimaryGeneratedColumn
    if (propertyKey === 'id') {
      return; // PersistentModel already handles this with @PrimaryGeneratedColumn
    }

    // Check if this is an embedded field
    const isEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, target, propertyKey);
    if (isEmbedded || fieldType === 'embedded') {
      this.configureEmbeddedField(target, propertyKey);
      return;
    }

    // Check if this is a relationship field
    if (fieldType === 'relationship') {
      const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, target, propertyKey);
      const load = Reflect.getMetadata(FIELD_RELATIONSHIP_LOAD, target, propertyKey);
      const onDelete = Reflect.getMetadata(FIELD_RELATIONSHIP_ON_DELETE, target, propertyKey);
      
      // Get elementType from field options if it exists (for array relationships)
      const elementType = fieldOptions?.elementType;

      this.relationshipFieldManager.configureRelationshipField(
        target,
        propertyKey,
        relationshipType,
        load,
        onDelete,
        elementType
      );

      // Store that this field is configured for TypeORM
      Reflect.defineMetadata(DATASOURCE_FIELD_CONFIGURED, true, target, propertyKey);
      return;
    }

    // Check if this is an array field
    if (fieldType.startsWith('array:')) {
      this.arrayFieldManager.configureArrayField(target, propertyKey, fieldType, fieldOptions);
      return;
    }

    // Check if this is a DateTimeRange field  
    if (fieldType === 'datetimerange') {
      this.dateTimeRangeFieldManager.configureFieldColumns(target, propertyKey, fieldOptions);
      // Store that this field is configured for TypeORM
      Reflect.defineMetadata(DATASOURCE_FIELD_CONFIGURED, true, target, propertyKey);
      return;
    }

    // Map framework field types to TypeORM column types using the type mapper
    const typeMapping = TypeORMTypeMapper.getColumnType(fieldType, fieldOptions);

    // Apply the TypeORM @Column decorator
    Column(typeMapping)(target, propertyKey);

    // Store TypeORM column metadata for testing purposes
    Reflect.defineMetadata(TYPEORM_COLUMN, typeMapping, target, propertyKey);

    // Store that this field is configured for TypeORM
    Reflect.defineMetadata(DATASOURCE_FIELD_CONFIGURED, true, target, propertyKey);
  }

  /**
   * Configures an embedded field by flattening its properties into the parent entity.
   * The embedded model's fields are added as columns to the parent table with a prefix.
   * Supports nested embedded fields by flattening the entire hierarchy.
   * 
   * @param target - The prototype of the class containing the embedded field
   * @param propertyKey - The name of the embedded property
   * @param prefix - Optional prefix for column names (used for nested embedding)
   * @param rootTarget - The root target where columns should be applied (used for nested embedding)
   */
  private configureEmbeddedField(target: any, propertyKey: string, prefix: string = '', rootTarget?: any): void {
    // Get the embedded type from metadata
    const embeddedType = Reflect.getMetadata(FIELD_EMBEDDED_TYPE, target, propertyKey);

    if (!embeddedType) {
      throw new Error(`Cannot determine type for embedded field ${propertyKey}`);
    }

    // Use the provided rootTarget or default to the current target
    const columnTarget = rootTarget || target;

    // Create the full prefix for this level
    const currentPrefix = prefix ? `${prefix}_${propertyKey}` : propertyKey;

    // Get all fields from the embedded model
    const embeddedFields = Reflect.getMetadata(MODEL_FIELDS, embeddedType) || [];

    // For each field in the embedded model, create a column in the parent entity
    for (const embeddedFieldName of embeddedFields) {
      // Check if this field is also embedded (nested embedding)
      const isNestedEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, embeddedType.prototype, embeddedFieldName);
      
      if (isNestedEmbedded) {
        // Recursively configure nested embedded field
        // Use the embedded type's prototype as the target for metadata lookup,
        // but keep the original root target for column application
        this.configureEmbeddedField(embeddedType.prototype, embeddedFieldName, currentPrefix, columnTarget);
      } else {
        // Get field type and options from the embedded model
        const fieldType = Reflect.getMetadata(FIELD_TYPE, embeddedType.prototype, embeddedFieldName);
        const fieldOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, embeddedType.prototype, embeddedFieldName);

        if (!fieldType) {
          continue; // Skip fields without type information
        }

        // Create a column name with full prefix hierarchy
        const columnName = `${currentPrefix}_${embeddedFieldName}`;

        // Map the embedded field type to TypeORM column type
        const typeMapping = TypeORMTypeMapper.getColumnType(fieldType, fieldOptions);

        // Apply the TypeORM @Column decorator to the root entity
        // The column will be mapped to a property that doesn't exist on the parent class
        // but will be used for database storage
        Column({ ...typeMapping, name: columnName })(columnTarget, columnName);

        // Store metadata for the embedded field mapping on the root target
        Reflect.defineMetadata(`embedded:${currentPrefix}:${embeddedFieldName}`, {
          columnName,
          fieldType,
          fieldOptions,
          typeMapping,
          fullPath: `${currentPrefix}.${embeddedFieldName}`
        }, columnTarget);
      }
    }

    // Store that this embedded field is configured for TypeORM
    // Only store this metadata on the original target (not for recursive calls)
    if (!rootTarget) {
      Reflect.defineMetadata(DATASOURCE_FIELD_CONFIGURED, true, target, propertyKey);
      Reflect.defineMetadata(DATASOURCE_EMBEDDED_CONFIGURED, true, target, propertyKey);
    }
  }

  /**
   * Extracts embedded field values from an entity and sets them as flat properties.
   * This converts nested objects to the flat column structure expected by TypeORM.
   * Supports nested embedded objects by recursively flattening the entire hierarchy.
   * 
   * @param entity - The entity instance to process
   */
  private extractEmbeddedValues<T extends object>(entity: T): void {
    const constructor = entity.constructor;
    const fieldNames = Reflect.getMetadata(MODEL_FIELDS, constructor) || [];

    for (const fieldName of fieldNames) {
      const isEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, constructor.prototype, fieldName);

      if (isEmbedded) {
        const embeddedValue = (entity as any)[fieldName];

        if (embeddedValue && typeof embeddedValue === 'object') {
          this.extractEmbeddedValueRecursive(entity, fieldName, embeddedValue, fieldName);
        }
      }
    }
  }

  /**
   * Recursively extracts embedded field values, handling nested embedded objects.
   * 
   * @param entity - The root entity instance
   * @param fieldName - The current field name being processed
   * @param embeddedValue - The embedded object value
   * @param prefix - The current prefix for column naming
   */
  private extractEmbeddedValueRecursive<T extends object>(
    entity: T,
    fieldName: string,
    embeddedValue: any,
    prefix: string
  ): void {
    // Get the embedded type
    const embeddedType = embeddedValue.constructor;
    const embeddedFields = Reflect.getMetadata(MODEL_FIELDS, embeddedType) || [];

    // Extract each embedded field to its corresponding column
    for (const embeddedFieldName of embeddedFields) {
      const isNestedEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, embeddedType.prototype, embeddedFieldName);
      
      if (isNestedEmbedded) {
        // Handle nested embedded field recursively
        const nestedValue = embeddedValue[embeddedFieldName];
        if (nestedValue && typeof nestedValue === 'object') {
          this.extractEmbeddedValueRecursive(entity, embeddedFieldName, nestedValue, `${prefix}_${embeddedFieldName}`);
        }
      } else {
        // Handle regular field
        const columnName = `${prefix}_${embeddedFieldName}`;
        const value = embeddedValue[embeddedFieldName];

        // Set the flat column value on the entity
        (entity as any)[columnName] = value;
      }
    }
  }

  /**
   * Restores embedded field values from flat columns back to nested objects.
   * This converts the flat column structure from TypeORM back to nested objects.
   * Supports nested embedded objects by recursively reconstructing the entire hierarchy.
   * 
   * @param entity - The entity instance to process
   */
  private restoreEmbeddedValues<T extends object>(entity: T): void {
    const constructor = entity.constructor;
    const fieldNames = Reflect.getMetadata(MODEL_FIELDS, constructor) || [];

    for (const fieldName of fieldNames) {
      const isEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, constructor.prototype, fieldName);

      if (isEmbedded) {
        // Get the embedded type and its fields
        const embeddedType = Reflect.getMetadata(FIELD_EMBEDDED_TYPE, constructor.prototype, fieldName);
        
        // Recursively restore the embedded object
        const embeddedInstance = this.restoreEmbeddedValueRecursive(entity, fieldName, embeddedType, fieldName);
        
        // Set the restored embedded object
        (entity as any)[fieldName] = embeddedInstance;
      }
    }
  }

  /**
   * Recursively restores embedded field values from flat columns, handling nested embedded objects.
   * 
   * @param entity - The root entity instance
   * @param fieldName - The current field name being processed
   * @param embeddedType - The type of the embedded object to create
   * @param prefix - The current prefix for column naming
   * @returns The restored embedded object instance
   */
  private restoreEmbeddedValueRecursive<T extends object>(
    entity: T,
    fieldName: string,
    embeddedType: any,
    prefix: string
  ): any {
    const embeddedFields = Reflect.getMetadata(MODEL_FIELDS, embeddedType) || [];

    // Create a new instance of the embedded type without calling its constructor
    const embeddedInstance = Object.create(embeddedType.prototype);

    // Restore each field from its column
    for (const embeddedFieldName of embeddedFields) {
      const isNestedEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, embeddedType.prototype, embeddedFieldName);

      if (isNestedEmbedded) {
        // Handle nested embedded field recursively
        const nestedEmbeddedType = Reflect.getMetadata(FIELD_EMBEDDED_TYPE, embeddedType.prototype, embeddedFieldName);
        const nestedPrefix = `${prefix}_${embeddedFieldName}`;
        
        const nestedInstance = this.restoreEmbeddedValueRecursive(entity, embeddedFieldName, nestedEmbeddedType, nestedPrefix);
        embeddedInstance[embeddedFieldName] = nestedInstance;
      } else {
        // Handle regular field
        const columnName = `${prefix}_${embeddedFieldName}`;
        const value = (entity as any)[columnName];

        if (value !== undefined) {
          embeddedInstance[embeddedFieldName] = value;
        }

        // Clean up the flat column property
        delete (entity as any)[columnName];
      }
    }

    return embeddedInstance;
  }

  /**
   * Save an entity to the database.
   * Handles array field conversion and DateTimeRange field conversion before saving.
   * 
   * @param entity - The entity instance to save
   * @returns Promise resolving to the saved entity with generated id
   */
  async save<T extends object>(entity: T): Promise<T> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entity.constructor as any);

    // Ensure relation arrays are prepared before save so cascading can persist children
    if (typeof (entity as any)._prepareArrayRelations === 'function') {
      (entity as any)._prepareArrayRelations();
    }

    this.dateTimeRangeFieldManager.extractDateTimeRangeValues(entity);

    // Extract embedded field values to flat columns
    this.extractEmbeddedValues(entity);

    // Single save with cascades will insert/update parent and children.
    const saved = await repository.save(entity as any) as T;

    // Reload the entity from the database to ensure all transformers are applied correctly.
    // This is necessary because TypeORM's save() method returns the original entity object,
    // not one that has been loaded back with transformers applied.
    // if ((saved as any).id) {
    //   const reloaded = await repository.findOneBy({ id: (saved as any).id } as any) as T | null;
    //   if (reloaded) {
    //     // Restore embedded field values from flat columns
    //     this.restoreEmbeddedValues(reloaded);
    //     return reloaded;
    //   }
    // }

    return saved as T;
  }

  /**
   * Find entities by criteria.
   * Array fields are automatically transformed via @AfterLoad hooks.
   * 
   * @param entityClass - The entity class to search for
   * @param criteria - Search criteria (optional)
   * @returns Promise resolving to array of found entities
   * @deprecated Use findBy() or findWithOptions() instead for better TypeORM compatibility
   */
  async find<T extends object>(entityClass: new () => T, criteria?: any): Promise<T[]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    let entities: T[];

    if (criteria) {
      entities = await repository.find({ where: criteria }) as T[];
    } else {
      entities = await repository.find() as T[];
    }

    return entities;
  }

  /**
   * Find entities using TypeORM FindManyOptions.
   * Supports all TypeORM find options including where, order, relations, pagination, etc.
   * Handles array field conversion after loading.
   * 
   * @param entityClass - The entity class to search for
   * @param options - TypeORM FindManyOptions (where, order, relations, skip, take, etc.)
   * @returns Promise resolving to array of found entities
   */
  async findWithOptions<T extends object>(entityClass: new () => T, options?: FindManyOptions<T>): Promise<T[]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);

    // Handle SQLite select issue by using query builder when select is specified
    if (options?.select && (this.options as TypeORMSqlDataSourceOptions).type === 'sqlite') {
      return this.findWithSelectWorkaround(repository, options);
    }

    const entities = await repository.find(options) as T[];

    // Load array data for each entity using the array field manager
    return entities;
  }

  /**
   * Workaround for SQLite select issue with TypeORM.
   * Uses query builder instead of repository.find() when select is specified.
   */
  private async findWithSelectWorkaround<T extends object>(
    repository: any,
    options: FindManyOptions<T>
  ): Promise<T[]> {
    const queryBuilder = repository.createQueryBuilder('entity');

    // Apply select
    if (options.select) {
      const selectFields = Array.isArray(options.select) ? options.select : Object.keys(options.select);
      queryBuilder.select(selectFields.map(field => `entity.${String(field)}`));
    }

    // Apply where conditions
    if (options.where) {
      if (Array.isArray(options.where)) {
        // Handle array of where conditions (OR logic)
        options.where.forEach((whereCondition, index) => {
          Object.entries(whereCondition).forEach(([key, value]) => {
            const paramName = `${key}_${index}`;
            if (index === 0) {
              queryBuilder.where(`entity.${key} = :${paramName}`, { [paramName]: value });
            } else {
              queryBuilder.orWhere(`entity.${key} = :${paramName}`, { [paramName]: value });
            }
          });
        });
      } else {
        // Handle single where condition
        Object.entries(options.where).forEach(([key, value]) => {
          queryBuilder.andWhere(`entity.${key} = :${key}`, { [key]: value });
        });
      }
    }

    // Apply order
    if (options.order) {
      Object.entries(options.order).forEach(([key, direction]) => {
        queryBuilder.addOrderBy(`entity.${key}`, direction as 'ASC' | 'DESC');
      });
    }

    // Apply pagination
    if (options.skip !== undefined) {
      queryBuilder.offset(options.skip);
    }
    if (options.take !== undefined) {
      queryBuilder.limit(options.take);
    }

    return await queryBuilder.getMany() as T[];
  }

  /**
   * Find entities that match given WHERE conditions.
   * This matches TypeORM Repository's findBy method signature.
   * 
   * @param entityClass - The entity class to search for
   * @param where - WHERE conditions
   * @returns Promise resolving to array of found entities
   */
  async findBy<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entities = await repository.findBy(where) as T[];

    // Restore embedded field values from flat columns for each entity
    entities.forEach(entity => this.restoreEmbeddedValues(entity));

    // Load array data for each entity using the array field manager
    return entities;
  }

  /**
   * Find first entity that matches given WHERE conditions.
   * Returns null if no entity found.
   * 
   * @param entityClass - The entity class to search for
   * @param where - WHERE conditions
   * @returns Promise resolving to found entity or null
   */
  async findOneBy<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entity = await repository.findOneBy(where) as T | null;

    if (!entity) {
      return null;
    }

    // Restore embedded field values from flat columns
    this.restoreEmbeddedValues(entity);

    // Load array data for the entity using the array field manager
    return entity;
  }

  /**
   * Find first entity using TypeORM FindOneOptions.
   * Returns null if no entity found.
   * 
   * @param entityClass - The entity class to search for
   * @param options - TypeORM FindOneOptions
   * @returns Promise resolving to found entity or null
   */
  async findOne<T extends object>(entityClass: new () => T, options: FindOneOptions<T>): Promise<T | null> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);

    // Handle SQLite select issue by using query builder when select is specified
    if (options?.select && (this.options as TypeORMSqlDataSourceOptions).type === 'sqlite') {
      const results = await this.findWithSelectWorkaround(repository, { ...options, take: 1 });
      return results.length > 0 ? (results[0] as T) : null;
    }

    const entity = await repository.findOne(options) as T | null;

    if (!entity) {
      return null;
    }

    // Load array data for the entity using the array field manager
    return entity;
  }

  /**
   * Find first entity that matches given WHERE conditions.
   * Throws error if no entity found.
   * 
   * @param entityClass - The entity class to search for
   * @param where - WHERE conditions
   * @returns Promise resolving to found entity
   * @throws Error if entity not found
   */
  async findOneByOrFail<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entity = await repository.findOneByOrFail(where) as T;

    // Restore embedded field values from flat columns
    this.restoreEmbeddedValues(entity);

    // Load array data for the entity using the array field manager
    return entity;
  }

  /**
   * Find first entity using TypeORM FindOneOptions.
   * Throws error if no entity found.
   * 
   * @param entityClass - The entity class to search for
   * @param options - TypeORM FindOneOptions
   * @returns Promise resolving to found entity
   * @throws Error if entity not found
   */
  async findOneOrFail<T extends object>(entityClass: new () => T, options: FindOneOptions<T>): Promise<T> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entity = await repository.findOneOrFail(options) as T;

    // Load array data for the entity using the array field manager
    return entity;
  }

  /**
   * Find entities and count matching the given options.
   * Returns tuple of [entities, totalCount].
   * 
   * @param entityClass - The entity class to search for
   * @param options - TypeORM FindManyOptions
   * @returns Promise resolving to [entities, count] tuple
   */
  async findAndCount<T extends object>(entityClass: new () => T, options?: FindManyOptions<T>): Promise<[T[], number]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const [entities, count] = await repository.findAndCount(options) as [T[], number];

    return [entities, count];
  }

  /**
   * Find entities and count matching the given WHERE conditions.
   * Returns tuple of [entities, totalCount].
   * 
   * @param entityClass - The entity class to search for
   * @param where - WHERE conditions
   * @returns Promise resolving to [entities, count] tuple
   */
  async findAndCountBy<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<[T[], number]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const [entities, count] = await repository.findAndCountBy(where) as [T[], number];

    return [entities, count];
  }

  /**
   * Check if any entity exists that matches the given options.
   * 
   * @param entityClass - The entity class to check
   * @param options - TypeORM FindManyOptions
   * @returns Promise resolving to true if entity exists, false otherwise
   */
  async exists<T extends object>(entityClass: new () => T, options?: FindManyOptions<T>): Promise<boolean> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.exists(options);
  }

  /**
   * Check if any entity exists that matches the given WHERE conditions.
   * 
   * @param entityClass - The entity class to check
   * @param where - WHERE conditions
   * @returns Promise resolving to true if entity exists, false otherwise
   */
  async existsBy<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<boolean> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.existsBy(where);
  }

  /**
   * Count entities matching the given options.
   * 
   * @param entityClass - The entity class to count
   * @param options - TypeORM FindManyOptions
   * @returns Promise resolving to count of entities
   */
  async countWithOptions<T extends object>(entityClass: new () => T, options?: FindManyOptions<T>): Promise<number> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.count(options);
  }

  /**
   * Count entities matching the given WHERE conditions.
   * 
   * @param entityClass - The entity class to count
   * @param where - WHERE conditions
   * @returns Promise resolving to count of entities
   */
  async countBy<T extends object>(entityClass: new () => T, where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<number> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.countBy(where);
  }

  /**
   * Update entities matching the given criteria.
   * 
   * @param entityClass - The entity class to update
   * @param criteria - Criteria to match entities for update
   * @param partialEntity - Partial entity with fields to update
   * @returns Promise resolving to UpdateResult
   */
  async update<T extends object>(
    entityClass: new () => T,
    criteria: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    partialEntity: Partial<T>
  ): Promise<UpdateResult> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.update(criteria as any, partialEntity as any);
  }

  /**
   * Delete entities matching the given criteria.
   * 
   * @param entityClass - The entity class to delete
   * @param criteria - Criteria to match entities for deletion (ID, IDs, or WHERE conditions)
   * @returns Promise resolving to DeleteResult
   */
  async delete<T extends object>(
    entityClass: new () => T,
    criteria: string | string[] | number | number[] | Date | Date[] | ObjectId | ObjectId[] | FindOptionsWhere<T> | FindOptionsWhere<T>[]
  ): Promise<DeleteResult> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.delete(criteria as any);
  }

  /**
   * Soft delete entities matching the given criteria.
   * 
   * @param entityClass - The entity class to soft delete
   * @param criteria - Criteria to match entities for soft deletion
   * @returns Promise resolving to UpdateResult
   */
  async softDelete<T extends object>(entityClass: new () => T, criteria: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<UpdateResult> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.softDelete(criteria as any);
  }

  /**
   * Restore soft deleted entities matching the given criteria.
   * 
   * @param entityClass - The entity class to restore
   * @param criteria - Criteria to match entities for restoration
   * @returns Promise resolving to UpdateResult
   */
  async restore<T extends object>(entityClass: new () => T, criteria: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<UpdateResult> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.restore(criteria as any);
  }

  /**
   * Insert a new entity or entities.
   * 
   * @param entityClass - The entity class to insert
   * @param entity - Entity or entities to insert
   * @returns Promise resolving to InsertResult
   */
  async insert<T extends object>(entityClass: new () => T, entity: Partial<T> | Partial<T>[]): Promise<InsertResult> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    return await repository.insert(entity as any);
  }
  /**
   * Find first entity that matches given id.
   * If entity was not found in the database - returns null.
   * 
   * @param entityClass - The entity class to search for
   * @param id - The id of the entity to find
   * @returns Promise resolving to the found entity or null
   */
  async findOneById<T extends object>(entityClass: new () => T, id: number | string | Date): Promise<T | null> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);

    // Get the table name for this entity
    const metadata = this.typeormDataSource.getMetadata(entityClass);
    const tableName = metadata.tableName;

    // Use raw query to get the basic entity data
    const result = await this.typeormDataSource.query(
      `SELECT * FROM ${tableName} WHERE id = ?`,
      [id]
    );

    if (!result || result.length === 0) {
      return null;
    }

    // Create entity instance from raw data
    const entity = repository.create(result[0]) as T;

    // Since we set eager: true in relationship configuration, TypeORM should load relationships automatically
    // But our current query doesn't include joins. Let's use TypeORM's built-in findOne with relations
    if (this.typeormDataSource) {
      try {
        const entityWithRelations = await repository.findOne({
          where: { id } as any,
          loadEagerRelations: true // This will load all eager relationships
        });

        if (entityWithRelations) {
          console.log(`Loaded entity with eager relations:`, Object.keys(entityWithRelations));
          return entityWithRelations;
        }
      } catch (error) {
        console.warn('Failed to load with eager relations, falling back to manual loading:', error);
      }
    }

    // Fallback: manually load relationships that are marked as eager
    await this.loadEagerRelationships(entity, entityClass, metadata);

    return entity;
  }

  /**
   * Manually load eager relationships for an entity to avoid TypeORM's broken join resolution
   */
  private async loadEagerRelationships<T extends object>(entity: T, entityClass: new () => T, metadata: any): Promise<void> {
    if (!this.typeormDataSource) return;

    console.log(`Loading eager relationships for ${entityClass.name}`);

    // Get relationship fields from our field metadata
    const relationshipFields = Reflect.getMetadata(MODEL_FIELDS, entityClass) || [];
    console.log(`All fields for ${entityClass.name}:`, relationshipFields);

    for (const fieldName of relationshipFields) {
      // Check if this field is a relationship
      const fieldType = Reflect.getMetadata(FIELD_TYPE, entityClass.prototype, fieldName);
      
      if (fieldType === 'relationship') {
        console.log(`Found relationship field: ${fieldName}`);

        // Get relationship-specific metadata
        const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, entityClass.prototype, fieldName);
        const relationshipLoad = Reflect.getMetadata(FIELD_RELATIONSHIP_LOAD, entityClass.prototype, fieldName);
        const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, entityClass.prototype, fieldName);
        // Only load reference relationships that are eager (composition handles differently)
        if (relationshipType === 'reference' && relationshipLoad !== false) {
          console.log(`Loading reference relationship ${fieldName}`);
          try {
            const relationshipMetadata = {
              type: relationshipType,
              load: relationshipLoad,
              elementType: fieldTypeOptions?.elementType
            };
            await this.loadReferenceRelationship(entity, fieldName, relationshipMetadata);
          } catch (error) {
            console.warn(`Failed to load relationship ${fieldName}:`, error);
          }
        } else {
          console.log(`Skipping relationship ${fieldName}: type=${relationshipType}, load=${relationshipLoad}`);
        }
      }
    }
  }

  /**
   * Load a reference relationship using the foreign key
   */
  private async loadReferenceRelationship<T extends object>(entity: T, fieldName: string, relationshipMetadata: any): Promise<void> {
    if (!this.typeormDataSource) return;

    // Get the foreign key value - TypeORM should use the explicit column name we specified
    const foreignKeyName = `${fieldName}Id`;
    const foreignKeyValue = (entity as any)[foreignKeyName];

    console.log(`Available entity keys: ${Object.keys(entity)}`);
    console.log(`Loading relationship ${fieldName}, foreign key: ${foreignKeyName} = ${foreignKeyValue}`);

    if (foreignKeyValue && foreignKeyName) {
      // Get the target entity class - try elementType first, then fall back to design:type
      let targetClass;

      if (relationshipMetadata.elementType && typeof relationshipMetadata.elementType === 'function') {
        targetClass = relationshipMetadata.elementType();
      } else {
        // Fall back to TypeScript's design:type metadata
        const entityClass = entity.constructor;
        targetClass = Reflect.getMetadata(DESIGN_TYPE, entityClass.prototype, fieldName);
      }

      console.log(`Target class for ${fieldName}:`, targetClass?.name);

      if (targetClass) {
        try {
          const targetRepository = this.typeormDataSource.getRepository(targetClass);
          const relatedEntity = await targetRepository.findOneBy({ id: foreignKeyValue });

          console.log(`Found related entity for ${fieldName}:`, relatedEntity);

          if (relatedEntity) {
            (entity as any)[fieldName] = relatedEntity;
          }
        } catch (error) {
          console.warn(`Error loading related entity for ${fieldName}:`, error);
        }
      } else {
        console.warn(`Could not determine target class for relationship ${fieldName}`);
      }
    } else {
      console.log(`No foreign key value for ${fieldName}`);
    }
  }

  /**
   * Find entities with ids.
   * Optionally find options or conditions can be applied.
   * 
   * @param entityClass - The entity class to search for
   * @param ids - Array of ids to find
   * @returns Promise resolving to array of found entities
   * @deprecated use `findBy` method instead in conjunction with `In` operator, for example:
   * 
   * .findBy({
   *     id: In([1, 2, 3])
   * })
   */
  async findByIds<T extends object>(entityClass: new () => T, ids: any[]): Promise<T[]> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entities = await repository.findByIds(ids) as T[];

    // Load array data for each entity using the array field manager
    return entities
  }

  /**
   * Count entities matching simple criteria (deprecated in favor of countBy or countWithOptions).
   * 
   * @param entityClass - The entity class to count
   * @param criteria - Search criteria (optional)
   * @returns Promise resolving to count of entities
   * @deprecated Use countBy() or countWithOptions() instead for better TypeORM compatibility
   */
  async count<T extends object>(entityClass: new () => T, criteria?: any): Promise<number> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    if (criteria) {
      return await repository.count({ where: criteria });
    }
    return await repository.count();
  }

}

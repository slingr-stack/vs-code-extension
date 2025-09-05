import 'reflect-metadata';
import { DataSource as TypeORMDataSource, DataSourceOptions as TypeORMDataSourceOptions } from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { DataSource, DataSourceOptions } from '../DataSource';
import { TypeORMTypeMapper } from './TypeORMTypeMapper';
import { DatabaseConfigBuilder } from './DatabaseConfigBuilder';
import { ArrayFieldManager } from './ArrayFieldManager';
// Import to ensure field type registrations happen
import '../../model/types/TypeRegistry';

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

  /** Synchronize schema automatically (for development) */
  synchronize?: boolean;

  /** Connection timeout in milliseconds */
  connectTimeout?: number;

  /** Maximum number of connections in pool */
  maxConnections?: number;

  /** Minimum number of connections in pool */
  minConnections?: number;
}

/**
 * TypeORM SQL data source implementation.
 * 
 * Provides SQL database connectivity using TypeORM with support for
 * multiple database types including PostgreSQL, MySQL, SQLite, and others.
 * 
 * Features:
 * - Automatic connection management with pooling
 * - Schema synchronization for development
 * - Model and field configuration for TypeORM entities
 * - Transaction support
 * - Migration management
 * 
 * @example
 * ```typescript
 * const dataSource = new TypeORMSqlDataSource({
 *   type: "postgres",
 *   managed: true,
 *   host: "localhost",
 *   port: 5432,
 *   username: "admin",
 *   password: "admin",
 *   database: "myapp"
 * });
 * 
 * await dataSource.initialize();
 * ```
 */
export class TypeORMSqlDataSource extends DataSource {
  private typeormDataSource: TypeORMDataSource | null = null;
  private registeredModels: Set<Function> = new Set();
  private arrayFieldManager: ArrayFieldManager = new ArrayFieldManager();

  constructor(options: TypeORMSqlDataSourceOptions) {
    super(options);
  }

  /**
   * Initialize the TypeORM data source.
   * Sets up the TypeORM DataSource, establishes database connection,
   * and configures connection pooling.
   * 
   * @param options - TypeORM-specific configuration options
   * @returns Promise resolving to the initialized TypeORM DataSource
   */
  async initialize(options: DataSourceOptions): Promise<TypeORMDataSource> {
    const typeormOptions = options as TypeORMSqlDataSourceOptions;

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
      console.log(`TypeORM DataSource initialized successfully for ${typeormOptions.type}`);
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
    Reflect.defineMetadata('typeorm:entity', true, modelClass);
    if (options?.tableName) {
      Reflect.defineMetadata('typeorm:table', options.tableName, modelClass);
    }

    // Store that this model is configured for TypeORM
    Reflect.defineMetadata('datasource:type', 'typeorm-sql', modelClass);
    
    // Store the dataSource instance in the model metadata for later access
    Reflect.defineMetadata('model:dataSource', this, modelClass);
  }

  /**
   * Configures a field with appropriate TypeORM column decorators.
   * For array fields, delegates to the array field manager.
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

    // Check if this is an array field
    if (fieldType.startsWith('array:')) {
      this.arrayFieldManager.configureArrayField(target, propertyKey, fieldType, fieldOptions);
      return;
    }

    // Map framework field types to TypeORM column types using the type mapper
    const typeMapping = TypeORMTypeMapper.getColumnType(fieldType, fieldOptions);

    // Apply the TypeORM @Column decorator
    Column(typeMapping)(target, propertyKey);

    // Store TypeORM column metadata for testing purposes
    Reflect.defineMetadata('typeorm:column', typeMapping, target, propertyKey);

    // Store that this field is configured for TypeORM
    Reflect.defineMetadata('datasource:field:configured', true, target, propertyKey);
  }

  /**
   * Save an entity to the database.
   * Handles array field conversion before saving using the array field manager.
   * 
   * @param entity - The entity instance to save
   * @returns Promise resolving to the saved entity with generated id
   */
  async save<T extends object>(entity: T): Promise<T> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entity.constructor as any);
    
    // If entity has an id, we need to handle updates differently
    const isUpdate = !!(entity as any).id;
    
    // Preserve array values before extracting main entity fields
    const arrayValues = this.arrayFieldManager.extractArrayValues(entity);
    
    // Save the main entity first (without arrays converted)
    const mainEntityToSave = this.arrayFieldManager.extractMainEntityFields(entity);
    const savedMainEntity = await repository.save(mainEntityToSave as any) as T;
    
    // Now save array fields using the preserved values
    await this.arrayFieldManager.saveArrayFields(entity, arrayValues, savedMainEntity, this.typeormDataSource);
    
    // Return the entity with arrays loaded
    const result = await this.findById(entity.constructor as any, (savedMainEntity as any).id);
    return result as T; // We know it exists since we just saved it
  }

  /**
   * Find entities by criteria.
   * Array fields are automatically transformed via @AfterLoad hooks.
   * 
   * @param entityClass - The entity class to search for
   * @param criteria - Search criteria (optional)
   * @returns Promise resolving to array of found entities
   */
  async find<T extends object>(entityClass: new() => T, criteria?: any): Promise<T[]> {
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
    
    // Array fields are automatically transformed via @AfterLoad hooks
    return entities;
  }

  /**
   * Find a single entity by id.
   * Array fields are automatically transformed via @AfterLoad hooks.
   * 
   * @param entityClass - The entity class to search for
   * @param id - The id of the entity to find
   * @returns Promise resolving to the found entity or null
   */
  async findById<T extends object>(entityClass: new() => T, id: string): Promise<T | null> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    const entity = await repository.findOne({ where: { id } as any }) as T | null;
    
    if (!entity) {
      return null;
    }
    
    // Array fields are automatically transformed via @AfterLoad hooks
    return entity;
  }

  /**
   * Delete an entity by id.
   * 
   * @param entityClass - The entity class
   * @param id - The id of the entity to delete
   * @returns Promise resolving to delete result
   */
  async deleteById<T extends object>(entityClass: new() => T, id: string): Promise<void> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entityClass);
    await repository.delete(id);
  }

  /**
   * Count entities matching criteria.
   * 
   * @param entityClass - The entity class to count
   * @param criteria - Search criteria (optional)
   * @returns Promise resolving to count of entities
   */
  async count<T extends object>(entityClass: new() => T, criteria?: any): Promise<number> {
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

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

    // Ensure relation arrays are prepared before save so cascading can persist children
    if (typeof (entity as any)._prepareArrayRelations === 'function') {
      (entity as any)._prepareArrayRelations();
    }

    // Single save with cascades will insert/update parent and children.
    const saved = await repository.save(entity as any) as T;

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
    const entity = await repository.findOneById(id as any) as T | null;

    if (!entity) {
      return null;
    }

    return entity;
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

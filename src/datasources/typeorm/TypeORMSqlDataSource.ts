import 'reflect-metadata';
import { DataSource as TypeORMDataSource, DataSourceOptions as TypeORMDataSourceOptions } from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { DataSource, DataSourceOptions } from '../DataSource';

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

    // Build TypeORM DataSource configuration dynamically based on database type
    let config: any = {
      type: typeormOptions.type,
      logging: typeormOptions.logging ?? false,
      synchronize: typeormOptions.synchronize ?? typeormOptions.managed,
      entities: Array.from(this.registeredModels), // Include registered entities
    };

    // SQLite-specific configuration
    if (typeormOptions.type === 'sqlite') {
      config.database = typeormOptions.filename || ':memory:';
    } else {
      // Configuration for other database types
      if (typeormOptions.host) config.host = typeormOptions.host;
      if (typeormOptions.port) config.port = typeormOptions.port;
      if (typeormOptions.username) config.username = typeormOptions.username;
      if (typeormOptions.password) config.password = typeormOptions.password;
      if (typeormOptions.database) config.database = typeormOptions.database;
    }

    // Connection pooling configuration
    if (typeormOptions.maxConnections || typeormOptions.minConnections) {
      config.pool = {
        max: typeormOptions.maxConnections || 10,
        min: typeormOptions.minConnections || 1,
      };
    }

    // Connection timeout
    if (typeormOptions.connectTimeout) {
      config.connectTimeout = typeormOptions.connectTimeout;
    }

    // Create and initialize TypeORM DataSource
    this.typeormDataSource = new TypeORMDataSource(config as TypeORMDataSourceOptions);

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

    // Map framework field types to TypeORM column types
    const typeMapping = this.getTypeOrmColumnType(fieldType, fieldOptions);

    // Apply the TypeORM @Column decorator
    Column(typeMapping)(target, propertyKey);

    // Store TypeORM column metadata for testing purposes
    Reflect.defineMetadata('typeorm:column', typeMapping, target, propertyKey);

    // Store that this field is configured for TypeORM
    Reflect.defineMetadata('datasource:field:configured', true, target, propertyKey);
  }

  /**
   * Maps framework field types to TypeORM column configurations.
   * 
   * @param fieldType - The framework field type
   * @param fieldOptions - Field-specific options
   * @returns TypeORM column configuration
   */
  private getTypeOrmColumnType(fieldType: string, fieldOptions?: any): any {
    // Determine if the field should be nullable based on the required option
    const isRequired = fieldOptions?.required === true;
    const nullable = !isRequired;

    switch (fieldType) {
      case 'text':
      case 'email':
      case 'html':
        return {
          type: fieldOptions?.maxLength && fieldOptions.maxLength <= 255 ? 'varchar' : 'text',
          length: fieldOptions?.maxLength <= 255 ? fieldOptions.maxLength : undefined,
          nullable: nullable
        };

      case 'integer':
        return {
          type: 'int',
          nullable: nullable
        };

      case 'number':
      case 'decimal':
        return {
          type: 'decimal',
          precision: fieldOptions?.precision || 10,
          scale: fieldOptions?.decimals || 2,
          nullable: nullable
        };

      case 'boolean':
        return {
          type: 'boolean',
          nullable: nullable
        };

      case 'datetime':
        return {
          type: 'datetime',
          nullable: nullable
        };

      case 'money':
        return {
          type: 'decimal',
          precision: 19,
          scale: fieldOptions?.decimals || 2,
          nullable: nullable
        };

      case 'choice':
        return {
          type: 'varchar',
          length: 50,
          nullable: nullable
        };

      default:
        // Default to text for unknown types
        return {
          type: 'text',
          nullable: nullable
        };
    }
  }

  /**
   * Save an entity to the database.
   * 
   * @param entity - The entity instance to save
   * @returns Promise resolving to the saved entity with generated id
   */
  async save<T extends object>(entity: T): Promise<T> {
    if (!this.typeormDataSource) {
      throw new Error('TypeORM DataSource not initialized. Call initialize() first.');
    }

    const repository = this.typeormDataSource.getRepository(entity.constructor as any);
    return await repository.save(entity as any) as T;
  }

  /**
   * Find entities by criteria.
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
    if (criteria) {
      return await repository.find({ where: criteria }) as T[];
    }
    return await repository.find() as T[];
  }

  /**
   * Find a single entity by id.
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
    return await repository.findOne({ where: { id } as any }) as T | null;
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

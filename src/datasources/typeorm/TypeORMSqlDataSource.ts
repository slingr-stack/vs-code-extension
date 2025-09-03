import 'reflect-metadata';
import { DataSource as TypeORMDataSource, DataSourceOptions as TypeORMDataSourceOptions } from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
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
  private arrayElementEntities: Map<string, Function> = new Map();

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
      entities: [...Array.from(this.registeredModels), ...Array.from(this.arrayElementEntities.values())], // Include registered entities and array entities
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
   * For array fields, creates a separate entity and sets up a one-to-many relationship.
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
      this.configureArrayField(target, propertyKey, fieldType, fieldOptions);
      return;
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
   * Configures an array field by creating a separate entity and storing metadata.
   * Note: We don't use TypeORM relationships for dynamically created array entities.
   * 
   * @param target - The prototype of the class containing the field
   * @param propertyKey - The name of the property/field
   * @param fieldType - The framework field type (e.g., 'array:text', 'array:html')
   * @param fieldOptions - Field-specific options
   */
  private configureArrayField(
    target: any,
    propertyKey: string,
    fieldType: string,
    fieldOptions?: any
  ): void {
    const parentEntityName = target.constructor.name;
    const baseFieldType = fieldType.replace('array:', ''); // e.g., 'text', 'html', 'email'
    
    // Create a unique key for this array field
    const arrayEntityKey = `${parentEntityName}_${propertyKey}`;
    
    // Check if we've already created an entity for this array field
    if (!this.arrayElementEntities.has(arrayEntityKey)) {
      const arrayElementEntity = this.createArrayElementEntity(
        parentEntityName,
        propertyKey,
        baseFieldType,
        fieldOptions
      );
      this.arrayElementEntities.set(arrayEntityKey, arrayElementEntity);
    }
    
    // Store metadata about this array field without configuring TypeORM relationships
    Reflect.defineMetadata('typeorm:array-field', {
      elementEntityKey: arrayEntityKey,
      baseFieldType: baseFieldType,
      options: fieldOptions
    }, target, propertyKey);
    
    // Store that this field is configured for TypeORM
    Reflect.defineMetadata('datasource:field:configured', true, target, propertyKey);
  }

  /**
   * Creates a new entity class for array elements.
   * 
   * @param parentEntityName - Name of the parent entity
   * @param fieldName - Name of the array field
   * @param baseFieldType - Base type of array elements (e.g., 'text', 'html')
   * @param fieldOptions - Field-specific options
   * @returns The created entity class
   */
  private createArrayElementEntity(
    parentEntityName: string,
    fieldName: string,
    baseFieldType: string,
    fieldOptions?: any
  ): Function {
    const tableName = `${parentEntityName.toLowerCase()}_${fieldName}`;
    const entityName = `${parentEntityName}_${fieldName}`;
    
    // Dynamically create the array element entity class
    const ArrayElementEntity = class {
      id!: string;
      parentId!: string;
      value!: string;
      index!: number;
    };
    
    // Set the class name for better debugging
    Object.defineProperty(ArrayElementEntity, 'name', { value: entityName });
    
    // Apply TypeORM decorators
    Entity(tableName)(ArrayElementEntity);
    
    // Configure the id field
    PrimaryGeneratedColumn('uuid')(ArrayElementEntity.prototype, 'id');
    
    // Configure the parentId field (foreign key)
    Column({ type: 'uuid', name: 'parent_id' })(ArrayElementEntity.prototype, 'parentId');
    
    // Configure the value field based on the base field type
    const valueColumnConfig = this.getArrayElementColumnConfig(baseFieldType, fieldOptions);
    Column(valueColumnConfig)(ArrayElementEntity.prototype, 'value');
    
    // Configure the index field to preserve array order
    Column({ type: 'int', name: 'array_index' })(ArrayElementEntity.prototype, 'index');
    
    return ArrayElementEntity;
  }

  /**
   * Gets the column configuration for array element values based on the base field type.
   * 
   * @param baseFieldType - The base field type (e.g., 'text', 'html', 'email')
   * @param fieldOptions - Field-specific options
   * @returns TypeORM column configuration
   */
  private getArrayElementColumnConfig(baseFieldType: string, fieldOptions?: any): any {
    switch (baseFieldType) {
      case 'text':
      case 'email':
      case 'html':
        return {
          type: fieldOptions?.maxLength && fieldOptions.maxLength <= 255 ? 'varchar' : 'text',
          length: fieldOptions?.maxLength <= 255 ? fieldOptions.maxLength : undefined,
          nullable: false
        };
      
      case 'integer':
        return {
          type: 'int',
          nullable: false
        };
      
      case 'number':
      case 'decimal':
        return {
          type: 'decimal',
          precision: fieldOptions?.precision || 10,
          scale: fieldOptions?.decimals || 2,
          nullable: false
        };
      
      case 'boolean':
        return {
          type: 'boolean',
          nullable: false
        };
      
      case 'datetime':
        return {
          type: 'datetime',
          nullable: false
        };
      
      case 'money':
        return {
          type: 'decimal',
          precision: 19,
          scale: fieldOptions?.decimals || 2,
          nullable: false
        };
      
      case 'choice':
        return {
          type: 'varchar',
          length: 50,
          nullable: false
        };
      
      default:
        return {
          type: 'text',
          nullable: false
        };
    }
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
   * Handles array field conversion before saving.
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
    
    if (isUpdate) {
      // For updates, first handle array field deletion
      await this.handleArrayFieldsForUpdate(entity);
    }
    
    // Preserve array values before extracting main entity fields
    const arrayValues = this.extractArrayValues(entity);
    
    // Save the main entity first (without arrays converted)
    const mainEntityToSave = this.extractMainEntityFields(entity);
    const savedMainEntity = await repository.save(mainEntityToSave as any) as T;
    
    // Now save array fields using the preserved values
    await this.saveArrayFields(entity, arrayValues, savedMainEntity);
    
    // Return the entity with arrays loaded
    const result = await this.findById(entity.constructor as any, (savedMainEntity as any).id);
    return result as T; // We know it exists since we just saved it
  }

  /**
   * Handles array field updates by removing old array elements.
   */
  private async handleArrayFieldsForUpdate<T extends object>(entity: T): Promise<void> {
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
        const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
        
        if (ArrayElementEntity) {
          const repository = this.typeormDataSource!.getRepository(ArrayElementEntity as any);
          // Delete existing array elements for this entity
          await repository.delete({ parentId: (entity as any).id });
        }
      }
    }
  }

  /**
   * Extracts array values from an entity before processing.
   */
  private extractArrayValues<T extends object>(entity: T): Record<string, any[]> {
    const arrayValues: Record<string, any[]> = {};
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayValue = (entity as any)[fieldName];
        if (Array.isArray(arrayValue)) {
          arrayValues[fieldName] = arrayValue;
        }
      }
    }
    
    return arrayValues;
  }

  /**
   * Extracts main entity fields (excluding arrays) for saving.
   */
  private extractMainEntityFields<T extends object>(entity: T): T {
    const entityCopy = { ...entity };
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        // Remove array fields from the main entity
        delete (entityCopy as any)[fieldName];
      }
    }
    
    return entityCopy;
  }

  /**
   * Saves array fields as separate entities.
   */
  private async saveArrayFields<T extends object>(originalEntity: T, arrayValues: Record<string, any[]>, savedEntity: T): Promise<void> {
    const entityClass = originalEntity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayValue = arrayValues[fieldName];
        
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          const arrayMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
          const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
          
          if (ArrayElementEntity) {
            const repository = this.typeormDataSource!.getRepository(ArrayElementEntity as any);
            
            // Create array element entities using the saved entity's ID
            const elementEntities = arrayValue.map((value, index) => {
              const elementEntity = new (ArrayElementEntity as any)();
              elementEntity.parentId = (savedEntity as any).id;
              elementEntity.value = value;
              elementEntity.index = index;
              return elementEntity;
            });
            
            // Save all array elements
            await repository.save(elementEntities);
          }
        }
      }
    }
  }

  /**
   * Find entities by criteria.
   * Handles array field conversion after loading.
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
    
    // Load array data for each entity
    return await Promise.all(entities.map(entity => this.loadArrayFields(entity)));
  }

  /**
   * Find a single entity by id.
   * Handles array field conversion after loading.
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
    
    // Load array data for the entity
    return await this.loadArrayFields(entity);
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

  /**
   * Loads array fields for an entity by querying array element entities.
   * 
   * @param entity - The entity to load array fields for
   * @returns The entity with array fields populated
   */
  private async loadArrayFields<T extends object>(entity: T): Promise<T> {
    const entityCopy = { ...entity };
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
        const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
        
        if (ArrayElementEntity) {
          const repository = this.typeormDataSource!.getRepository(ArrayElementEntity as any);
          
          // Load array elements for this entity, ordered by index
          const elements = await repository.find({
            where: { parentId: (entity as any).id },
            order: { index: 'ASC' }
          });
          
          // Extract values into an array
          (entityCopy as any)[fieldName] = elements.map(element => element.value);
        }
      }
    }
    
    return entityCopy;
  }

  
  
}

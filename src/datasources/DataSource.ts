import 'reflect-metadata';

/**
 * Base configuration options for all data sources.
 * All data source specific options should extend from this interface.
 */
export interface DataSourceOptions {
  /**
   * Indicates if schema migrations have to be managed by Slingr.
   * When true, the framework will handle schema creation and updates automatically.
   * 
   * For development environments, this enables automatic schema synchronization.
   * For production environments, this will use proper migration scripts (future implementation).
   */
  managed: boolean;
}

/**
 * Abstract base class for all data sources.
 * 
 * Data sources provide persistent storage capabilities for models.
 * Each data source implementation should handle:
 * - Connection management
 * - Model configuration (adding framework-specific decorators)
 * - Field configuration for persistence
 * 
 * @abstract
 */
export abstract class DataSource {
  protected options: DataSourceOptions;
  protected isInitialized: boolean = false;

  constructor(options: DataSourceOptions) {
    this.options = options;
  }

  /**
   * Initialize the data source with the provided options.
   * This method should establish connections, set up the data source,
   * and prepare it for use.
   * 
   * @param options - Configuration options for the data source
   * @returns Promise that resolves when initialization is complete
   */
  abstract initialize(options: DataSourceOptions): Promise<any>;

  /**
   * Check if the data source has been initialized.
   * 
   * @returns true if the data source is initialized, false otherwise
   */
  public getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if this data source supports managed schemas.
   * Subclasses should override this method if they don't support managed schemas.
   * 
   * @returns true if managed schemas are supported, false otherwise
   */
  public supportsManagedSchemas(): boolean {
    return true; // Default to true, subclasses can override
  }

  /**
   * Validate data source configuration.
   * Checks if managed schemas are supported when requested and validates
   * configuration consistency.
   * 
   * @throws Error if configuration is invalid
   */
  protected validateConfiguration(): void {
    if (this.options.managed && !this.supportsManagedSchemas()) {
      throw new Error(
        `This data source does not support managed schemas. Set 'managed: false' or use a different data source.`
      );
    }
    
    // Allow subclasses to perform additional validation
    this.validateSpecificConfiguration();
  }

  /**
   * Validate data source specific configuration.
   * Override this method in subclasses to add data source specific validation.
   * This is called during construction to catch configuration issues early.
   * 
   * @throws Error if configuration is invalid
   */
  protected validateSpecificConfiguration(): void {
    // Default implementation - no additional validation
  }

  /**
   * Get the current data source options.
   * 
   * @returns The data source configuration options
   */
  public getOptions(): DataSourceOptions {
    return this.options;
  }

  /**
   * Configures a model class with the necessary decorators and metadata
   * for the specific data source implementation.
   * 
   * This method is called by the @Model decorator when a dataSource is specified
   * in the model options.
   * 
   * @param modelClass - The class constructor of the model to configure
   * @param options - Additional configuration options for the model
   * 
   * @example
   * ```typescript
   * // Called automatically by @Model decorator
   * dataSource.configureModel(UserClass, { tableName: 'users' });
   * ```
   */
  abstract configureModel(modelClass: Function, options?: any): void;

  /**
   * Configures a field with the necessary decorators and metadata
   * for the specific data source implementation.
   * 
   * This method is called by the @Field decorator when it detects
   * that the field is part of a model that has a configured dataSource.
   * 
   * @param target - The prototype of the class containing the field
   * @param propertyKey - The name of the property/field being configured
   * @param fieldType - The type of the field (e.g., 'text', 'datetime', 'integer')
   * @param fieldOptions - Type-specific options for the field
   * 
   * @example
   * ```typescript
   * // Called automatically by @Field decorator
   * dataSource.configureField(userPrototype, 'name', 'text', { maxLength: 50 });
   * ```
   */
  abstract configureField(
    target: any,
    propertyKey: string,
    fieldType: string,
    fieldOptions?: any
  ): void;
}

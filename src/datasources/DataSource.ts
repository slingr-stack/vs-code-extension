import 'reflect-metadata';

/**
 * Base configuration options for all data sources.
 * All data source specific options should extend from this interface.
 */
export interface DataSourceOptions {
  /**
   * Indicates if schema migrations have to be managed by Slingr.
   * When true, the framework will handle schema creation and updates automatically.
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
   * Get the current data source options.
   * 
   * @returns The data source configuration options
   */
  public getOptions(): DataSourceOptions {
    return this.options;
  }
}

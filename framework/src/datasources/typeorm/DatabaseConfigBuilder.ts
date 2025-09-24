import { DataSourceOptions as TypeORMDataSourceOptions } from 'typeorm';
import { TypeORMSqlDataSourceOptions } from './TypeORMSqlDataSource';

/**
 * Builder class for creating TypeORM DataSource configurations.
 * 
 * This class handles the complexity of building different database configurations
 * and provides a clean separation between configuration logic and the main data source.
 */
export class DatabaseConfigBuilder {
  
  /**
   * Builds a complete TypeORM DataSource configuration from framework options.
   * 
   * @param options - Framework data source options
   * @param entities - Array of entity classes to include
   * @returns Complete TypeORM configuration object
   */
  static buildConfig(
    options: TypeORMSqlDataSourceOptions, 
    entities: Function[]
  ): TypeORMDataSourceOptions {
    const config: any = {
      type: options.type,
      logging: options.logging ?? false,
      synchronize: DatabaseConfigBuilder.determineSynchronizeFlag(options),
      entities: entities,
  // Only include dropSchema when explicitly requested (typically in tests)
  ...(options.dropSchema ? { dropSchema: true } : {})
    };

    // Database-specific configuration
    if (options.type === 'sqlite') {
      DatabaseConfigBuilder.configureSQLite(config, options);
    } else {
      DatabaseConfigBuilder.configureNetworkDatabase(config, options);
    }

    // Connection pooling configuration
    DatabaseConfigBuilder.configureConnectionPooling(config, options);

    // Connection timeout
    if (options.connectTimeout) {
      config.connectTimeout = options.connectTimeout;
    }

    return config as TypeORMDataSourceOptions;
  }

  /**
   * Determines the correct synchronize flag value based on options.
   * 
   * For managed schemas:
   * - If synchronize is explicitly set, use that value
   * - If managed=true and synchronize is not set, enable it for development
   * 
   * For non-managed schemas:
   * - Use the explicit synchronize value or default to false
   * 
   * @param options - Framework data source options
   * @returns The synchronize flag value to use
   */
  private static determineSynchronizeFlag(options: TypeORMSqlDataSourceOptions): boolean {
    // If synchronize is explicitly provided, always respect it
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
   * Configures SQLite-specific options.
   * 
   * @param config - Configuration object to modify
   * @param options - Framework data source options
   */
  private static configureSQLite(config: any, options: TypeORMSqlDataSourceOptions): void {
    config.database = options.filename || ':memory:';
  }

  /**
   * Configures network database options (PostgreSQL, MySQL, etc.).
   * 
   * @param config - Configuration object to modify
   * @param options - Framework data source options
   */
  private static configureNetworkDatabase(config: any, options: TypeORMSqlDataSourceOptions): void {
    if (options.host) config.host = options.host;
    if (options.port) config.port = options.port;
    if (options.username) config.username = options.username;
    if (options.password) config.password = options.password;
    if (options.database) config.database = options.database;
  }

  /**
   * Configures connection pooling options.
   * 
   * @param config - Configuration object to modify
   * @param options - Framework data source options
   */
  private static configureConnectionPooling(config: any, options: TypeORMSqlDataSourceOptions): void {
    if (options.maxConnections || options.minConnections) {
      config.pool = {
        max: options.maxConnections || 10,
        min: options.minConnections || 1,
      };
    }
  }
}

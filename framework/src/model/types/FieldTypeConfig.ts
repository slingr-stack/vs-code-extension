/**
 * Interface that field types must implement to provide TypeORM configuration.
 * This allows the framework to get database column configurations without
 * maintaining switch statements or duplicating logic.
 */
export interface FieldTypeConfig {
  /**
   * Returns the TypeORM column configuration for this field type.
   * 
   * @param fieldOptions - Field-specific options from the decorator
   * @param nullable - Whether the column should be nullable
   * @returns TypeORM column configuration object
   */
  getTypeORMColumnConfig(fieldOptions?: any, nullable?: boolean): any;

  /**
   * Returns the TypeORM column configuration for array elements of this field type.
   * Array elements are typically non-nullable since empty arrays are represented by no rows.
   * 
   * @param fieldOptions - Field-specific options from the decorator
   * @returns TypeORM column configuration object for array elements
   */
  getArrayElementColumnConfig(fieldOptions?: any): any;
}

/**
 * Registry of field type configurations.
 * Each field type should register itself here to be discoverable by the TypeORM mapper.
 */
export class FieldTypeRegistry {
  private static configurations = new Map<string, FieldTypeConfig>();

  /**
   * Registers a field type configuration.
   * 
   * @param typeName - The name of the field type (e.g., 'text', 'integer')
   * @param config - The configuration object implementing FieldTypeConfig
   */
  static register(typeName: string, config: FieldTypeConfig): void {
    this.configurations.set(typeName, config);
  }

  /**
   * Gets the configuration for a specific field type.
   * 
   * @param typeName - The name of the field type
   * @returns The configuration object or undefined if not found
   */
  static get(typeName: string): FieldTypeConfig | undefined {
    return this.configurations.get(typeName);
  }

  /**
   * Gets all registered field type names.
   * 
   * @returns Array of registered field type names
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.configurations.keys());
  }
}

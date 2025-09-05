import { FieldTypeRegistry } from '../../model/types/TypeRegistry';

/**
 * Utility class for mapping Slingr framework field types to TypeORM column configurations.
 * 
 * This class now uses a registry-based approach instead of switch statements,
 * making it easier to maintain and extend support for new field types.
 * Each field type registers its own TypeORM configuration.
 */
export class TypeORMTypeMapper {
  
  /**
   * Maps framework field types to TypeORM column configurations.
   * 
   * @param fieldType - The framework field type
   * @param fieldOptions - Field-specific options
   * @returns TypeORM column configuration
   */
  static getColumnType(fieldType: string, fieldOptions?: any): any {
    // Determine if the field should be nullable based on the required option
    const isRequired = fieldOptions?.required === true;
    const nullable = !isRequired;

    // Get the configuration from the registry
    const typeConfig = FieldTypeRegistry.get(fieldType);
    
    if (typeConfig) {
      return typeConfig.getTypeORMColumnConfig(fieldOptions, nullable);
    }

    // Fallback for unknown types (should rarely happen)
    console.warn(`Unknown field type '${fieldType}', using text as fallback`);
    return {
      type: 'text',
      nullable: nullable
    };
  }

  /**
   * Gets the column configuration for array element values based on the base field type.
   * Array elements are always non-nullable since empty arrays are represented by no rows.
   * 
   * @param baseFieldType - The base field type (e.g., 'text', 'html', 'email')
   * @param fieldOptions - Field-specific options
   * @returns TypeORM column configuration for array elements
   */
  static getArrayElementColumnConfig(baseFieldType: string, fieldOptions?: any): any {
    // Get the configuration from the registry
    const typeConfig = FieldTypeRegistry.get(baseFieldType);
    
    if (typeConfig) {
      return typeConfig.getArrayElementColumnConfig(fieldOptions);
    }

    // Fallback for unknown types (should rarely happen)
    console.warn(`Unknown field type '${baseFieldType}', using text as fallback for array elements`);
    return {
      type: 'text',
      nullable: false
    };
  }
}

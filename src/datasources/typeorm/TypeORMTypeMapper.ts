/**
 * Utility class for mapping Slingr framework field types to TypeORM column configurations.
 * 
 * This class centralizes all type mapping logic, making it easier to maintain
 * and extend support for new field types.
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

    switch (fieldType) {
      case 'text':
      case 'email':
      case 'html':
        return TypeORMTypeMapper.getTextColumnConfig(fieldOptions, nullable);

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
   * Gets the column configuration for array element values based on the base field type.
   * Array elements are always non-nullable since empty arrays are represented by no rows.
   * 
   * @param baseFieldType - The base field type (e.g., 'text', 'html', 'email')
   * @param fieldOptions - Field-specific options
   * @returns TypeORM column configuration for array elements
   */
  static getArrayElementColumnConfig(baseFieldType: string, fieldOptions?: any): any {
    switch (baseFieldType) {
      case 'text':
      case 'email':
      case 'html':
        return TypeORMTypeMapper.getTextColumnConfig(fieldOptions, false);
      
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
   * Helper method to get text column configuration.
   * Centralizes the logic for determining varchar vs text based on length.
   * 
   * @param fieldOptions - Field-specific options
   * @param nullable - Whether the column should be nullable
   * @returns TypeORM column configuration for text fields
   */
  private static getTextColumnConfig(fieldOptions?: any, nullable: boolean = true): any {
    const hasMaxLength = fieldOptions?.maxLength;
    const useVarchar = hasMaxLength && fieldOptions.maxLength <= 255;
    
    return {
      type: useVarchar ? 'varchar' : 'text',
      length: useVarchar ? fieldOptions.maxLength : undefined,
      nullable: nullable
    };
  }
}

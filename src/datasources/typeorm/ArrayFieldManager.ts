import { DataSource as TypeORMDataSource } from 'typeorm';
import { OneToMany, AfterLoad } from 'typeorm';
import { ArrayEntityFactory } from './ArrayEntityFactory';

/**
 * Interface for array field metadata.
 */
export interface ArrayFieldMetadata {
  elementEntityKey: string;
  baseFieldType: string;
  options?: any;
  relationPropertyName?: string;
}

/**
 * Manager class for handling array field configuration and persistence operations.
 * 
 * This class encapsulates all array-related logic, making it easier to maintain
 * and test array field functionality separately from the main data source.
 */
export class ArrayFieldManager {
  private arrayElementEntities: Map<string, Function> = new Map();
  private arrayFieldNamesCache: WeakMap<Function, string[]> = new WeakMap();

  /**
   * Gets all registered array element entities.
   * 
   * @returns Array of entity classes
   */
  getArrayElementEntities(): Function[] {
    return Array.from(this.arrayElementEntities.values());
  }

  /**
   * Configures an array field by creating a separate entity and storing metadata.
   * Also adds a OneToMany relationship to the parent entity for eager loading.
   * 
   * @param target - The prototype of the class containing the field
   * @param propertyKey - The name of the property/field
   * @param fieldType - The framework field type (e.g., 'array:text', 'array:html')
   * @param fieldOptions - Field-specific options
   */
  configureArrayField(
    target: any,
    propertyKey: string,
    fieldType: string,
    fieldOptions?: any
  ): void {
    const parentEntityName = target.constructor.name;
    const parentEntityClass = target.constructor as Function;
    const baseFieldType = fieldType.replace('array:', '');

    // Create a unique key for this array field
    const arrayEntityKey = ArrayEntityFactory.generateEntityKey(parentEntityName, propertyKey);

    // Check if we've already created an entity for this array field
    if (!this.arrayElementEntities.has(arrayEntityKey)) {
      const arrayElementEntity = ArrayEntityFactory.createArrayElementEntity(
        parentEntityName,
        parentEntityClass,
        propertyKey,
        baseFieldType,
        fieldOptions
      );
      this.arrayElementEntities.set(arrayEntityKey, arrayElementEntity);
    }

    // Get the array element entity for the OneToMany relationship
    const ArrayElementEntity = this.arrayElementEntities.get(arrayEntityKey);
    const entityName = ArrayEntityFactory.generateEntityName(parentEntityName, propertyKey);

    // Add OneToMany relationship to parent entity for eager loading
    // Use a different property name to avoid conflicts with the original array field
    const relationPropertyName = `_${propertyKey}_elements`;
    
    // Use entity name string instead of class reference for dynamic entities
    OneToMany(entityName, (element: any) => element.parent, {
      eager: true,
      cascade: ['insert', 'update']  // Only cascade insert/update, not remove (ManyToOne handles remove)
    })(target, relationPropertyName);

    // Add @AfterLoad hook to automatically transform array element entities to arrays
    const afterLoadMethodName = `_afterLoad_${propertyKey}`;
    
    // Create the afterLoad method if it doesn't exist
    if (!target[afterLoadMethodName]) {
      target[afterLoadMethodName] = function() {
        this._transformArrayFields();
      };
      
      // Apply @AfterLoad decorator to the method
      AfterLoad()(target, afterLoadMethodName);
    }

    // Add or update the main transformation method
    if (!target._transformArrayFields) {
      target._transformArrayFields = function() {
        const entityClass = this.constructor as Function;
        const arrayFieldNames = Reflect.getMetadata('array:field:names', entityClass) || [];
        
        for (const fieldName of arrayFieldNames) {
          const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
          if (arrayMetadata?.relationPropertyName) {
            const relationPropertyName = arrayMetadata.relationPropertyName;
            const arrayElements = this[relationPropertyName];
            
            if (Array.isArray(arrayElements)) {
              // Sort by index and extract values
              this[fieldName] = arrayElements
                .sort((a, b) => a.index - b.index)
                .map(element => element.value);
            } else {
              this[fieldName] = [];
            }
          }
        }
      };
    }

    // Keep track of array field names for this entity class
    const existingArrayFields = Reflect.getMetadata('array:field:names', target.constructor) || [];
    if (!existingArrayFields.includes(propertyKey)) {
      Reflect.defineMetadata('array:field:names', [...existingArrayFields, propertyKey], target.constructor);
    }

    // Store metadata about this array field
    const metadata: ArrayFieldMetadata = {
      elementEntityKey: arrayEntityKey,
      baseFieldType: baseFieldType,
      options: fieldOptions,
      relationPropertyName: relationPropertyName
    };

    Reflect.defineMetadata('typeorm:array-field', metadata, target, propertyKey);
    Reflect.defineMetadata('datasource:field:configured', true, target, propertyKey);

    // Invalidate cached array field names for this class so future calls recompute once
    this.arrayFieldNamesCache.delete(target.constructor);
  }

  /**
   * Extracts array values from an entity before processing.
   * 
   * @param entity - The entity to extract array values from
   * @returns Object containing array field names and their values
   */
  extractArrayValues<T extends object>(entity: T): Record<string, any[]> {
    const arrayValues: Record<string, any[]> = {};
    const entityClass = entity.constructor as Function;
    const arrayFieldNames = this.getArrayFieldNames(entityClass);

    for (const fieldName of arrayFieldNames) {
      const value = (entity as any)[fieldName];
      if (Array.isArray(value)) {
        arrayValues[fieldName] = value;
      } else if (value == null) {
        // Normalize missing arrays to empty arrays to simplify downstream logic
        arrayValues[fieldName] = [];
      }
    }
    return arrayValues;
  }

  /**
   * Extracts main entity fields (excluding arrays and their relationships) for saving.
   * 
   * @param entity - The entity to extract main fields from
   * @returns Entity copy without array fields and relationship properties
   */
  extractMainEntityFields<T extends object>(entity: T): T {
    // Keep it simple: shallow clone and strip only array fields and relationship properties
    const entityCopy: any = { ...(entity as any) };
    const entityClass = entity.constructor as Function;
    
    for (const fieldName of this.getArrayFieldNames(entityClass)) {
      // Remove the array field
      delete entityCopy[fieldName];
      
      // Remove the relationship property used for eager loading
      const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
      if (arrayMetadata?.relationPropertyName) {
        delete entityCopy[arrayMetadata.relationPropertyName];
      }
    }
    
    return entityCopy as T;
  }

  /**
   * Saves array fields as separate entities.
   * 
   * @param originalEntity - The original entity with array values
   * @param arrayValues - Pre-extracted array values
   * @param savedEntity - The saved main entity (with generated ID)
   * @param typeormDataSource - TypeORM data source for database operations
   */
  async saveArrayFields<T extends object>(
    originalEntity: T,
    arrayValues: Record<string, any[]>,
    savedEntity: T,
    typeormDataSource: TypeORMDataSource
  ): Promise<void> {
    const entityClass = originalEntity.constructor as Function;
    const fieldNames = this.getArrayFieldNames(entityClass);

    await Promise.all(
      fieldNames.map(async (fieldName) => {
        const values = arrayValues[fieldName] ?? [];
        await this.persistArrayField(fieldName, values, savedEntity, typeormDataSource, entityClass);
      })
    );
  }

  /**
   * Saves a single array field as separate entities.
   * 
   * @param fieldName - Name of the array field
   * @param arrayValue - Array values to save
   * @param savedEntity - The saved main entity
   * @param typeormDataSource - TypeORM data source for database operations
   * @param entityClass - The entity class
   */
  private async persistArrayField<T extends object>(
    fieldName: string,
    arrayValue: any[],
    savedEntity: T,
    typeormDataSource: TypeORMDataSource,
    entityClass: Function
  ): Promise<void> {
    const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata(
      'typeorm:array-field',
      entityClass.prototype,
      fieldName
    );
    const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);

    if (!ArrayElementEntity) return;

    const repository = typeormDataSource.getRepository(ArrayElementEntity as any);

    // Always remove previous elements for this field, then insert the new snapshot
    await repository.delete({ parentId: (savedEntity as any).id });

    if (!Array.isArray(arrayValue) || arrayValue.length === 0) {
      return; // nothing to insert
    }

    const rows = arrayValue.map((value, index) =>
      repository.create({ parentId: (savedEntity as any).id, value, index })
    );
    await repository.insert(rows as any);
  }

  /**
   * Gets the array field names for a given entity class, cached for reuse.
   */
  private getArrayFieldNames(entityClass: Function): string[] {
    const cached = this.arrayFieldNamesCache.get(entityClass);
    if (cached) return cached;

    const fieldNames: string[] = Reflect.getMetadata('model:fields', entityClass) || [];
    const arrayFields = fieldNames.filter((fieldName) => {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      return typeof fieldType === 'string' && fieldType.startsWith('array:');
    });
    this.arrayFieldNamesCache.set(entityClass, arrayFields);
    return arrayFields;
  }
}

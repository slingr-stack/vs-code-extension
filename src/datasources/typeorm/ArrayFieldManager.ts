import { DataSource as TypeORMDataSource } from 'typeorm';
import { ArrayEntityFactory } from './ArrayEntityFactory';

/**
 * Interface for array field metadata.
 */
export interface ArrayFieldMetadata {
  elementEntityKey: string;
  baseFieldType: string;
  options?: any;
}

/**
 * Manager class for handling array field configuration and persistence operations.
 * 
 * This class encapsulates all array-related logic, making it easier to maintain
 * and test array field functionality separately from the main data source.
 */
export class ArrayFieldManager {
  private arrayElementEntities: Map<string, Function> = new Map();

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
    const baseFieldType = fieldType.replace('array:', '');
    
    // Create a unique key for this array field
    const arrayEntityKey = ArrayEntityFactory.generateEntityKey(parentEntityName, propertyKey);
    
    // Check if we've already created an entity for this array field
    if (!this.arrayElementEntities.has(arrayEntityKey)) {
      const arrayElementEntity = ArrayEntityFactory.createArrayElementEntity(
        parentEntityName,
        propertyKey,
        baseFieldType,
        fieldOptions
      );
      this.arrayElementEntities.set(arrayEntityKey, arrayElementEntity);
    }
    
    // Store metadata about this array field
    const metadata: ArrayFieldMetadata = {
      elementEntityKey: arrayEntityKey,
      baseFieldType: baseFieldType,
      options: fieldOptions
    };
    
    Reflect.defineMetadata('typeorm:array-field', metadata, target, propertyKey);
    Reflect.defineMetadata('datasource:field:configured', true, target, propertyKey);
  }

  /**
   * Extracts array values from an entity before processing.
   * 
   * @param entity - The entity to extract array values from
   * @returns Object containing array field names and their values
   */
  extractArrayValues<T extends object>(entity: T): Record<string, any[]> {
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
   * 
   * @param entity - The entity to extract main fields from
   * @returns Entity copy without array fields
   */
  extractMainEntityFields<T extends object>(entity: T): T {
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
   * Handles array field updates by removing old array elements.
   * 
   * @param entity - The entity being updated
   * @param typeormDataSource - TypeORM data source for database operations
   */
  async handleArrayFieldsForUpdate<T extends object>(
    entity: T, 
    typeormDataSource: TypeORMDataSource
  ): Promise<void> {
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
        const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
        
        if (ArrayElementEntity) {
          const repository = typeormDataSource.getRepository(ArrayElementEntity as any);
          // Delete existing array elements for this entity
          await repository.delete({ parentId: (entity as any).id });
        }
      }
    }
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
    const entityClass = originalEntity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayValue = arrayValues[fieldName];
        
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          await this.saveArrayField(fieldName, arrayValue, savedEntity, typeormDataSource, entityClass);
        }
      }
    }
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
  private async saveArrayField<T extends object>(
    fieldName: string,
    arrayValue: any[],
    savedEntity: T,
    typeormDataSource: TypeORMDataSource,
    entityClass: Function
  ): Promise<void> {
    const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
    const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
    
    if (ArrayElementEntity) {
      const repository = typeormDataSource.getRepository(ArrayElementEntity as any);
      
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

  /**
   * Loads array fields for an entity by querying array element entities.
   * 
   * @param entity - The entity to load array fields for
   * @param typeormDataSource - TypeORM data source for database operations
   * @returns The entity with array fields populated
   */
  async loadArrayFields<T extends object>(entity: T, typeormDataSource: TypeORMDataSource): Promise<T> {
    const entityCopy = { ...entity };
    const entityClass = entity.constructor;
    const fieldNames = Reflect.getMetadata('model:fields', entityClass) || [];
    
    for (const fieldName of fieldNames) {
      const fieldType = Reflect.getMetadata('field:type', entityClass.prototype, fieldName);
      
      if (fieldType && fieldType.startsWith('array:')) {
        const arrayValues = await this.loadArrayField(entity, fieldName, typeormDataSource, entityClass);
        (entityCopy as any)[fieldName] = arrayValues;
      }
    }
    
    return entityCopy;
  }

  /**
   * Loads a single array field for an entity.
   * 
   * @param entity - The entity to load array field for
   * @param fieldName - Name of the array field
   * @param typeormDataSource - TypeORM data source for database operations
   * @param entityClass - The entity class
   * @returns Array of values for the field
   */
  private async loadArrayField<T extends object>(
    entity: T,
    fieldName: string,
    typeormDataSource: TypeORMDataSource,
    entityClass: Function
  ): Promise<any[]> {
    const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata('typeorm:array-field', entityClass.prototype, fieldName);
    const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey);
    
    if (ArrayElementEntity) {
      const repository = typeormDataSource.getRepository(ArrayElementEntity as any);
      
      // Load array elements for this entity, ordered by index
      const elements = await repository.find({
        where: { parentId: (entity as any).id },
        order: { index: 'ASC' }
      });
      
      // Extract values into an array
      return elements.map(element => element.value);
    }
    
    return [];
  }
}

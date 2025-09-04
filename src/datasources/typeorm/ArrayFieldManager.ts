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
   * Extracts main entity fields (excluding arrays) for saving.
   * 
   * @param entity - The entity to extract main fields from
   * @returns Entity copy without array fields
   */
  extractMainEntityFields<T extends object>(entity: T): T {
    // Keep it simple: shallow clone and strip only array fields; leave everything else intact
    const entityCopy: any = { ...(entity as any) };
    const entityClass = entity.constructor as Function;
    for (const fieldName of this.getArrayFieldNames(entityClass)) {
      delete entityCopy[fieldName];
    }
    return entityCopy as T;
  }

  /**
   * Handles array field updates by removing old array elements.
   * 
   * @param entity - The entity being updated
   * @param typeormDataSource - TypeORM data source for database operations
   */
  async handleArrayFieldsForUpdate<T extends object>(
    _entity: T,
    _typeormDataSource: TypeORMDataSource
  ): Promise<void> {
    // No-op: we now handle delete-and-replace in saveArrayFields to rely on TypeORM per-field operations.
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
   * Loads array fields for an entity by querying array element entities.
   * 
   * @param entity - The entity to load array fields for
   * @param typeormDataSource - TypeORM data source for database operations
   * @returns The entity with array fields populated
   */
  async loadArrayFields<T extends object>(entity: T, typeormDataSource: TypeORMDataSource): Promise<T> {
    const entityCopy: any = { ...(entity as any) };
    const entityClass = entity.constructor as Function;
    const fieldNames = this.getArrayFieldNames(entityClass);

    const results = await Promise.all(
      fieldNames.map((fieldName) => this.loadArrayField(entity, fieldName, typeormDataSource, entityClass))
    );

    fieldNames.forEach((fieldName, idx) => {
      entityCopy[fieldName] = results[idx];
    });

    return entityCopy as T;
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

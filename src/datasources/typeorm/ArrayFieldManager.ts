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

    // Add OneToMany relationship to parent entity for eager loading
    // Use a different property name to avoid conflicts with the original array field
    const relationPropertyName = `_${propertyKey}_elements`;

    OneToMany(() => ArrayElementEntity as any, (element: any) => element.parent, {
      eager: true,
      cascade: true,                  // insert/update/remove through parent
      orphanedRowAction: 'delete'     // remove missing children when saving parent
    })(target, relationPropertyName);

    // Add @AfterLoad hook to automatically transform array element entities to arrays
    const afterLoadMethodName = `_afterLoad_${propertyKey}`;

    // Create the afterLoad method if it doesn't exist
    if (!target[afterLoadMethodName]) {
      target[afterLoadMethodName] = function () {
        this._transformArrayFields();
      };

      // Apply @AfterLoad decorator to the method
      AfterLoad()(target, afterLoadMethodName);
    }

    // Add or update the main transformation method
    if (!target._transformArrayFields) {
      target._transformArrayFields = function () {
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
   * Populates OneToMany relation properties from primitive array fields so that
   * TypeORM's repository.save() can cascade-insert/update/delete children.
   * If an array field is undefined/null, we set the relation array to [] so
   * orphaned children are deleted (via orphanedRowAction: 'delete').
   */
  attachArrayRelations<T extends object>(entity: T): void {
    const entityClass = (entity as any).constructor as Function;
    const fieldNames = this.getArrayFieldNames(entityClass);

    for (const fieldName of fieldNames) {
      const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata(
        'typeorm:array-field',
        entityClass.prototype,
        fieldName
      );
      if (!arrayMetadata) continue;

      const ArrayElementEntity = this.arrayElementEntities.get(arrayMetadata.elementEntityKey) as any;
      const relationPropertyName = arrayMetadata.relationPropertyName as string;

      const values = (entity as any)[fieldName];

      if (!Array.isArray(values)) {
        // Ensure relation is an empty array to trigger orphan removal when needed
        (entity as any)[relationPropertyName] = [];
        continue;
      }

      // Map primitives to relation entity instances, preserving order/index
      const children = values.map((value: any, index: number) => {
        const child = new ArrayElementEntity();
        child.value = value;
        child.index = index;
        // Link back to parent; TypeORM will handle FK via JoinColumn
        child.parent = entity;
        return child;
      });

      (entity as any)[relationPropertyName] = children;
    }
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

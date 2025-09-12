import { OneToMany, AfterLoad, BeforeInsert, BeforeUpdate } from 'typeorm';
import { ArrayEntityFactory } from './ArrayEntityFactory';
import { 
  ARRAY_FIELD_NAMES, 
  DATASOURCE_FIELD_CONFIGURED, 
  TYPEORM_ARRAY_RELATION_CONFIGURED,
  TYPEORM_ARRAY_FIELD 
} from '../../model/metadata/MetadataKeys';

/**
 * Interface for array field metadata.
 */
export interface ArrayFieldMetadata {
  elementEntityKey: string;
  elementEntityClass?: Function;
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
  // Use a global (static) cache so that multiple data source instances reusing
  // the same model classes (e.g. across multiple tests or different database
  // connections) reference the SAME dynamically created array element entity
  // classes. Without this, each new data source instance would create a fresh
  // dynamic entity class while existing relation decorators on the shared
  // model class still reference the first created class. When the new
  // DataSource initializes, TypeORM sees a relation pointing to an entity
  // class not included in its entities array and throws:
  //   Entity metadata for BlogPost#_<field>_elements was not found
  private static globalArrayElementEntities: Map<string, Function> = new Map();

  // Instance-level cache (currently unused beyond potential future optimizations)
  private arrayFieldNamesCache: WeakMap<Function, string[]> = new WeakMap();

  /**
   * Gets all registered array element entities.
   * 
   * @returns Array of entity classes
   */
  getArrayElementEntities(): Function[] {
    return Array.from(ArrayFieldManager.globalArrayElementEntities.values());
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
    if (!ArrayFieldManager.globalArrayElementEntities.has(arrayEntityKey)) {
      const arrayElementEntity = ArrayEntityFactory.createArrayElementEntity(
        parentEntityName,
        parentEntityClass,
        propertyKey,
        baseFieldType,
        fieldOptions
      );
      ArrayFieldManager.globalArrayElementEntities.set(arrayEntityKey, arrayElementEntity);
    }

    // Get the array element entity for the OneToMany relationship
    const ArrayElementEntity = ArrayFieldManager.globalArrayElementEntities.get(arrayEntityKey)!;

    // Add OneToMany relationship to parent entity for eager loading
    // Use a different property name to avoid conflicts with the original array field
    const relationPropertyName = `_${propertyKey}_elements`;

    // Only configure the relation once per model class + property. Additional
    // data source instances should reuse the same relation metadata.
    if (!Reflect.getMetadata(TYPEORM_ARRAY_RELATION_CONFIGURED, target, relationPropertyName)) {
      // Ensure TypeORM can discover the relation property type. Since the relation
      // property is added dynamically (not declared in the class), reflect-metadata
      // does not have a "design:type" entry for it. TypeORM relies on this metadata
      // when building entity schemas for relations. Without it, it later fails with:
      //   Entity metadata for BlogPost#_<field>_elements was not found
      // We explicitly define the design type as Array which matches what a
      // OneToMany relation expects.
      if (!Reflect.getMetadata('design:type', target, relationPropertyName)) {
        Reflect.defineMetadata('design:type', Array, target, relationPropertyName);
      }

      OneToMany(() => ArrayElementEntity as any, (element: any) => element.parent, {
        eager: true,
        cascade: true,                  // insert/update/remove through parent
        orphanedRowAction: 'delete'     // remove missing children when saving parent
      })(target, relationPropertyName);

      Reflect.defineMetadata(TYPEORM_ARRAY_RELATION_CONFIGURED, true, target, relationPropertyName);
    }

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
        const arrayFieldNames = Reflect.getMetadata(ARRAY_FIELD_NAMES, entityClass) || [];

        for (const fieldName of arrayFieldNames) {
          const arrayMetadata: ArrayFieldMetadata = Reflect.getMetadata(TYPEORM_ARRAY_FIELD, entityClass.prototype, fieldName);
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

    // Add hooks to populate relation arrays from primitive arrays before insert/update
    const beforeInsertMethodName = `_beforeInsert_${propertyKey}`;
    const beforeUpdateMethodName = `_beforeUpdate_${propertyKey}`;

    if (!target[beforeInsertMethodName]) {
      target[beforeInsertMethodName] = function () {
        this._prepareArrayRelations();
      };
      BeforeInsert()(target, beforeInsertMethodName);
    }

    if (!target[beforeUpdateMethodName]) {
      target[beforeUpdateMethodName] = function () {
        this._prepareArrayRelations();
      };
      BeforeUpdate()(target, beforeUpdateMethodName);
    }

    // Main preparation method to build relation children from primitive arrays
    if (!target._prepareArrayRelations) {
      target._prepareArrayRelations = function () {
        const entityClass = this.constructor as Function;
        const arrayFieldNames: string[] = Reflect.getMetadata(ARRAY_FIELD_NAMES, entityClass) || [];

        for (const fieldName of arrayFieldNames) {
          const meta: ArrayFieldMetadata = Reflect.getMetadata(TYPEORM_ARRAY_FIELD, entityClass.prototype, fieldName);
          if (!meta || !meta.relationPropertyName) continue;

          const relationProp = meta.relationPropertyName as string;
          const values = this[fieldName];

          if (!Array.isArray(values)) {
            this[relationProp] = [];
            continue;
          }

          const ElementClass = meta.elementEntityClass as any;
          const children = values.map((value: any, index: number) => {
            const child = new ElementClass();
            child.value = value;
            child.index = index;
            child.parent = this;
            return child;
          });

          this[relationProp] = children;
        }
      };
    }

    // Keep track of array field names for this entity class
    const existingArrayFields = Reflect.getMetadata(ARRAY_FIELD_NAMES, target.constructor) || [];
    if (!existingArrayFields.includes(propertyKey)) {
      Reflect.defineMetadata(ARRAY_FIELD_NAMES, [...existingArrayFields, propertyKey], target.constructor);
    }

    // Store metadata about this array field
    const existingMeta: ArrayFieldMetadata | undefined = Reflect.getMetadata(TYPEORM_ARRAY_FIELD, target, propertyKey);
    const metadata: ArrayFieldMetadata = {
      elementEntityKey: arrayEntityKey,
      elementEntityClass: ArrayElementEntity as Function,
      baseFieldType: baseFieldType,
      options: fieldOptions,
      relationPropertyName: relationPropertyName
    };
    // Overwrite / define fresh metadata ensuring elementEntityClass points to the globally cached class
    if (!existingMeta || existingMeta.elementEntityClass !== ArrayElementEntity) {
      Reflect.defineMetadata(TYPEORM_ARRAY_FIELD, metadata, target, propertyKey);
    }
    Reflect.defineMetadata(DATASOURCE_FIELD_CONFIGURED, true, target, propertyKey);

    // Invalidate cached array field names for this class so future calls recompute once
    this.arrayFieldNamesCache.delete(target.constructor);
  }

}

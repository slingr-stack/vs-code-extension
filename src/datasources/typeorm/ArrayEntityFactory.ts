import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TypeORMTypeMapper } from './TypeORMTypeMapper';

/**
 * Factory class for creating dynamic array element entities.
 * 
 * This class handles the complexity of creating TypeORM entities for array fields
 * and provides a clean interface for entity creation and management.
 */
export class ArrayEntityFactory {

  /**
   * Creates a new entity class for array elements.
   * 
   * @param parentEntityName - Name of the parent entity
   * @param fieldName - Name of the array field
   * @param baseFieldType - Base type of array elements (e.g., 'text', 'html')
   * @param fieldOptions - Field-specific options
   * @returns The created entity class
   */
  static createArrayElementEntity(
    parentEntityName: string,
    parentEntityClass: Function,
    fieldName: string,
    baseFieldType: string,
    fieldOptions?: any
  ): Function {
    const tableName = ArrayEntityFactory.generateTableName(parentEntityName, fieldName);
    const entityName = ArrayEntityFactory.generateEntityName(parentEntityName, fieldName);

    // Dynamically create the array element entity class
    const ArrayElementEntity = class {
      id!: string;
      // relation to parent for FK and cascade
      parent!: any;
      value!: string;
      index!: number;
    };

    // Set the class name for better debugging
    Object.defineProperty(ArrayElementEntity, 'name', { value: entityName });

    // Apply TypeORM decorators
    ArrayEntityFactory.applyEntityDecorators(ArrayElementEntity, tableName, parentEntityClass, baseFieldType, fieldOptions);

    return ArrayElementEntity;
  }

  /**
   * Generates a table name for an array element entity.
   * 
   * @param parentEntityName - Name of the parent entity
   * @param fieldName - Name of the array field
   * @returns Generated table name
   */
  static generateTableName(parentEntityName: string, fieldName: string): string {
    return `${parentEntityName.toLowerCase()}_${fieldName}`;
  }

  /**
   * Generates an entity name for an array element entity.
   * 
   * @param parentEntityName - Name of the parent entity
   * @param fieldName - Name of the array field
   * @returns Generated entity name
   */
  static generateEntityName(parentEntityName: string, fieldName: string): string {
    return `${parentEntityName}_${fieldName}`;
  }

  /**
   * Generates a unique key for an array element entity.
   * 
   * @param parentEntityName - Name of the parent entity
   * @param fieldName - Name of the array field
   * @returns Generated unique key
   */
  static generateEntityKey(parentEntityName: string, fieldName: string): string {
    return `${parentEntityName}_${fieldName}`;
  }

  /**
   * Applies TypeORM decorators to an array element entity.
   * 
   * @param entityClass - The entity class to decorate
   * @param tableName - Name of the database table
   * @param baseFieldType - Base type of array elements
   * @param fieldOptions - Field-specific options
   */
  private static applyEntityDecorators(
    entityClass: Function,
    tableName: string,
    parentEntityClass: Function,
    baseFieldType: string,
    fieldOptions?: any
  ): void {
    // Apply entity decorator
    Entity(tableName)(entityClass);

    // Configure the id field
    PrimaryGeneratedColumn('uuid')(entityClass.prototype, 'id');



    // Relation to parent with ON DELETE CASCADE
    ManyToOne(() => parentEntityClass as any, {
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      cascade: ['insert', 'update'], // allow setting FK on child inserts/updates
      nullable: true // allow transient null during orphan removal
    })(entityClass.prototype, 'parent');
    // FK column created via the relation JoinColumn below
    JoinColumn({ name: 'parent_id' })(entityClass.prototype, 'parent');

    // Index on (parent_id, array_index) for ordering; reference relation column by name
    Index(`IDX_${tableName}_parent_index`, ['parent', 'index'])(entityClass);

    // Configure the value field based on the base field type
    const valueColumnConfig = TypeORMTypeMapper.getArrayElementColumnConfig(baseFieldType, fieldOptions);
    Column(valueColumnConfig)(entityClass.prototype, 'value');

    // Configure the index field to preserve array order
    Column({ type: 'int', name: 'array_index' })(entityClass.prototype, 'index');
  }
}

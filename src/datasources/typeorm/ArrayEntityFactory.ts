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
      parentId!: string;
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

    // Configure the parentId field (foreign key)
    Column({ type: 'uuid', name: 'parent_id' })(entityClass.prototype, 'parentId');
    // Add an index for faster lookups by parent
    Index()(entityClass.prototype, 'parentId');
    // Ensure order uniqueness per parent and index (composite)
    Index(`IDX_${tableName}_parent_index_unique`, ['parentId', 'index'], { unique: true })(entityClass);

    // Relation to parent with ON DELETE CASCADE
    ManyToOne(() => parentEntityClass as any, {
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      nullable: false
    })(entityClass.prototype, 'parent');
    JoinColumn({ name: 'parent_id' })(entityClass.prototype, 'parent');

    // Configure the value field based on the base field type
    const valueColumnConfig = TypeORMTypeMapper.getArrayElementColumnConfig(baseFieldType, fieldOptions);
    Column(valueColumnConfig)(entityClass.prototype, 'value');

    // Configure the index field to preserve array order
    Column({ type: 'int', name: 'array_index' })(entityClass.prototype, 'index');
  }
}

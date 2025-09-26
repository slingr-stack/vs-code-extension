import { BaseModel } from './BaseModel';
import { Model } from './Model';
import { Field } from './Field';
import { PrimaryColumn, BeforeInsert } from 'typeorm';

/**
 * Abstract base class for persistent models that need to be stored in a data source.
 * 
 * Extends BaseModel with an `id` field that serves as the primary identifier
 * for entities that will be persisted to a database or other storage system.
 * 
 * @abstract
 * 
 * @example
 * ```typescript
 * @Model({
 *   dataSource: mainDataSource
 * })
 * class User extends PersistentModel {
 *   @Field({ required: true })
 *   @Text({ minLength: 2, maxLength: 50 })
 *   name: string;
 * }
 * ```
 */
@Model()
export abstract class PersistentModel extends BaseModel {
  @Field({ 
    required: false,
    docs: 'Unique identifier for the entity'
  })
  @PrimaryColumn('uuid')
  id!: string

  @BeforeInsert()
  async generateId() {
    if (!this.id) {
      const { v7 } = await import('uuid');
      this.id = v7();
    }
  }
}
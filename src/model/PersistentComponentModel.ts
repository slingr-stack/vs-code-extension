import { PersistentModel } from './PersistentModel';
import { Model } from './Model';
import { Field } from './Field';
import { Relationship } from './types/relationship/Relationship';

/**
 * Abstract base class for component models used in composition relationships.
 * 
 * Extends PersistentModel with an `owner` field that establishes a parent relationship
 * to the owning entity. This is used for models that are part of a composition 
 * relationship and cannot exist independently.
 * 
 * @template T The type of the owner/parent entity
 * @abstract
 * 
 * @example
 * ```typescript
 * @Model({
 *   dataSource: mainDataSource
 * })
 * class TaskNote extends PersistentComponentModel<Task> {
 *   @Field()
 *   @Reference()
 *   user: User;
 * 
 *   @Field()
 *   @DateTime()
 *   timestamp: Date;
 * 
 *   @Field()
 *   @HTML()
 *   note: string;
 * }
 * 
 * @Model({
 *   dataSource: mainDataSource
 * })
 * class Task extends PersistentModel {
 *   @Field()
 *   @Composition()
 *   notes: TaskNote[];
 * }
 * ```
 */
@Model()
export abstract class PersistentComponentModel<T extends PersistentModel> extends PersistentModel {
  @Field({ 
    required: true,
    docs: 'Reference to the owning entity in the composition relationship'
  })
  @Relationship({
    type: 'parent',
    load: true,
    onDelete: 'delete'
  })
  owner!: T;
}

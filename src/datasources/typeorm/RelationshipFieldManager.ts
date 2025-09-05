import { 
  OneToMany, 
  ManyToOne, 
  ManyToMany, 
  JoinColumn, 
  JoinTable 
} from 'typeorm';

/**
 * Manager class for handling relationship field configuration for TypeORM persistence.
 * 
 * This class encapsulates all relationship-related logic, making it easier to maintain
 * and test relationship functionality separately from the main data source.
 */
export class RelationshipFieldManager {

  /**
   * Configures a relationship field with appropriate TypeORM decorators.
   * 
   * @param target - The prototype of the class containing the field
   * @param propertyKey - The name of the property/field
   * @param relationshipType - The type of relationship ('reference', 'composition', 'sharedComposition', 'parent')
   * @param load - Whether to eagerly load the relationship
   * @param onDelete - What to do when referenced entity is deleted (for reference relationships)
   * @param elementType - The element type for array relationships
   */
  configureRelationshipField(
    target: any,
    propertyKey: string,
    relationshipType: string,
    load?: boolean,
    onDelete?: string,
    elementType?: () => any
  ): void {
    const designType = Reflect.getMetadata('design:type', target, propertyKey);
    const isArray = designType === Array;

    switch (relationshipType) {
      case 'reference':
        this.configureReference(target, propertyKey, isArray, load, onDelete, elementType);
        break;
      
      case 'composition':
        this.configureComposition(target, propertyKey, isArray, load, elementType);
        break;
      
      case 'sharedComposition':
        this.configureSharedComposition(target, propertyKey, isArray, load, elementType);
        break;
      
      case 'parent':
        this.configureParent(target, propertyKey, load, onDelete);
        break;
      
      default:
        throw new Error(`Unknown relationship type: ${relationshipType}`);
    }

    // Store metadata for testing purposes
    Reflect.defineMetadata('typeorm:relationship', true, target, propertyKey);
    Reflect.defineMetadata('typeorm:relationship:type', relationshipType, target, propertyKey);
  }

  /**
   * Configures a reference relationship.
   * - Single: ManyToOne with JoinColumn
   * - Array: ManyToMany with JoinTable
   */
  private configureReference(
    target: any,
    propertyKey: string,
    isArray: boolean,
    load?: boolean,
    onDelete?: string,
    elementType?: () => any
  ): void {
    const eager = load ?? false;
    
    if (isArray) {
      // Many-to-many relationship for array references
      const relationOptions = {
        eager,
        cascade: false // References are independent
      };

      if (elementType) {
        ManyToMany(elementType, undefined as any, relationOptions)(target, propertyKey);
      } else {
        // Fallback for cases where elementType is not provided
        ManyToMany(() => Object, undefined as any, relationOptions)(target, propertyKey);
      }
      
      // Add join table for many-to-many
      JoinTable()(target, propertyKey);
    } else {
      // Many-to-one relationship for single references
      const onDeleteOption = this.mapOnDeleteOption(onDelete);
      const relationOptions: any = {
        eager,
        nullable: true // References can be null
      };
      
      if (onDeleteOption) {
        relationOptions.onDelete = onDeleteOption;
      }

      if (elementType) {
        ManyToOne(elementType, undefined as any, relationOptions)(target, propertyKey);
      } else {
        // Use design type when elementType is not provided
        const designType = Reflect.getMetadata('design:type', target, propertyKey);
        if (designType && typeof designType === 'function') {
          ManyToOne(() => designType, undefined as any, relationOptions)(target, propertyKey);
        } else {
          ManyToOne(() => Object, undefined as any, relationOptions)(target, propertyKey);
        }
      }
      
      // Add join column for many-to-one with explicit column naming
      JoinColumn({ name: `${propertyKey}Id` })(target, propertyKey);
    }
  }

  /**
   * Configures a composition relationship.
   * - Single: Not typically used (compositions are usually arrays)
   * - Array: OneToMany with cascade and eager loading
   */
  private configureComposition(
    target: any,
    propertyKey: string,
    isArray: boolean,
    load?: boolean,
    elementType?: () => any
  ): void {
    const eager = load ?? true;
    
    if (isArray) {
      // One-to-many relationship for composition arrays
      const relationOptions: any = {
        eager,
        cascade: ['insert', 'update'], // Cascade save operations
        orphanedRowAction: 'delete' // Delete orphaned children
      };

      if (elementType) {
        OneToMany(elementType, (child: any) => child.owner, relationOptions)(target, propertyKey);

        // Record parent entity metadata on the child so we can configure the reverse ManyToOne
        try {
          const ChildClass = elementType();
          if (ChildClass && ChildClass.prototype) {
            // Store the parent entity constructor on the child's owner property
            Reflect.defineMetadata('relationship:parent:entity', target.constructor, ChildClass.prototype, 'owner');
          }
        } catch {
          // Non-fatal: if we can't resolve the element type now, parent mapping will fall back to manual handling
        }
      } else {
        OneToMany(() => Object, (child: any) => child.owner, relationOptions)(target, propertyKey);
      }
    } else {
      // Single composition - treat as reference with cascade
      const relationOptions: any = {
        eager,
        cascade: ['insert', 'update'],
        nullable: true
      };

      if (elementType) {
        ManyToOne(elementType, undefined as any, relationOptions)(target, propertyKey);
      } else {
        const designType = Reflect.getMetadata('design:type', target, propertyKey);
        if (designType && typeof designType === 'function') {
          ManyToOne(() => designType, undefined as any, relationOptions)(target, propertyKey);
        } else {
          ManyToOne(() => Object, undefined as any, relationOptions)(target, propertyKey);
        }
      }
      
      JoinColumn({ name: `${propertyKey}Id` })(target, propertyKey);
    }
  }

  /**
   * Configures a shared composition relationship.
   * - Always ManyToMany with JoinTable, cascade, and eager loading
   */
  private configureSharedComposition(
    target: any,
    propertyKey: string,
    isArray: boolean,
    load?: boolean,
    elementType?: () => any
  ): void {
    const eager = load ?? true;
    
    // Shared composition is always many-to-many
    const relationOptions: any = {
      eager,
      cascade: ['insert', 'update'] // Cascade save operations
    };

    if (elementType) {
      ManyToMany(elementType, undefined as any, relationOptions)(target, propertyKey);
    } else {
      ManyToMany(() => Object, undefined as any, relationOptions)(target, propertyKey);
    }
    
    // Add join table for many-to-many
    JoinTable()(target, propertyKey);
  }

  /**
   * Configures a parent relationship (used in PersistentComponentModel).
   * - Always ManyToOne with eager loading and cascade delete
   */
  private configureParent(
    target: any,
    propertyKey: string,
    load?: boolean,
    onDelete?: string
  ): void {
  const eager = false; // prevent circular eager loading with OneToMany side
    
    // Parent relationship is always many-to-one
    const relationOptions: any = {
      eager,
      onDelete: 'CASCADE', // Delete child when parent is deleted
      nullable: false // Parent is required
    };

    // Try to resolve the actual parent entity (set by configureComposition)
    const parentEntity: Function | undefined = Reflect.getMetadata('relationship:parent:entity', target, propertyKey);

    if (parentEntity) {
      ManyToOne(() => parentEntity as any, undefined as any, relationOptions)(target, propertyKey);
    } else {
      // Fallback: use Object to at least create a column; this won't enforce FK but will store ownerId
      ManyToOne(() => Object as any, undefined as any, relationOptions)(target, propertyKey);
    }

    // Add join column for the foreign key
    JoinColumn({ name: `${propertyKey}Id` })(target, propertyKey);
  }

  /**
   * Maps Slingr onDelete options to TypeORM onDelete options.
   */
  private mapOnDeleteOption(onDelete?: string): 'CASCADE' | 'SET NULL' | 'NO ACTION' | undefined {
    switch (onDelete) {
      case 'delete':
        return 'CASCADE';
      case 'removeReference':
        return 'SET NULL';
      case 'nothing':
        return 'NO ACTION';
      default:
        return 'SET NULL'; // Default behavior
    }
  }
}

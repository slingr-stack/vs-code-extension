import 'reflect-metadata';
import { Transform, TransformationType, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { BaseModel } from '../../index';

/**
 * Relationship type options.
 */
export interface RelationshipOptions {
    /**
     * The type of relationship between models.
     * - 'reference': Independent models that are related (customer <-> order)
     * - 'composition': One model cannot exist without the other (order -> line items)
     * - 'sharedComposition': Composition that can be shared across models but treated as part of the whole
     * - 'parent': Reverse side of composition relationship (used in component models)
     */
    type: 'reference' | 'composition' | 'sharedComposition' | 'parent';
    
    /**
     * For array relationships, specify the element type explicitly.
     * This is needed because TypeScript doesn't emit array element type metadata.
     */
    elementType?: () => any;
    
    /**
     * Whether to eagerly load the relationship data by default.
     * - true: Data is loaded automatically when parent is loaded
     * - false: Data is only loaded when explicitly requested
     * 
     * Defaults:
     * - reference: false
     * - composition: true
     * - sharedComposition: true
     * - parent: true
     */
    load?: boolean;
    
    /**
     * For reference relationships, defines what happens when the referenced entity is deleted.
     * - 'delete': Delete this entity when the referenced entity is deleted
     * - 'removeReference': Set the reference to null when the referenced entity is deleted
     * - 'nothing': Do nothing when the referenced entity is deleted
     * 
     * Default: 'removeReference'
     * Only applies to reference relationships.
     */
    onDelete?: 'delete' | 'removeReference' | 'nothing';
}

/**
 * Validates that a property is a BaseModel or array of BaseModel at runtime.
 */
function validateRelationshipType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    
    // Check if it's an Array (for arrays of models)
    if (designType === Array) {
        return; // Arrays are valid for relationships
    }
    
    // For Object type (generic types), skip validation as we can't check at runtime
    if (designType === Object) {
        return; // Allow Object type (generics are often compiled to Object)
    }
    
    // Check if it's a class that extends BaseModel
    if (typeof designType === 'function') {
        // Check if the type is a BaseModel or extends from it
        let currentType = designType;
        while (currentType && currentType.prototype) {
            if (currentType.prototype instanceof BaseModel || currentType === BaseModel) {
                return; // Valid BaseModel type
            }
            currentType = Object.getPrototypeOf(currentType);
        }
    }
    
    throw new Error(`@Relationship can only be applied to BaseModel or BaseModel[] properties: ${propertyKey}`);
}

/**
 * Relationship type decorator for model relationships.
 *
 * This decorator can be applied to properties that reference other BaseModel instances
 * or arrays of BaseModel instances. It handles the serialization and deserialization
 * of related models based on the relationship type.
 *
 * @param options - Configuration options for the relationship
 * @param options.type - The type of relationship ('reference' or 'composition')
 *
 * @example
 * ```typescript
 * @Model()
 * class Task extends BaseModel {
 *   @Field()
 *   @Relationship({ type: 'reference' })
 *   project: Project;
 *
 *   @Field()
 *   title: string;
 * }
 *
 * @Model()
 * class Order extends BaseModel {
 *   @Field()
 *   @Relationship({ type: 'reference' })
 *   customer: Customer;
 *
 *   @Field()
 *   @Relationship({ type: 'composition' })
 *   lineItems: LineItem[];
 * }
 * ```
 *
 * @returns A property decorator function that handles model relationship transformation
 *
 * @throws {Error} When applied to non-BaseModel properties
 *
 * @remarks
 * - Reference relationships: Both models exist independently
 * - Composition relationships: The child cannot exist without the parent
 * - For composition, the child objects are fully serialized with the parent
 * - For reference, only a minimal representation may be serialized (future enhancement)
 * - The decorator uses reflection to verify the property type at runtime
 */
export function Relationship(options: RelationshipOptions) {
    if (!options || !options.type) {
        throw new Error('@Relationship decorator requires a type option');
    }

    return function <T, K extends keyof T & string>(
        target: T,
        propertyKey: K
    ) {
        const propName = propertyKey as unknown as string;
        const proto = target as unknown as Object;

        // Skip validation for parent relationships as they use generic types
        if (options.type !== 'parent') {
            validateRelationshipType(proto, propName);
        }
        
        // Store metadata about the relationship
        Reflect.defineMetadata('field:type', 'relationship', proto, propName);
        Reflect.defineMetadata('field:relationship:type', options.type, proto, propName);
        Reflect.defineMetadata('field:relationship:load', options.load, proto, propName);
        Reflect.defineMetadata('field:relationship:onDelete', options.onDelete, proto, propName);
        
        // Store the elementType in field type options for access in the data source
        if (options.elementType) {
            Reflect.defineMetadata('field:type:options', { elementType: options.elementType }, proto, propName);
        }

        const designType = Reflect.getMetadata('design:type', proto, propName);
        
        // Apply ValidateNested for nested validation of BaseModel instances
        ValidateNested()(target as any, propName);
        
        // Apply Type decorator for proper class-transformer handling
        if (designType === Array) {
            // For arrays, we need explicit element type
            if (options.elementType) {
                Type(options.elementType)(target as any, propName);
            } else {
                Type(() => Object)(target as any, propName);
            }
        } else if (designType && typeof designType === 'function') {
            // For single relationships, use the design type directly
            Type(() => designType)(target as any, propName);
        }

        // Custom transformation for JSON serialization/deserialization
        Transform(({ value, type }) => {
            if (type === TransformationType.CLASS_TO_PLAIN) {
                // Serialization: model instance(s) -> JSON
                if (value == null) {
                    return value;
                }

                // For both composition and reference, let class-transformer handle the transformation
                // instead of manually calling toJSON()
                return value;
            } else if (type === TransformationType.PLAIN_TO_CLASS) {
                // Deserialization: JSON -> model instance(s)
                if (value == null) {
                    return value;
                }

                if (designType === Array && Array.isArray(value)) {
                    // For arrays, convert each element if we have the element type
                    if (options.elementType) {
                        const ElementType = options.elementType();
                        if (ElementType && typeof ElementType.fromJSON === 'function') {
                            return value.map(item => 
                                typeof item === 'object' && item !== null 
                                    ? ElementType.fromJSON(item)
                                    : item
                            );
                        }
                    }
                    return value;
                } else if (typeof value === 'object' && value !== null && designType && typeof designType.fromJSON === 'function') {
                    // For single relationships, convert using the model's fromJSON
                    return designType.fromJSON(value);
                }
                
                return value;
            }
            
            return value;
        })(target as any, propName);
    };
}

/**
 * Reference options for the @Reference decorator.
 */
export interface ReferenceOptions {
    /**
     * Whether to eagerly load the relationship data by default.
     * Default: false
     */
    load?: boolean;
    
    /**
     * For reference relationships, defines what happens when the referenced entity is deleted.
     * - 'delete': Delete this entity when the referenced entity is deleted
     * - 'removeReference': Set the reference to null when the referenced entity is deleted  
     * - 'nothing': Do nothing when the referenced entity is deleted
     * 
     * Default: 'removeReference'
     */
    onDelete?: 'delete' | 'removeReference' | 'nothing';
    
    /**
     * For array relationships, specify the element type explicitly.
     */
    elementType?: () => any;
}

/**
 * Composition options for the @Composition decorator.
 */
export interface CompositionOptions {
    /**
     * Whether to eagerly load the relationship data by default.
     * Default: true
     */
    load?: boolean;
    
    /**
     * For array relationships, specify the element type explicitly.
     */
    elementType?: () => any;
}

/**
 * SharedComposition options for the @SharedComposition decorator.
 */
export interface SharedCompositionOptions {
    /**
     * Whether to eagerly load the relationship data by default.
     * Default: true
     */
    load?: boolean;
    
    /**
     * For array relationships, specify the element type explicitly.
     */
    elementType?: () => any;
}

/**
 * Reference relationship decorator.
 * 
 * A shortcut for @Relationship({ type: 'reference' }) with additional options.
 * Use this for weak associations between independent models.
 * 
 * @param options - Reference-specific options
 * 
 * @example
 * ```typescript
 * @Model()
 * class Task extends PersistentModel {
 *   @Field()
 *   @Reference({ onDelete: 'delete' })
 *   project: Project;
 *   
 *   @Field()
 *   @Reference()
 *   assignees: User[];
 * }
 * ```
 */
export function Reference(options: ReferenceOptions = {}) {
    const relationshipOptions: RelationshipOptions = {
        type: 'reference',
        load: options.load ?? true,  // Default to true for eager loading
        onDelete: options.onDelete ?? 'removeReference'
    };
    
    if (options.elementType) {
        relationshipOptions.elementType = options.elementType;
    }
    
    return Relationship(relationshipOptions);
}

/**
 * Composition relationship decorator.
 * 
 * A shortcut for @Relationship({ type: 'composition' }) with additional options.
 * Use this when the referenced record is part of the whole and cannot be separated.
 * All operations are cascaded.
 * 
 * @param options - Composition-specific options
 * 
 * @example
 * ```typescript
 * @Model()
 * class Task extends PersistentModel {
 *   @Field()
 *   @Composition()
 *   notes: TaskNote[];
 * }
 * ```
 */
export function Composition(options: CompositionOptions = {}) {
    const relationshipOptions: RelationshipOptions = {
        type: 'composition',
        load: options.load ?? true
    };
    
    if (options.elementType) {
        relationshipOptions.elementType = options.elementType;
    }
    
    return Relationship(relationshipOptions);
}

/**
 * SharedComposition relationship decorator.
 * 
 * A shortcut for @Relationship({ type: 'sharedComposition' }) with additional options.
 * Use this for composition that is shared across several models but still treated 
 * as part of the whole.
 * 
 * @param options - SharedComposition-specific options
 * 
 * @example
 * ```typescript
 * @Model()
 * class Epic extends PersistentModel {
 *   @Field()
 *   @SharedComposition()
 *   notes: Note[];
 * }
 * 
 * @Model()
 * class Story extends PersistentModel {
 *   @Field()
 *   @SharedComposition()
 *   notes: Note[];
 * }
 * ```
 */
export function SharedComposition(options: SharedCompositionOptions = {}) {
    const relationshipOptions: RelationshipOptions = {
        type: 'sharedComposition',
        load: options.load ?? true
    };
    
    if (options.elementType) {
        relationshipOptions.elementType = options.elementType;
    }
    
    return Relationship(relationshipOptions);
}

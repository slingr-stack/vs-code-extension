import 'reflect-metadata';
import { Transform, TransformationType, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { BaseModel } from '../../index';
import { FIELD_TYPE, FIELD_TYPE_RELATIONSHIP, FIELD_RELATIONSHIP_TYPE, DESIGN_TYPE } from '../../metadata/MetadataKeys';

/**
 * Relationship type options.
 */
export interface RelationshipOptions {
    /**
     * The type of relationship between models.
     * - 'reference': Independent models that are related (customer <-> order)
     * - 'composition': One model cannot exist without the other (order -> line items)
     */
    type: 'reference' | 'composition';
    
    /**
     * For array relationships, specify the element type explicitly.
     * This is needed because TypeScript doesn't emit array element type metadata.
     */
    elementType?: () => any;
}

/**
 * Validates that a property is a BaseModel or array of BaseModel at runtime.
 */
function validateRelationshipType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata(DESIGN_TYPE, proto, propertyKey);
    
    // Check if it's an Array (for arrays of models)
    if (designType === Array) {
        return; // Arrays are valid for relationships
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

        validateRelationshipType(proto, propName);
        
        // Store metadata about the relationship
        Reflect.defineMetadata(FIELD_TYPE, FIELD_TYPE_RELATIONSHIP, proto, propName);
        Reflect.defineMetadata(FIELD_RELATIONSHIP_TYPE, options.type, proto, propName);

        const designType = Reflect.getMetadata(DESIGN_TYPE, proto, propName);
        
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

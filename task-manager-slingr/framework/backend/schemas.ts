export type FieldType = 'string' | 'number' | 'boolean' | 'datatime' | 'enum' | 'object' | 'array' | 'relationship';
export type Required = boolean | ((data: any) => boolean);
export type Available = boolean | ((data: any) => boolean);
export type Calculation = (data: any) => any;
export type DefaultValue = (data: any) => any;
export type FieldValidator = (data: any) => {valid: boolean, message?: string};

export interface Schema {
    [key: string]: FieldDefinition
}

export function schema(def: Schema) {
    return def;
}

// Utility type to infer the TypeScript type from a TypeDefinition
export type InferType<TypeDef extends Schema> =
    TypeDef extends StringFieldDefinition ? string :
    TypeDef extends NumberFieldDefinition ? number :
    TypeDef extends BooleanFieldDefinition ? boolean :
    TypeDef extends LongTextTypeDefinition ? string :
    any; // Default to 'any' if the type is not recognized (should ideally be more robust)


// Utility type to infer the schema type from a SchemaDefinition
export type InferSchemaType<SchemaDef extends SchemaDefinition<any>> = {
    [Key in keyof SchemaDef]: InferFieldType<SchemaDef[Key]>;
};

// Helper type to determine if a field is optional based on 'required' property
type InferFieldType<TypeDef extends TypeDefinition> =
    TypeDef extends { required: RequiredDefinition }
    ? TypeDef['required'] extends typeof required.always
        ? InferType<TypeDef>
        : InferType<TypeDef> | undefined // If not always required, make it optional (add undefined)
    : InferType<TypeDef> | undefined; // If 'required' is not specified, default to optional

export interface FieldDefinition {
    type: FieldType;
    required: Required;
    available: Available;
    defaultValue?: DefaultValue;
    calculation?: Calculation;
    validators: FieldValidator[];
}

export interface StringFieldDefinition extends FieldDefinition {
    type: 'string';
    min?: number;
    max?: number;
    pattern?: string;
}

export interface NumberFieldDefinition extends FieldDefinition {
    integer?: boolean;
    min?: number;
    max?: number;
}

export interface EnumFieldDefinition extends FieldDefinition {
    values: string[];
}

export interface ObjectFieldDefinition extends FieldDefinition {
    schema: Schema
}

export interface ArrayFieldDefinition extends FieldDefinition {
    items: FieldDefinition
}

export interface RelationshipFieldDefinition extends FieldDefinition {
    targetSchema: Schema
}

export function string(def?: Partial<StringFieldDefinition>) : StringFieldDefinition {
    let field = {
        type: 'string',
        required: false,
        available: true,
        ...def
    } as StringFieldDefinition;
    return field;
}

export function email(def?: Partial<StringFieldDefinition>) : StringFieldDefinition {
    let field = {
        type: 'string',
        required: false,
        available: true,
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
        ...def
    } as StringFieldDefinition;
    return field;
}

export function number(def?: Partial<NumberFieldDefinition>) : NumberFieldDefinition {
    let field = {
        type: 'number',
        required: false,
        available: true,
        ...def
    } as NumberFieldDefinition;
    return field;
}

export function boolean(def?: Partial<FieldDefinition>) : FieldDefinition {
    let field = {
        type: 'boolean',
        required: false,
        available: true,
        ...def
    } as FieldDefinition;
    return field;
}

export function datatime(def?: Partial<FieldDefinition>) : FieldDefinition {
    let field = {
        type: 'datatime',
        required: false,
        available: true,
        ...def
    } as FieldDefinition;
    return field;
}

export function enumType(def?: Partial<EnumFieldDefinition>) : FieldDefinition {
    let field = {
        type: 'enum',
        required: false,
        available: true,
        ...def
    } as FieldDefinition;
    return field;
}

export function object<T>(def?: Partial<ObjectFieldDefinition>) : ObjectFieldDefinition {
    let field = {
        type: 'object',
        schema: null, //schemaOf<T>(),
        required: false,
        available: true,
        ...def
    } as ObjectFieldDefinition;
    return field;
}

export function array(def?: Partial<ArrayFieldDefinition>) : ArrayFieldDefinition {
    let field = {
        type: 'array',
        required: false,
        available: true,
        ...def
    } as ArrayFieldDefinition;
    return field;
}

export function relationship<T>(def?: Partial<RelationshipFieldDefinition>) : RelationshipFieldDefinition {
    let field = {
        type: 'relationship',
        schema: null, //schemaOf<T>(),
        required: false,
        available: true,
        ...def
    } as RelationshipFieldDefinition;
    return field;
}

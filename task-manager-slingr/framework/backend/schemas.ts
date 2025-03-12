export type FieldType = 'string' | 'number' | 'boolean' | 'datatime' | 'enum' | 'object' | 'array' | 'relationship';
export type Required = boolean | ((data: any) => boolean);
export type Available = boolean | ((data: any) => boolean);
export type Calculation = (data: any) => any;
export type DefaultValue = (data: any) => any;
export type FieldValidator = (data: any) => {valid: boolean, message?: string};

export interface Schema {
    [key: string]: FieldDefinition
}

export function schema(def: Schema, validator?: (data: any) => {path: string, message: string}[]) {
    return def;
}

// Helper type to determine if a field is required
type IsRequired<T extends FieldDefinition> = T['required'] extends true ? true : T['required'] extends false ? false : boolean;

// Main type inference utility
export type InferType<T extends Schema> = {
    [K in keyof T as IsRequired<T[K]> extends false ? never : K]: InferFieldType<T[K]>;
} & {
    [K in keyof T as IsRequired<T[K]> extends true ? never : K]?: InferFieldType<T[K]>;
};

type InferFieldType<F extends FieldDefinition> =
    F extends StringFieldDefinition ? string :
    F extends NumberFieldDefinition ? number :
    F extends BooleanFieldDefinition ? boolean :
    F extends EnumFieldDefinition ? F['values'][number] :
    F extends ObjectFieldDefinition ? InferType<F['schema']> :
    F extends ArrayFieldDefinition ? InferFieldType<F['items']>[] :
    F extends RelationshipFieldDefinition ? InferType<F['targetSchema']> :
    any; // Fallback, ideally should be never or handle more cases

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
    type: 'number';
    integer?: boolean;
    min?: number;
    max?: number;
}

export interface BooleanFieldDefinition extends FieldDefinition {
    type: 'boolean';
}

export interface EnumFieldDefinition extends FieldDefinition {
    type: 'enum';
    values: string[];
}

export interface ObjectFieldDefinition extends FieldDefinition {
    type: 'object';
    schema: Schema
}

export interface ArrayFieldDefinition extends FieldDefinition {
    type: 'array';
    items: FieldDefinition
}

export interface RelationshipFieldDefinition extends FieldDefinition {
    type: 'relationship';
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

export function enumeration(def?: Partial<EnumFieldDefinition>) : EnumFieldDefinition {
    let field = {
        type: 'enum',
        required: false,
        available: true,
        ...def
    } as EnumFieldDefinition;
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

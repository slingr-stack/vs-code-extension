export interface FieldRequired {
    type: 'always' | 'never' | 'conditional',
    condition?: (data: any) => boolean
}

type FieldType = 'array' | 'id' | 'relationship' | 'text' | 'number' | 'email' | 'datetime' | 'auto-incremental';

export interface TextFieldTypeSettings {
    minLengh?: number,
    maxLength?: number,
    regex?: string
}

export interface FieldDefinition {
    type: FieldType,
    itemType?: FieldType,
    required?: FieldRequired,
    defaultValue?: (data: any) => any,
    calculation?: (data: any) => any,
}


export interface DataDefinition<T> {
    fields: {
        [K in keyof T]: FieldDefinition
    }
}

export interface MongoQuery {

}
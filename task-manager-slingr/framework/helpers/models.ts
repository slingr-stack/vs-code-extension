import { Repository } from "../backend/db";
import * as s from "../backend/schemas";
import * as ui from "../frontend/ui";

export interface ModelFieldDefinition extends s.FieldDefinition {
    defaultUi?: ui.UiFieldDefinition;
}

export interface ModelDefinition {
    fields: {
        [key: string]: ModelFieldDefinition
    },
    db?: Repository<any>;
    ui?: {
        label: string;
        objectLabelField: string;
    }
}

export function model(def: ModelDefinition): s.Schema {
    // register schema
    let schema = s.schema(def.fields); 
    type SchemaType = s.InferType<typeof schema>;
    // register default ui
    ui.defaultUiForSchema<SchemaType>({
        label: def.ui?.label,
        objectLabelField: def.ui?.objectLabelField,
        fields: {
            // go thorugh each field and add the default ui
            ...Object.keys(def.fields).reduce((acc, key) => {
                let field = def.fields[key];
                acc[key] = field.defaultUi;
                return acc;
            }, {})
        }
    });
    // TODO register repository
    return schema;
}



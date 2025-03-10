import { Schema } from "../backend/schemas";
import { Widget } from "./widgets";

type Visible = boolean | ((data: any) => boolean);
type ContextMatcher = (ctx: any) => boolean;
type Context = 'edit' | 'readOnly' | 'table' | 'mobile' | 'desktop' | 'developer' | ContextMatcher
type ContextDefinition = {
    type: 'or' | 'and',
    contexts: Context[]
}

export let context = {
    or: (contexts: Context[]) => {
        return {
            type: 'or',
            contexts
        } as ContextDefinition
    },
    and: (contexts: Context[]) => {
        return {
            type: 'and',
            contexts
        } as ContextDefinition 
    }
}

export interface UIFieldDefinition {
    label: string,
    visible: Visible,
    dataWidgets: {
        context: ContextDefinition,
        wdiget: Widget
    }
}

export interface DefaultUiForSchema<T> {
    label: string,
    recordLabelField: keyof T,
    sorting: {
        field: keyof T,
        direction: 'asc' | 'desc'
    },
    fields: {
        [key in keyof T]: UIFieldDefinition
    }
}

export function defaultUiForSchema<T>(def: DefaultUiForSchema<T>): DefaultUiForSchema<T> {
    return def;
}
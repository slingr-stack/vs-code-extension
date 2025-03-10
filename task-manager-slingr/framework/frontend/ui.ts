import { Schema } from "../backend/schemas";
import * as w from "./widgets";

type Visible = boolean | ((data: any) => boolean);
type ContextMatcher = (ctx: any) => boolean;
type Context = 'edit' | 'readOnly' | 'table' | 'mobile' | 'desktop' | 'developer' | ContextMatcher
type ContextDefinition = {
    type: 'or' | 'and',
    contexts: Context[]
} | Context;

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

export interface UiFieldDefinition {
    label: string,
    visible: Visible,
    dataWidgets: {context: ContextDefinition, widget: w.Widget}[]
}

export interface TextUiFieldDefinition extends UiFieldDefinition {
}

function text(def: Partial<TextUiFieldDefinition>): UiFieldDefinition {
    return {
        visible: true,
        dataWidgets: [{
            context: 'readOnly',
            widget: w.text()
        }, {
            context: 'edit',
            widget: w.input()
        }],
        ...def
    } as UiFieldDefinition;
}

export interface NumberUiFieldDefinition extends UiFieldDefinition {
}

function number(def: Partial<NumberUiFieldDefinition>): UiFieldDefinition {
    return {
        visible: true,
        dataWidgets: [{
            context: 'readOnly',
            widget: w.text()
        }, {
            context: 'edit',
            widget: w.input()
        }],
        ...def
    } as UiFieldDefinition;
}

export interface PasswordUiFieldDefinition extends UiFieldDefinition {
}

function password(def: Partial<PasswordUiFieldDefinition>): UiFieldDefinition {
    return {
        visible: true,
        dataWidgets: [{
            context: 'readOnly',
            widget: w.password()
        }, {
            context: 'edit',
            widget: w.passwordInput()
        }],
        ...def
    } as UiFieldDefinition;
}


export let fields = {
    text: text,
    number: number,
    password: password
};

export interface DefaultUiForSchema<T> {
    label: string,
    recordLabelField: keyof T,
    sorting: {
        field: keyof T,
        direction: 'asc' | 'desc'
    },
    fields: {
        [key in keyof T]: UiFieldDefinition
    }
}

export function defaultUiForSchema<T>(def: DefaultUiForSchema<T>): DefaultUiForSchema<T> {
    return def;
}
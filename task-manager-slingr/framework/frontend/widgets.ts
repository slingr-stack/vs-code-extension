export interface Widget {
    type: string
}

export interface TextWidget extends Widget {
    type: 'text'
}

export function text(def?: Partial<TextWidget>): TextWidget {
    return {
        type: 'text',
        ...def
    } as TextWidget;
}

export interface EmailWidget extends Widget {
    type: 'email'
}

export function email(def?: Partial<EmailWidget>): EmailWidget {
    return {
        type: 'email',
        ...def
    } as EmailWidget;
}

export interface InputWidget extends Widget {
    type: 'input'
}

export function input(def?: Partial<InputWidget>): InputWidget {
    return {
        type: 'input',
        ...def
    } as InputWidget;
}

export interface PasswordWidget extends Widget {
    type: 'password'
}

export function password(def?: Partial<PasswordWidget>): PasswordWidget {
    return {
        type: 'password',
        ...def
    } as PasswordWidget;
}

export interface PasswordInputWidget extends Widget {
    type: 'passwordInput'
}

export function passwordInput(def?: Partial<PasswordInputWidget>): PasswordInputWidget {
    return {
        type: 'passwordInput',
        ...def
    } as PasswordInputWidget;
}

export interface DropDownWidget<T> extends Widget {
    type: 'dropDown',
    options: {
        value: T,
        label: string
    }[]
}

export function dropDown<T>(def?: Partial<DropDownWidget<T>>): DropDownWidget<T> {
    return {
        type: 'dropDown',
        ...def
    } as DropDownWidget<T>;
}

export interface ChipWidget extends Widget {
    type: 'chip',
    color: string
}

export function chip(def?: Partial<ChipWidget>): ChipWidget {
    return {
        type: 'chip',
        ...def
    } as ChipWidget;
}


export interface EnumerationChipWidget<T> extends Widget {
    type: 'enumeration',
    options: {
        value: T,
        label: string
    }[]
}

export function enumerationChip<T>(def?: Partial<EnumerationChipWidget<T>>): EnumerationChipWidget<T> {
    return {
        type: 'enumerationChip',
        ...def
    } as EnumerationChipWidget<T>;
}
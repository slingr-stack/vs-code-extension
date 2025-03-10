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

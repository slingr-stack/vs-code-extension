export interface Widget {
    type: string
}

export interface TextWidget extends Widget {
    type: 'text'
}

export interface InputWidget extends Widget {
    type: 'input'
}

export function text(def: Partial<TextWidget>): TextWidget {
    return {
        type: 'text',
        ...def
    } as TextWidget;
}

export function input(def: Partial<InputWidget>): InputWidget {
    return {
        type: 'input',
        ...def
    } as InputWidget;
}
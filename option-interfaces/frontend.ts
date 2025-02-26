export interface ItemVisibility {
    type: 'display' | 'hidden' | 'conditional',
    condition?: (data: any) => boolean
}

export interface FieldUISettings {
    uiSettings: {
        visibility?: ItemVisibility
    }
}

export interface TextFieldUISettings extends FieldUISettings {
    uiSettings: {
        visibility?: ItemVisibility
        edit: {
            widget: 'text' | 'textarea' | 'rich-text'
        },
        readonly: {
            renderAs: 'plain-text' | 'html' | 'markdown'
        }
    }
}

export interface ArrayUISettingsDefinition {
    order: 'natural' | 'reverse',
    pagination: {
        type: 'more' | 'pages',
        pageSize: number
    }
}

export interface DataUISettings<T> {
    defaultLabel: keyof T
}

export interface Widget {

}

export interface DataWidget extends Widget {

}

export interface TextWidget extends DataWidget {

}

export interface FormFieldWidget extends Widget {
    label: string,
    data: DataWidget
}

export interface ViewModel {

}

export type LayoutType = 'vertical' | 'horizontal';

export interface Layout {
    type: LayoutType,
    widgets: Widget[]
}

export interface View {
    name: string,
    model?: ViewModel
}

export interface RecordView extends View {
    mode: 'readOnly' | 'edit' | 'create'
}

export interface SimpleRecordView<T> extends RecordView {
    managed: boolean,
    fields?: Array<keyof T>
}

export interface GridView<T> extends View {
    columns: Array<keyof T>,
    create: {
        enabled: boolean,
        view?: View
    },
    detail: {
        enabled: boolean,
        view?: View
    }
}

export interface MenuItem {
    name: string    
}

export interface MenuGroup extends MenuItem {
    items: MenuItem[]
}

export interface MenuView extends MenuItem {
    view: View
}

export interface Menu {
    items: MenuItem[]
}

export interface AppLayout {
    leftMenu?: Menu,
    headerMenu?: Menu
}
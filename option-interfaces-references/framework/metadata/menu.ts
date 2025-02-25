import { FormView } from "./formView";

interface MenuItem {
    label: string;
    name: string;
    view: FormView;
}

export interface Menu {
    items: MenuItem[];
}
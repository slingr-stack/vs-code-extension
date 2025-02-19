import { FormView } from "./formView";

interface MenuItem {
    label: string;
    name: string;
    view: FormView;
}

interface Menu {
    items: MenuItem[];
}
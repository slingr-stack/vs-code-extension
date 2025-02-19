import { Entity } from "./entity";
import { FormField } from "./formField"; 

export interface FormView {
    label: string;
    name: string;
    entity: Entity;
    managed?: boolean;
    fields: FormField[];  
}
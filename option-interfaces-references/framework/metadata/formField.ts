import { Field } from "./field";

export interface FormField {
    field: Field;
    readOnly?: boolean;
    hidden?: boolean;
}
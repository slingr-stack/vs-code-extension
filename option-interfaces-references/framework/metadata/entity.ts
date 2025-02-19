import { Field } from "./field";

export interface Entity {
    label: string;
    name: string;
    fields: Field[];
}
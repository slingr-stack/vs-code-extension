import {Field} from "./baseRules";

export interface Entity {
  label: string;
  name: string;
  fields: Record<string, Field>;
}

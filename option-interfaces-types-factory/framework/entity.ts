import {EntityField} from "./entityField";

export interface Entity {
  label: string;
  name: string;
  fields: Record<string, EntityField>;
}

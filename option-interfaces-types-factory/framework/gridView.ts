import { Entity } from "./entity";
import { EntityField } from "./entityField";

export interface GridColumn {
    field: EntityField;
    uiOptions?: {
        readOnly?: boolean;
        hidden?: boolean;
    };
}

export interface GridView {
  entity: Entity;
  columns: { [key: string]: GridColumn }
}
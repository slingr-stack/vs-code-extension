import { GridColumn, GridView } from "../gridView";

export const gridColumn = (config: Partial<GridColumn>): GridColumn => {
    if (!config.field) {
        throw new Error('Grid column must have a field');
    }
    return {
        field: config.field,
        uiOptions: config.uiOptions || {},
    };
}

export const gridView = (config: Partial<GridView>): GridView => {
    if (!config.entity) {
        throw new Error('Grid view must have an entity');
    }
    if (!config.columns) {
        throw new Error('Grid view must have at least one column');
    }
    return {
        entity: config.entity,
        columns: config.columns,
    };
};

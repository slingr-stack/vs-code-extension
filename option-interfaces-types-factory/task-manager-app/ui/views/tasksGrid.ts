import { gridColumn, gridView } from "../../../framework/factories/viewFactory";
import { tasksEntity } from "../../model/entities/tasks";

export const tasksGridView = gridView({
    entity: tasksEntity,
    columns: {
        title: gridColumn({ field: tasksEntity.fields.title }),
        description: gridColumn({ field: tasksEntity.fields.description }),
        project: gridColumn({ field: tasksEntity.fields.project })
    }
});
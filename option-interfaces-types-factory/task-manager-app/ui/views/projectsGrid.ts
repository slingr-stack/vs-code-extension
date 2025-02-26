import { gridColumn, gridView } from "../../../framework/factories/viewFactory";
import { projectsEntity } from "../../model/entities/projects";

export const projectsGridView = gridView({
    entity: projectsEntity,
    columns: {
        name: gridColumn({ field: projectsEntity.fields.name }),
        description: gridColumn({ field: projectsEntity.fields.description })
    }
});
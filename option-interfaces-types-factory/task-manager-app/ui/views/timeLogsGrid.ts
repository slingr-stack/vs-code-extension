import { gridColumn, gridView } from "../../../framework/factories/viewFactory";
import { timeLogsEntity } from "../../model/entities/timeLogs";

export const timeLogsGridView = gridView({
    entity: timeLogsEntity,
    columns: {
        description: gridColumn({ field: timeLogsEntity.fields.description }),
        hours: gridColumn({ field: timeLogsEntity.fields.hours }),
        task: gridColumn({ field: timeLogsEntity.fields.task })
    }
});
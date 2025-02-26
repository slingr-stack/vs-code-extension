import { entity } from "../../../framework/factories/entityFactory";
import { text, number, relationship } from "../../../framework/factories/typesFactory";

export const timeLogsEntity = entity({
    label: 'Time Logs',
    name: 'timeLogs',
    fields: {
        description: text({ label: 'Description', name: 'description' }),
        hours: number({ label: 'Hours', name: 'hours', rules: { required: true } }),
        task: relationship({ label: 'Task', name: 'task', entity: 'tasks' })
    }
});
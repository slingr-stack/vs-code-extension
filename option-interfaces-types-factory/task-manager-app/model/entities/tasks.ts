import { entity } from "../../../framework/factories/entityFactory";
import { text, relationship } from "../../../framework/factories/typesFactory";

export const tasksEntity = entity({
    label: 'Tasks',
    name: 'tasks',
    fields: {
        title: text({ label: 'Title', name: 'title', rules: { required: true } }),
        description: text({ label: 'Description', name: 'description' }),
        project: relationship({ label: 'Project', name: 'project', entity: 'projects' })
    }
});
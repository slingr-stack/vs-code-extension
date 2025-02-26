import { entity } from "../../../framework/factories/entityFactory";
import { text } from "../../../framework/factories/typesFactory";

export const projectsEntity = entity({
    label: 'Projects',
    name: 'projects',
    fields: {
        name: text({ label: 'Name', name: 'name', rules: { required: true } }),
        description: text({ label: 'Description', name: 'description' })
    }
});
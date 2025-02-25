import { Entity } from "../entity";

export const entity = (config: Partial<Entity>): Entity => {
    if (!config.name) {
        throw new Error('Name is required');
    }
    if (!config.label) {
        throw new Error('Label is required');
    }
    if (!config.fields || Object.keys(config.fields).length === 0) {
        throw new Error('Fields are required');
    }
    return {
        label: config.label,
        name: config.name,
        fields: config.fields
    };
};
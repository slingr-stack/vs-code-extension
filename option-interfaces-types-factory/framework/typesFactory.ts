import { NumberField, RelationshipField, TextField } from "./entityField";


export const text = (config: Partial<TextField>): TextField => {
    if (config.rules?.maxLength && config.rules.maxLength <= 0) {
        throw new Error('maxLength must be greater than 0');
    }
    return {
        type: 'text',
        label: config.label || 'Text Field',
        name: config.name || 'textField',
        multiplicity: config.multiplicity || 'one',
        rules: config.rules || {},
    };
};

export const numberField = (config: Partial<NumberField>): NumberField => {
    if (config.rules?.maxDecimals && config.rules.maxDecimals < 0) {
        throw new Error('maxDecimals cannot be negative');
    }
    return {
        type: 'number',
        label: config.label || 'Number Field',
        name: config.name || 'numberField',
        multiplicity: config.multiplicity || 'one',
        rules: config.rules || {},
    };
};

export const relationship = (config: Partial<RelationshipField>): RelationshipField => {
    if (!config.entity) {
        throw new Error('Relationship field must have a "entity" to another entity');
    }
    return {
        type: 'relationship',
        label: config.label || 'Relationship Field',
        name: config.name || 'relationshipField',
        multiplicity: config.multiplicity || 'one',
        entity: config.entity,
        rules: config.rules || {},
    };
};


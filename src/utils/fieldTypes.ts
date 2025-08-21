/**
 * Defines a supported argument for a field decorator.
 */
export interface DecoratorArgument {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
}

/**
 * Configuration object that defines how field types are handled in decorators.
 * 
 * This interface provides the mapping and generation logic for converting between
 * TypeScript types and their corresponding field decorators.
 * 
 * @interface FieldTypeConfig
 * 
 * @property {string} [requiredTsType] - The TypeScript type that this decorator requires.
 * For example, a Text decorator might require 'string', while a Number decorator requires 'number'.
 * 
 * @property {string[]} [mapsFromTsTypes] - An array of TypeScript types that can be automatically
 * mapped to this decorator. For instance, 'string' type might suggest using a 'Text' decorator.
 * 
 * @property {function} buildDecoratorString - A function that generates the actual decorator
 * string based on the field metadata and new type. This allows for complex decorator generation
 * that may include additional parameters or custom formatting.
 */
export interface FieldTypeConfig {
    requiredTsType?: string;

    mapsFromTsTypes?: string[];

    supportedArgs: DecoratorArgument[];

    buildDecoratorString: (newTypeName: string, transferredArgs: Map<string, any>) => string;
}

// A generic function to build the decorator string 
function genericBuildDecoratorString(newTypeName: string, transferredArgs: Map<string, any>): string {
    if (transferredArgs.size === 0) {
        return `@${newTypeName}()`;
    }

    const argsString = Array.from(transferredArgs.entries())
        .map(([key, value]) => {
            let formattedValue: string;
            if (typeof value === 'string') {
                formattedValue = `'${value}'`;
            } else {
                formattedValue = String(value);
            }
            return `\n    ${key}: ${formattedValue}`;
        })
        .join(',');

    return `@${newTypeName}({${argsString}\n})`;
}

export const fieldTypeConfig: Record<string, FieldTypeConfig> = {
    // --- String-based Types ---
    'Text': {
        requiredTsType: 'string',
        mapsFromTsTypes: ['string'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
            { name: 'maxLength', type: 'number' },
            { name: 'minLength', type: 'number' },
            { name: 'regex', type: 'string' },
            { name: 'regex', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'LongText': {
        requiredTsType: 'string',
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Email': {
        requiredTsType: 'string',
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Html': {
        requiredTsType: 'string',
        supportedArgs: [
            { name: 'docs', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Number-based Types ---
    'Integer': {
        requiredTsType: 'number',
        mapsFromTsTypes: ['number'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
            { name: 'positive', type: 'boolean' },
            { name: 'negative', type: 'boolean' },
            { name: 'min', type: 'number' },
            { name: 'max', type: 'number' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Money': {
        requiredTsType: 'number',
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'numberOfDecimals', type: 'number' },
            { name: 'roundingType', type: 'enum' },
            { name: 'error', type: 'string' },
            { name: 'positive', type: 'boolean' },
            { name: 'negative', type: 'boolean' },
            { name: 'min', type: 'number' },
            { name: 'max', type: 'number' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Date/Time Types ---
    'Date': {
        requiredTsType: 'Date',
        mapsFromTsTypes: ['Date'],
        supportedArgs: [{ name: 'docs', type: 'string' }],
        buildDecoratorString: genericBuildDecoratorString
    },
    'DateRange': {
        requiredTsType: 'DateRange',
        supportedArgs: [{ name: 'docs', type: 'string' }],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Boolean Type ---
    'Boolean': {
        requiredTsType: 'boolean',
        mapsFromTsTypes: ['boolean'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'defaultValue', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Special Types ---
    'Choice': {
        requiredTsType: undefined,
        supportedArgs: [{ name: 'labels', type: 'object' }],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Relationship': {
        requiredTsType: undefined,
        supportedArgs: [
            { name: 'type', type: 'string' },
            { name: 'filter', type: 'object' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
};
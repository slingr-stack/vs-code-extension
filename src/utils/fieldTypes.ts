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

    supportedArgs: DecoratorArgument[] | undefined;

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
            { name: 'minLength', type: 'number' },
            { name: 'maxLength', type: 'number' },
            { name: 'regex', type: 'string' },
            { name: 'regexMessage', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Email': {
        requiredTsType: 'string',
        mapsFromTsTypes: ['string'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'HTML': {
        requiredTsType: 'string',
        mapsFromTsTypes: ['string'],
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
    'Number': {
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
    'Decimal': {
        requiredTsType: 'number',
        mapsFromTsTypes: ['number'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
            { name: 'precision', type: 'number' },
            { name: 'scale', type: 'number' },
            { name: 'positive', type: 'boolean' },
            { name: 'negative', type: 'boolean' },
            { name: 'min', type: 'number' },
            { name: 'max', type: 'number' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Money': {
        requiredTsType: 'Money',
        mapsFromTsTypes: ['Money'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'decimals', type: 'number' },
            { name: 'roundingType', type: 'enum' },
            { name: 'positive', type: 'boolean' },
            { name: 'negative', type: 'boolean' },
            { name: 'min', type: 'string' },
            { name: 'max', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Date/Time Types ---
    'DateTime': {
        requiredTsType: 'Date',
        mapsFromTsTypes: ['Date'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'min', type: 'object' },
            { name: 'max', type: 'object' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'DateTimeRange': {
        requiredTsType: 'DateTimeRangeValue',
        mapsFromTsTypes: ['DateTimeRangeValue'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'allowOpenRanges', type: 'boolean' },
            { name: 'timezone', type: 'string' },
        ],
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
        supportedArgs: [
            { name: 'docs', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    
    // --- Relationship Types ---
    'Relationship': {
        requiredTsType: undefined,
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'type', type: 'enum' },
            { name: 'elementType', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'onDelete', type: 'enum' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Reference': {
        requiredTsType: undefined,
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'onDelete', type: 'enum' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Composition': {
        requiredTsType: undefined,
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'SharedComposition': {
        requiredTsType: undefined,
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
};
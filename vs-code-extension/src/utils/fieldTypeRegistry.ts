import * as vscode from "vscode";
import { MetadataCache } from "../cache/cache";

/**
 * Interface for tools that can be enhanced with AI assistance.
 * 
 * Tools implementing this interface provide both manual operation and AI-enhanced
 * processing capabilities. The AI enhancement is triggered when users provide
 * additional context or descriptions that can benefit from intelligent analysis.
 */
export interface AIEnhancedTool {
    /**
     * Processes user input with AI enhancement.
     * 
     * This method is called when AI assistance is requested for the tool's operation.
     * It should handle the AI processing workflow including context gathering,
     * prompt generation, and result integration.
     * 
     * @param userInput - Description or context provided by the user for AI processing
     * @param targetUri - Target location (file, folder, or tree item) for the operation
     * @param cache - Metadata cache instance for accessing application context
     * @param additionalContext - Optional additional context for the operation
     * @returns Promise that resolves when the AI-enhanced processing is complete
     */
    processWithAI(
        userInput: string,
        targetUri: vscode.Uri,
        modelName: string,
        cache: MetadataCache,
        additionalContext?: any
    ): Promise<void>;
}

/**
 * Defines a supported argument for a field decorator.
 */
export interface DecoratorArgument {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'enum';
}

/**
 * Comprehensive field type definition that combines configuration and UI display information.
 * 
 * This interface provides complete information about field types including:
 * - UI display properties for user selection
 * - Decorator configuration and arguments
 * - TypeScript type mapping
 * - Decorator string generation logic
 */
export interface FieldTypeDefinition {
    /** Display name for the field type */
    label: string;
    
    /** TypeScript decorator name */
    decorator: string;
    
    /** Required TypeScript type for the field */
    tsType: string;
    
    /** Description of when to use this field type */
    description: string;
    
    /** Alternative TypeScript types that can be mapped to this decorator */
    mapsFromTsTypes?: string[];
    
    /** Supported arguments for the decorator */
    supportedArgs: DecoratorArgument[] | undefined;
    
    /** Function that generates the actual decorator string */
    buildDecoratorString: (newTypeName: string, transferredArgs: Map<string, any>) => string;
}

/**
 * Field information structure used for field creation and modification.
 */
export interface FieldInfo {
    /** Field name in camelCase */
    name: string;
    /** Field type information */
    type: FieldTypeDefinition;
    /** Whether the field is required */
    required: boolean;
    /** Optional description for AI enhancement */
    description?: string;
    /** Additional field-specific configuration */
    additionalConfig?: Record<string, any>;
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

/**
 * Comprehensive field type registry containing all supported field types.
 * This is the single source of truth for field type definitions.
 */
export const FIELD_TYPE_REGISTRY: Record<string, FieldTypeDefinition> = {
    // --- String-based Types ---
    'Text': {
        label: "Text",
        decorator: "Text",
        tsType: "string",
        description: "Short text field with optional length and regex validation",
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
        label: "Email",
        decorator: "Email", 
        tsType: "string",
        description: "Email address with built-in validation",
        mapsFromTsTypes: ['string'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'isUnique', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'HTML': {
        label: "HTML",
        decorator: "HTML",
        tsType: "string",
        description: "Rich text content with HTML support",
        mapsFromTsTypes: ['string'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Number-based Types ---
    'Integer': {
        label: "Integer",
        decorator: "Integer",
        tsType: "number",
        description: "Whole number field with optional range constraints",
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
        label: "Number",
        decorator: "Number",
        tsType: "number",
        description: "Floating-point number field with optional constraints",
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
        label: "Decimal",
        decorator: "Decimal",
        tsType: "number",
        description: "Decimal number with precision and scale control",
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
        label: "Money",
        decorator: "Money",
        tsType: "Money",
        description: "Monetary value with precision control and rounding",
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
        label: "Date Time",
        decorator: "DateTime",
        tsType: "Date",
        description: "Date and time field with optional range constraints",
        mapsFromTsTypes: ['Date'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'min', type: 'object' },
            { name: 'max', type: 'object' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'DateTimeRange': {
        label: "Date Time Range",
        decorator: "DateTimeRange",
        tsType: "DateTimeRangeValue",
        description: "Date and time range field with timezone support",
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
        label: "Boolean",
        decorator: "Boolean",
        tsType: "boolean",
        description: "True/false field",
        mapsFromTsTypes: ['boolean'],
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'defaultValue', type: 'boolean' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },

    // --- Special Types ---
    'Choice': {
        label: "Choice",
        decorator: "Choice",
        tsType: "enum",
        description: "Enumeration field for predefined choices",
        supportedArgs: [
            { name: 'docs', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    
    // --- Relationship Types ---
    'Relationship': {
        label: "Relationship",
        decorator: "Relationship",
        tsType: "object",
        description: "Generic relationship to other models",
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
        label: "Reference",
        decorator: "Reference",
        tsType: "object",  
        description: "Reference relationship to independent models",
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'onDelete', type: 'enum' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'Composition': {
        label: "Composition",
        decorator: "Composition",
        tsType: "object",
        description: "Composition relationship where child cannot exist without parent",
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
    'SharedComposition': {
        label: "Shared Composition",
        decorator: "SharedComposition", 
        tsType: "object",
        description: "Shared composition relationship across multiple models",
        supportedArgs: [
            { name: 'docs', type: 'string' },
            { name: 'load', type: 'boolean' },
            { name: 'elementType', type: 'string' },
        ],
        buildDecoratorString: genericBuildDecoratorString
    },
};

/**
 * Array of field type definitions for UI selection.
 * This provides backward compatibility with FIELD_TYPE_OPTIONS.
 */
export const FIELD_TYPE_OPTIONS: FieldTypeDefinition[] = Object.values(FIELD_TYPE_REGISTRY);


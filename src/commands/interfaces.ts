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
 * Standard field type options available in the framework.
 * These correspond to the decorator types that can be applied to model fields.
 */
export interface FieldTypeOption {
    /** Display name for the field type */
    label: string;
    /** TypeScript decorator name */
    decorator: string;
    /** Required TypeScript type for the field */
    tsType: string;
    /** Description of when to use this field type */
    description: string;
}

/**
 * Available field types in the framework.
 * This constant provides the mapping between user-friendly names and their
 * corresponding decorators and TypeScript types.
 */
export const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
    {
        label: "Text",
        decorator: "Text",
        tsType: "string",
        description: "Short text field with optional length and regex validation"
    },
    {
        label: "Email",
        decorator: "Email",
        tsType: "string",
        description: "Email address with built-in validation"
    },
    {
        label: "HTML",
        decorator: "HTML",
        tsType: "string",
        description: "Rich text content with HTML support"
    },
    {
        label: "Integer",
        decorator: "Integer",
        tsType: "number",
        description: "Whole number field with optional range constraints"
    },
    {
        label: "Number",
        decorator: "Number",
        tsType: "number",
        description: "Floating-point number field with optional constraints"
    },
    {
        label: "Decimal",
        decorator: "Decimal",
        tsType: "number",
        description: "Decimal number with precision and scale control"
    },
    {
        label: "Money",
        decorator: "Money",
        tsType: "Money",
        description: "Monetary value with precision control and rounding"
    },
    {
        label: "Date Time",
        decorator: "DateTime",
        tsType: "Date",
        description: "Date and time field with optional range constraints"
    },
    {
        label: "Date Time Range",
        decorator: "DateTimeRange",
        tsType: "DateTimeRangeValue",
        description: "Date and time range field with timezone support"
    },
    {
        label: "Boolean",
        decorator: "Boolean",
        tsType: "boolean",
        description: "True/false field"
    },
    {
        label: "Choice",
        decorator: "Choice",
        tsType: "enum",
        description: "Enumeration field for predefined choices"
    },
    {
        label: "Relationship",
        decorator: "Relationship",
        tsType: "object",
        description: "Generic relationship to other models"
    },
    {
        label: "Reference",
        decorator: "Reference",
        tsType: "object",
        description: "Reference relationship to independent models"
    },
    {
        label: "Composition",
        decorator: "Composition",
        tsType: "object",
        description: "Composition relationship where child cannot exist without parent"
    },
    {
        label: "Shared Composition",
        decorator: "SharedComposition",
        tsType: "object",
        description: "Shared composition relationship across multiple models"
    }
];

/**
 * Field information structure used for field creation and modification.
 */
export interface FieldInfo {
    /** Field name in camelCase */
    name: string;
    /** Field type information */
    type: FieldTypeOption;
    /** Whether the field is required */
    required: boolean;
    /** Optional description for AI enhancement */
    description?: string;
    /** Additional field-specific configuration */
    additionalConfig?: Record<string, any>;
}

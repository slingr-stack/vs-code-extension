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
        description: "Short text field (up to 255 characters)"
    },
    {
        label: "Long Text",
        decorator: "LongText", 
        tsType: "string",
        description: "Long text field for large content"
    },
    {
        label: "Email",
        decorator: "Email",
        tsType: "string",
        description: "Email address with validation"
    },
    {
        label: "HTML",
        decorator: "Html",
        tsType: "string",
        description: "Rich text content with HTML support"
    },
    {
        label: "Integer",
        decorator: "Integer",
        tsType: "number",
        description: "Whole number field"
    },
    {
        label: "Money",
        decorator: "Money",
        tsType: "number",
        description: "Currency amount field"
    },
    {
        label: "Date",
        decorator: "Date",
        tsType: "Date",
        description: "Date field"
    },
    {
        label: "Date Range",
        decorator: "DateRange",
        tsType: "DateRange",
        description: "Date range field"
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
        tsType: "string", // Will be replaced with actual enum type
        description: "Selection from predefined options"
    },
    {
        label: "Relationship",
        decorator: "Relationship",
        tsType: "object", // Will be replaced with actual model type
        description: "Reference to another model"
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

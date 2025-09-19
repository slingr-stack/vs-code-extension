import * as vscode from 'vscode';
import { DataSourceMetadata, DecoratedClass, DecoratorMetadata, FileMetadata, MetadataCache, PropertyMetadata } from '../cache/cache';
import { TreeViewContext } from '../commands/commandHelpers';

/**
 * Common properties shared across all refactoring payloads.
 */
export interface BasePayload {
    isManual: boolean;
}

/**
 * Context for a manual refactoring operation.
 */
export interface ManualRefactorContext {
    cache: MetadataCache;
    uri: vscode.Uri;
    range: vscode.Range;
    metadata?: DecoratedClass | PropertyMetadata | DataSourceMetadata;
}

// --- Payloads for Specific Change Types ---

export interface RenameModelPayload extends BasePayload {
    oldName: string;
    newName: string;
    oldModelMetadata: DecoratedClass;
    newUri?: vscode.Uri;
}

export interface DeleteModelPayload extends BasePayload {
    oldModelMetadata: DecoratedClass;
    urisToDelete: vscode.Uri[];
}

export interface RenameFieldPayload extends BasePayload {
    oldName: string;
    newName: string;
    modelName: string;
    oldFieldMetadata: PropertyMetadata;
}

export interface CreateModelPayload {
    newModelName: string;
    newUri: vscode.Uri | undefined;
    isManual: boolean;
}

export interface CreateModelPayload {
    newModelName: string;
    newUri: vscode.Uri | undefined;
    isManual: boolean;
}

/**
 * Represents the payload for a delete field operation.
 * This interface encapsulates the necessary information to identify and process
 * the deletion of a field from a specific model.
 *
 * @property `oldFieldMetadata`: The metadata of the field that is being deleted.
 * @property `modelName`: The name of the model from which the field will be deleted.
 * @property `isManual`: Optional flag to indicate if the deletion was triggered manually by a user.
 */
export interface DeleteFieldPayload {
    oldFieldMetadata: PropertyMetadata;
    modelName: string;
    isManual: boolean;
}

export interface ChangeFieldTypePayload extends BasePayload {
    newType: string;
    field: PropertyMetadata;
    decoratorPosition?: vscode.Range;
    oldDecorator?: DecoratorMetadata;
}

/**
 * Payload interface for adding a decorator to a field.
 * @property {PropertyMetadata} fieldMetadata - Metadata information about the property/field
 * @property {string} decoratorName - The name of the decorator to be added
 */
export interface AddDecoratorPayload extends BasePayload {
    fieldMetadata: PropertyMetadata;
    decoratorName: string;
}

export interface RenameDataSourcePayload extends BasePayload {
    oldName: string;
    newName: string;
    newUri?: vscode.Uri;
}

/**
 * Payload interface for changing a reference field to a composition field.
 * This involves removing the @Reference decorator and adding a @Composition decorator,
 * potentially deleting the referenced model if it's not used elsewhere,
 * and creating a component model in the same file.
 * 
 * @property {string} sourceModelName - The name of the model containing the reference field
 * @property {string} fieldName - The name of the reference field to be changed
 * @property {PropertyMetadata} fieldMetadata - Metadata information about the reference field
 * @property {boolean} isManual - Whether the change was initiated manually by the user
 */
export interface ChangeReferenceToCompositionPayload {
    sourceModelName: string;
    fieldName: string;
    fieldMetadata: PropertyMetadata;
    isManual: boolean;
}

/**
 * Base payload interface for extracting fields from a source model.
 * This interface contains common properties for all field extraction operations.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface BaseExtractFieldsPayload {
    sourceModelName: string;
    fieldsToExtract: PropertyMetadata[];
    isManual: boolean;
}

/**
 * Payload interface for extracting fields to a composition model.
 * This involves moving selected fields from a source model to a new composition model
 * and creating a composition relationship between them.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {string} compositionFieldName - The name for the new composition field to be added to the source model
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface AddDecoratorPayload {
    fieldMetadata: PropertyMetadata;
    decoratorName: string;
    isManual: boolean;
}

export interface RenameDataSourcePayload extends BasePayload {
    oldName: string;
    newName: string;
    newUri?: vscode.Uri;
}

/**
 * Payload interface for changing a reference field to a composition field.
 * This involves removing the @Reference decorator and adding a @Composition decorator,
 * potentially deleting the referenced model if it's not used elsewhere,
 * and creating a component model in the same file.
 * 
 * @property {string} sourceModelName - The name of the model containing the reference field
 * @property {string} fieldName - The name of the reference field to be changed
 * @property {PropertyMetadata} fieldMetadata - Metadata information about the reference field
 * @property {boolean} isManual - Whether the change was initiated manually by the user
 */
export interface ChangeReferenceToCompositionPayload {
    sourceModelName: string;
    fieldName: string;
    fieldMetadata: PropertyMetadata;
    isManual: boolean;
}

/**
 * Base payload interface for extracting fields from a source model.
 * This interface contains common properties for all field extraction operations.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface BaseExtractFieldsPayload {
    sourceModelName: string;
    fieldsToExtract: PropertyMetadata[];
    isManual: boolean;
}
export interface ExtractFieldsToCompositionPayload extends BaseExtractFieldsPayload {
    compositionFieldName: string;
}


/**
 * Payload interface for extracting fields to a reference model.
 * This involves moving selected fields from a source model to a new reference model in a separate file
 * and creating a reference relationship between them.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {string} newModelName - The name of the new reference model to be created
 * @property {string} referenceFieldName - The name of the new reference field to be created
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface ExtractFieldsToReferencePayload {
    sourceModelName: string;
    newModelName: string;
    referenceFieldName: string;
}

/**
 * Payload interface for extracting fields to a composition model.
 * This involves moving selected fields from a source model to a new composition model
 * and creating a composition relationship between them.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {string} compositionFieldName - The name for the new composition field to be added to the source model
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface ExtractFieldsToCompositionPayload extends BaseExtractFieldsPayload {
    compositionFieldName: string;
}


/**
 * Payload interface for extracting fields to a reference model.
 * This involves moving selected fields from a source model to a new reference model in a separate file
 * and creating a reference relationship between them.
 * 
 * @property {string} sourceModelName - The name of the source model containing the fields to extract
 * @property {string} newModelName - The name of the new reference model to be created
 * @property {string} referenceFieldName - The name of the new reference field to be created
 * @property {PropertyMetadata[]} fieldsToExtract - The field metadata for all fields being extracted
 * @property {boolean} isManual - Whether the extraction was initiated manually by the user
 */
export interface ExtractFieldsToReferencePayload {
    sourceModelName: string;
    newModelName: string;
    referenceFieldName: string;
    fieldsToExtract: PropertyMetadata[];
    isManual: boolean;
}

export interface DeleteDataSourcePayload extends BasePayload {
    dataSourceName: string;
    urisToDelete: vscode.Uri[];
}

// --- Discriminated Union for ChangeObject ---

/**
 * Defines a mapping from each ChangeType to its corresponding payload interface.
 * This is the core of the discriminated union.
 */
export type ChangePayloadMap = {
    'RENAME_MODEL': RenameModelPayload;
    'DELETE_MODEL': DeleteModelPayload;
    'RENAME_FIELD': RenameFieldPayload;
    'DELETE_FIELD': DeleteFieldPayload;
    'CHANGE_FIELD_TYPE': ChangeFieldTypePayload;
    'ADD_DECORATOR': AddDecoratorPayload;
    'RENAME_DATA_SOURCE': RenameDataSourcePayload;
    'DELETE_DATA_SOURCE': DeleteDataSourcePayload;
    'CHANGE_REFERENCE_TO_COMPOSITION': ChangeReferenceToCompositionPayload;
    'CHANGE_COMPOSITION_TO_REFERENCE': ChangeReferenceToCompositionPayload;
    'EXTRACT_FIELDS_TO_COMPOSITION': ExtractFieldsToCompositionPayload;
    'EXTRACT_FIELDS_TO_REFERENCE': ExtractFieldsToReferencePayload;
    // Add more change types and their payloads as needed
};

/**
 * Represents all possible types of refactoring changes.
 */
export type ChangeType = keyof ChangePayloadMap;

/**
 * A generic ChangeObject that uses the ChangeType to determine the structure of its payload.
 * This creates a robust, type-safe discriminated union.
 * * For each possible `ChangeType`, it creates a specific object type. For example:
 * { type: 'RENAME_MODEL', payload: RenameModelPayload, ... }
 * { type: 'DELETE_FIELD', payload: DeleteFieldPayload, ... }
 * * `ChangeObject` is then a union of all these specific types.
 */
export type ChangeObject = {
    [K in ChangeType]: {
        type: K;
        uri: vscode.Uri;
        description: string;
        payload: ChangePayloadMap[K];
    }
}[ChangeType];


/**
 * Context object containing all necessary information for performing manual refactoring operations.
 * 
 * @interface ManualRefactorContext 
 * @property {MetadataCache} cache - The metadata cache containing processed metadata information
 * @property {vscode.Uri} uri - The URI of the file being refactored
 * @property {vscode.Range} range - The range within the file that is selected for refactoring
 * @property {DecoratedClass | PropertyMetadata} [metadata] - Optional specific metadata item being targeted for refactoring
 */
export interface ManualRefactorContext {
    cache: MetadataCache;
    uri: vscode.Uri;
    range: vscode.Range;
    metadata?: DecoratedClass | PropertyMetadata | DataSourceMetadata;
    treeViewContext?: TreeViewContext;
    
}

/**
 * Defines the contract for any refactoring tool.
 */
/**
 * Interface defining a refactoring tool that can analyze code changes and generate workspace edits.
 * 
 * Refactor tools support both automatic and manual refactoring workflows:
 * - **Automatic**: Analyzes file diffs to detect changes and generate corresponding edits when files are saved/deleted
 * - **Manual**: Provides user-triggered refactoring actions through VS Code's Code Actions menu
 * 
 * @example
 * ```typescript
 * class RenameClassTool implements IRefactorTool {
 *   getCommandId() { return 'refactor.renameClass'; }
 *   getHandledChangeTypes() { return ['RENAME_CLASS']; }
 *   // ... implement other methods
 * }
 * ```
 * 
 * @see {@link ChangeObject} for the change representation format
 * @see {@link ManualRefactorContext} for manual refactoring context
 * @see {@link MetadataCache} for caching file metadata during refactoring
 */
export interface IRefactorTool {
    /**
     * A unique identifier for the command associated with this tool.
     */
    getCommandId(): string;

    /**
     * The human-readable title for the refactor action.
     */
    getTitle(): string;

    /**
     * Returns an array of ChangeObject types that this tool can handle.
     * e.g., ['RENAME_CLASS', 'MOVE_CLASS']
     */
    getHandledChangeTypes(): string[];

    /**
    * Checks if the tool can be manually triggered in the given context.
    * This is used to populate the Code Actions (lightbulb) menu.
    */
    canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean>;

    /**
     * --- For Automatic Refactoring ---
     * Analyzes a file diff and returns a list of changes this tool is responsible for.
     * This method has NO side effects.
     */
    analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges?: ChangeObject[]): ChangeObject[];
    
    /**
     * --- For Manual Refactoring ---
     * Handles user interaction for a manual refactor (e.g., showing an input box)
     * and returns a single ChangeObject if the user proceeds.
     */
    initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined>;
    
    /**
     * --- For All Refactoring ---
     * Takes a ChangeObject and generates all necessary text edits for the refactor.
     * This method has NO side effects.
     */
    prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit>;

    /**
     * --- Post-Refactoring ---
     * Executes a custom prompt in VS Code's chat interface after a successful refactoring operation.
     * This allows each tool to provide context-specific guidance or information about the refactoring.
     */
    executePrompt?(change: ChangeObject): Promise<void>;
}

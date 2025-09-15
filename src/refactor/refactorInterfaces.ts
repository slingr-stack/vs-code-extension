import * as vscode from 'vscode';
import { DatasetFileMetadata, DatasetMetadata, DataSourceMetadata, DecoratedClass, DecoratorMetadata, FileMetadata, MetadataCache, PropertyMetadata } from '../cache/cache';

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
    metadata?: DecoratedClass | PropertyMetadata | DataSourceMetadata | DatasetMetadata | DatasetFileMetadata;
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

export interface DeleteFieldPayload extends BasePayload {
    oldFieldMetadata: PropertyMetadata;
    modelName: string;
}

export interface ChangeFieldTypePayload extends BasePayload {
    newType: string;
    field: PropertyMetadata;
    decoratorPosition?: vscode.Range;
    oldDecorator?: DecoratorMetadata;
}

export interface AddDecoratorPayload extends BasePayload {
    fieldMetadata: PropertyMetadata;
    decoratorName: string;
}

export interface RenameDataSourcePayload extends BasePayload {
    oldName: string;
    newName: string;
    newUri?: vscode.Uri;
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
    metadata?: DecoratedClass | PropertyMetadata | DataSourceMetadata | DatasetMetadata | DatasetFileMetadata;
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

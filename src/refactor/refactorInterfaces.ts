import * as vscode from 'vscode';
import { DecoratedClass, DecoratorMetadata, FileMetadata, MetadataCache, PropertyMetadata } from '../cache/cache';

/**
 * Context object containing all necessary information for performing refactoring operations.
 * 
 * @interface RefactorContext
 */
export interface RefactorContext {
    cache: MetadataCache;
    uri: vscode.Uri;
    range: vscode.Range;
    metadata?: DecoratedClass | PropertyMetadata; 
    newName?: string; 
    isAutoTriggered?: boolean; 
}

/**
 * Defines the payload for a rename model operation.
 * It encapsulates all the necessary information to process the renaming of an model.
 *
 * @property `oldName`: The original name of the model being renamed.
 * @property `newName`: The new name to be assigned to the model.
 * @property `oldModelMetadata`: The metadata of the class representing the model before the rename.
 * @property `isManual`: An optional flag indicating whether the rename operation was initiated manually by a user.
 */
export interface RenameModelPayload {
    oldName: string;
    newName: string;
    oldModelMetadata: DecoratedClass;
    isManual: boolean;
}

/**
 * Represents the payload for an model deletion operation.
 * It contains all the necessary information to process the removal of an model
 * and its associated files from the workspace.
 *
 * @property `oldModelMetadata`:- The metadata of the model being deleted.
 * @property `isManual`: An optional flag indicating if the deletion was initiated manually by the user.
 * @property `urisToDelete`: An array of file URIs that should be removed from the workspace.
 */
export interface DeleteModelPayload {
    oldModelMetadata: DecoratedClass;
    urisToDelete: vscode.Uri[];
    isManual: boolean;
}

/**
 * Defines the payload for a field renaming operation. This interface encapsulates
 * all the necessary information to perform the refactoring.
 *
 * @property `oldName`: The original name of the field being renamed.
 * @property `newName`: The desired new name for the field.
 * @property `modelName`: The name of the model that contains the field.
 * @property `oldFieldMetadata`: The metadata of the field before the renaming operation, used to preserve its properties (e.g., type, constraints).
 * @property `isManual`: An optional flag to indicate if the rename was initiated manually by a user, as opposed to an automated process.
 */
export interface RenameFieldPayload {
    oldName: string;
    newName: string;
    modelName: string;
    oldFieldMetadata: PropertyMetadata;
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
/**
 * Defines the payload for an action that changes the type of a class property.
 * This interface encapsulates all the necessary information to perform the refactoring,
 * such as the target field, the new type, and context about the existing decorator.
 *
 * @property `newType`: The new data type to be assigned to the field.
 * @property `field`: Metadata of the property whose type is being changed.
 * @property `isManual`: A boolean flag indicating whether the change was initiated manually by the user.
 * @property `decoratorPosition`: Optional. The range in the document where the old decorator is located.
 * @property `oldDecorator`: Optional. Metadata of the decorator that is being replaced or modified.
 */
export interface ChangeFieldTypePayload {
    newType: string;
    field: PropertyMetadata;
    decoratorPosition?: vscode.Range;
    oldDecorator?: DecoratorMetadata;
    isManual: boolean;
}


/**
 * Payload interface for adding a decorator to a field.
 * @property {PropertyMetadata} fieldMetadata - Metadata information about the property/field
 * @property {string} decoratorName - The name of the decorator to be added
 */
export interface AddDecoratorPayload {
    fieldMetadata: PropertyMetadata;
    decoratorName: string;
    isManual: boolean;
}


/**
 * Represents the specific type of refactoring change being applied.
 * This is used to identify the nature of a modification to an model or its fields.
 *
 * - `RENAME_ENTITY`: A change that renames an entire model.
 * - `DELETE_ENTITY`: A change that deletes an entire model.
 * - `RENAME_FIELD`: A change that renames a field within an model.
 * - `DELETE_FIELD`: A change that deletes a field from an model.
 * - `CHANGE_FIELD_TYPE`: A change that modifies the data type of a field.
 * - `ADD_DECORATOR`: A change that adds a decorator to a field.
 */
export type ChangeType = 'RENAME_ENTITY' | 'DELETE_ENTITY' | 'RENAME_FIELD' | 'DELETE_FIELD' | 'CHANGE_FIELD_TYPE'| 'ADD_DECORATOR';

/**
 * Represents a single, atomic change to be applied as part of a refactoring operation.
 * Each change object encapsulates the type of modification, the file it affects,
 * a human-readable description, and the specific data required to perform the change.
 *
 * @property type The type of change to be performed, as defined by the `ChangeType` enum.
 * @property uri The URI of the file that will be modified.
 * @property description A human-readable string describing the change, often shown to the user for confirmation.
 * @property payload The data payload containing the specific details for the change. The structure of the payload depends on the `type` property.
 */
export interface ChangeObject {
    type: ChangeType;
    uri: vscode.Uri;
    description: string;
    payload:
        | RenameModelPayload
        | DeleteModelPayload
        | RenameFieldPayload
        | DeleteFieldPayload
        | ChangeFieldTypePayload
        | AddDecoratorPayload;
}


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
    metadata?: DecoratedClass | PropertyMetadata;
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

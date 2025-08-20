import * as vscode from 'vscode';
import { DecoratedClass, FileMetadata, MetadataCache, PropertyMetadata } from '../cache/cache';

/**
 * Context object containing all necessary information for performing refactoring operations.
 * 
 * @interface RefactorContext
 * @example
 * ```typescript
 * const context: RefactorContext = {
 *   cache: metadataCache,
 *   uri: document.uri,
 *   range: selection.range,
 *   metadata: classMetadata,
 *   newName: 'NewClassName'
 * };
 * ```
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
 * Represents a refactoring change operation that can be applied to source code.
 * 
 * This interface defines the structure for change objects that encapsulate
 * all necessary information to perform a specific refactoring operation,
 * including the type of change, target file location, and operation-specific data.
 * 
 * @example
 * ```typescript
 * const renameChange: ChangeObject = {
 *   type: 'RENAME_CLASS',
 *   uri: vscode.Uri.file('/path/to/file.ts'),
 *   description: 'Rename class from OldName to NewName',
 *   payload: { oldName: 'OldName', newName: 'NewName' }
 * };
 * ```
 */
export interface ChangeObject {
    type: string;
    uri: vscode.Uri;
    description: string;
    payload: { [key: string]: any };
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

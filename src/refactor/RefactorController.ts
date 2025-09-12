import * as vscode from "vscode";
import { ChangeObject, IRefactorTool, ManualRefactorContext, DeleteModelPayload, RenameModelPayload } from "./refactorInterfaces";
import { findNodeAtPosition } from "../utils/ast";
import { MetadataCache } from "../cache/cache";
import { AppTreeItem } from "../explorer/appTreeItem";

/**
 * Controls and orchestrates refactoring operations within the VS Code extension.
 * 
 * The RefactorController serves as the central coordinator for all refactoring activities,
 * managing both manual user-initiated refactors and automatic refactors detected through
 * metadata analysis. It maintains a collection of refactoring tools and handles the
 * complete refactoring workflow from detection to user approval and application.
 * 
 * @remarks
 * Key responsibilities include:
 * - Managing a registry of refactoring tools and their supported change types
 * - Handling manual refactoring commands from tree view items and editor selections
 * - Processing automatic refactoring proposals detected by metadata cache analysis
 * - Preparing and merging workspace edits while avoiding duplicate modifications
 * - Presenting changes to users through VS Code's built-in refactor preview UI
 * - Coordinating file operations including text edits and file deletions
 * 
 * The controller uses a change handler map to efficiently route different types of
 * changes to their appropriate refactoring tools. It includes safeguards to prevent
 * concurrent edit operations and provides comprehensive error handling throughout
 * the refactoring process.
 * 
 * @example
 * ```typescript
 * const tools = [new RenameActionTool(), new DeleteModelTool()];
 * const controller = new RefactorController(tools, metadataCache);
 * 
 * // Handle manual refactor command
 * await controller.handleManualRefactorCommand('rename-action', treeItem);
 * 
 * // Process automatic refactors
 * await controller.proposeAutomaticRefactors(detectedChanges);
 * ```
 */
export class RefactorController {
  private tools: IRefactorTool[];
  private changeHandlerMap: Map<string, IRefactorTool> = new Map();
  private isApplyingEdit = false;

  /**
   * Initializes the RefactorController with a list of tools and a metadata cache.
   * It sets up the change handler map to associate change types with their respective tools.
   * @param tools An array of refactor tools that can handle different change types.
   * @param cache The metadata cache used for finding nodes and managing context.
   */
  constructor(tools: IRefactorTool[], private cache: MetadataCache) {
    this.tools = tools;
    for (const tool of this.tools) {
      for (const type of tool.getHandledChangeTypes()) {
        this.changeHandlerMap.set(type, tool);
      }
    }
  }

  /**
   * Handles manual refactoring commands triggered by user interaction.
   * This method processes refactoring commands from various contexts including tree view items
   * and editor selections. It validates the command, determines the appropriate refactoring context,
   * executes the refactoring tool, and presents the changes for user approval.
   * @param commandId - The identifier of the refactoring command to execute
   * @param context - Optional context providing either a URI or AppTreeItem for the refactoring target.
   * If not provided, uses the active text editor as the target.
   * @returns A Promise that resolves when the refactoring operation is complete
   * @remarks
   * - Shows error message if the command ID is not recognized
   * - For AppTreeItem context, uses the item's metadata for refactoring scope
   * - For URI context or no context, uses the active editor's selection or cursor position
   * - Presents changes for user approval before applying them
   * - Shows information message if no changes are needed
   */
  public async handleManualRefactorCommand(commandId: string, context?: vscode.Uri | AppTreeItem | ManualRefactorContext, decoratorName?: string) {
    const tool = this.tools.find((t) => t.getCommandId() === commandId);
    if (!tool) {
      vscode.window.showErrorMessage(`Unknown refactoring command: ${commandId}`);
      return;
    }

    let refactorContext: ManualRefactorContext | undefined;

    if (context instanceof AppTreeItem) {
      if (!context.metadata) {
        vscode.window.showInformationMessage("No metadata found for the selected item.");
        return;
      }
      refactorContext = {
        cache: this.cache,
        uri: context.metadata.declaration.uri,
        range: context.metadata.declaration.range,
        metadata: context.metadata,
      };
    } else if (context instanceof vscode.Uri) {
      const fileMeta = this.cache.getMetadataForFile(context.fsPath);
      if (!fileMeta || Object.keys(fileMeta.classes).length === 0) {
        vscode.window.showInformationMessage("No class found in the selected file to refactor.");
        return;
      }
      // When triggered from file explorer, we assume the target is the first class in the file.
      const targetClass = Object.values(fileMeta.classes)[0];
      refactorContext = {
        cache: this.cache,
        uri: context,
        range: targetClass.declaration.range,
        metadata: targetClass,
      };
    } else if (context && 'cache' in context && 'uri' in context) {
      refactorContext = context as ManualRefactorContext;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Cannot determine file for refactoring. Please open a file.");
        return;
      }
      const position = editor.selection.active;
      refactorContext = {
        cache: this.cache,
        uri: editor.document.uri,
        range: new vscode.Range(position, position),
        metadata: await findNodeAtPosition(editor.document.uri, position),
      };
    }

    if (!refactorContext) {
      vscode.window.showErrorMessage("Could not determine the context for refactoring.");
      return;
    }
    const changeObject = await (tool as any).initiateManualRefactor(refactorContext, decoratorName);
    if (changeObject) {
      const workspaceEdit = await this.prepareWorkspaceEdit([changeObject]);
      if (!workspaceEdit) {
        return;
      }

      const hasTextEdits = workspaceEdit.size > 0;
      let hasFileDeletions = false;
      if (changeObject.type === 'DELETE_MODEL') {
        const deletePayload = changeObject.payload as DeleteModelPayload;
        hasFileDeletions = Array.isArray(deletePayload.urisToDelete) && deletePayload.urisToDelete.length > 0;
      }
      if (!hasTextEdits && !hasFileDeletions) {
        vscode.window.showInformationMessage("No changes were needed for this refactoring.");
        return;
      }
      await this.presentChangesForApproval(workspaceEdit, changeObject);
    }
  }

  /**
   * Presents workspace changes to the user for approval and handles post-approval analysis.
   * 
   * This method applies the workspace edit with proper confirmation metadata on existing edits
   * to trigger VS Code's refactoring preview UI, and optionally runs AI analysis on the changes
   * after user approval to help identify and fix potential errors.
   * 
   * @param workspaceEdit - The VS Code WorkspaceEdit containing all file changes to be applied
   * @param changeObject - The primary change object being processed, used as an anchor for the preview
   * @param allChanges - Optional array of all changes for automatic refactors with multiple operations
   * 
   * @returns A Promise that resolves when the approval process and any follow-up analysis is complete
   * 
   * @remarks
   * - Annotates existing text edits with confirmation metadata to trigger VS Code's preview UI
   * - Prefers to annotate edits on the anchor URI when available, otherwise uses the first available edit
   * - Includes file operations (deletions and renames) from the change payloads in the workspace edit
   * - After successful application, saves all documents and optionally runs AI analysis
   * - Uses a timeout to reset the `isApplyingEdit` flag to prevent race conditions
   */
  private async presentChangesForApproval(
    workspaceEdit: vscode.WorkspaceEdit,
    changeObject: ChangeObject,
    allChanges?: ChangeObject[] 
  ): Promise<void> {
    const anchorUri = changeObject.uri;
    const isDelete = changeObject.type === "DELETE_MODEL";

    let uriForDummyChange = anchorUri;

    if (isDelete) {
      const safeUriFromEdit = workspaceEdit.entries().find(([uri]) => uri.toString() !== anchorUri.toString())?.[0];
      if (safeUriFromEdit) {
        uriForDummyChange = safeUriFromEdit;
      } else {
        const safeDocument = vscode.workspace.textDocuments.find(
          (doc) => !doc.isClosed && doc.uri.toString() !== anchorUri.toString()
        );
        if (safeDocument) {
          uriForDummyChange = safeDocument.uri;
        }
      }
    }

    // Try to mark one real edit with confirmation metadata instead of adding a dummy edit.
    // We will copy all existing edits into a new WorkspaceEdit and annotate the first suitable
    // text edit (preferably on the same URI as the anchor change) with `needsConfirmation`.
    const metadata: vscode.WorkspaceEditEntryMetadata = {
      needsConfirmation: true,
      label: "Review All Refactoring Changes",
    };

    let editToApply: vscode.WorkspaceEdit = workspaceEdit;
    try {
      // Find a candidate edit to annotate
      let chosenUri: vscode.Uri | undefined;
      let chosenIndex = -1;

      // Prefer an edit on the anchorUri
      for (const [uri, textEdits] of workspaceEdit.entries()) {
        if (textEdits.length > 0 && uri.toString() === anchorUri.toString()) {
          chosenUri = uri;
          chosenIndex = 0;
          break;
        }
      }

      // Otherwise pick the first available edit
      if (!chosenUri) {
        for (const [uri, textEdits] of workspaceEdit.entries()) {
          if (textEdits.length > 0) {
            chosenUri = uri;
            chosenIndex = 0;
            break;
          }
        }
      }

      if (chosenUri) {
        // Build a new WorkspaceEdit copying all edits, but annotate the chosen edit
        const annotated = new vscode.WorkspaceEdit();
        for (const [uri, textEdits] of workspaceEdit.entries()) {
          for (let i = 0; i < textEdits.length; i++) {
            const te = textEdits[i];
            const isChosen = uri.toString() === chosenUri!.toString() && i === chosenIndex;
            if (isChosen) {
              annotated.replace(uri, te.range, te.newText, metadata);
              // remember which uri we annotated so we can use it if needed (for logging/fallback)
              uriForDummyChange = uri;
            } else {
              annotated.replace(uri, te.range, te.newText);
            }
          }
        }
        // We have to add the file renames and deletions from the original changes
        const changesToProcess = allChanges || [changeObject];
        for (const change of changesToProcess) {
          if (change.type === 'DELETE_MODEL') {
            const deletePayload = change.payload as DeleteModelPayload;
            if (Array.isArray(deletePayload.urisToDelete)) {
              for (const uri of deletePayload.urisToDelete) {
                annotated.deleteFile(uri, { recursive: true, ignoreIfNotExists: true });
              }
            }
          }
          
          if (change.type === 'RENAME_MODEL') {
            const renamePayload = change.payload as RenameModelPayload;
            if (renamePayload.newUri) {
              annotated.renameFile(change.uri, renamePayload.newUri);
            }
          }
        }
        editToApply = annotated;
      } 
    } catch (e) {
      console.error("Error while annotating workspace edits for review:", e);
    }

    this.isApplyingEdit = true;
    try {
      const success = await vscode.workspace.applyEdit(editToApply);
      if (success) {
        await vscode.workspace.saveAll(false);
        const changesToProcess = allChanges || [changeObject];
        // Check for compilation errors after applying changes
        const changesWithPrompts = changesToProcess.filter(change => {
          const tool = this.changeHandlerMap.get(change.type);
          return tool?.executePrompt;
        });

        if (changesWithPrompts.length > 0) {
          const modifiedUris = this.collectModifiedUris(editToApply, changesToProcess);

          // this catches pre-existing and new errors added by the refactor
          const hasErrors = await this.checkForCompilationErrors(modifiedUris);

          // Only prompt for AI analysis if errors are detected
          if (hasErrors) {
            const promptConfirmation = await vscode.window.showWarningMessage(
              `Compilation errors were detected after applying the refactoring changes. Would you like to run AI analysis to help identify and fix these errors?`,
              { modal: false },
              "Yes, Analyze Errors",
              "No, Skip Analysis"
            );

            if (promptConfirmation === "Yes, Analyze Errors") {
              // Execute custom prompts for the changes
              for (const change of changesWithPrompts) {
                const tool = this.changeHandlerMap.get(change.type);
                if (tool?.executePrompt) {
                  try {
                    await tool.executePrompt(change);
                  } catch (error) {
                    console.error(`Error executing prompt for change ${change.type}:`, error);
                    vscode.window.showWarningMessage(`Failed to execute analysis for ${change.description}: ${error}`);
                  }
                }
              }
            }
          }
        }
      } else {
        vscode.window.showInformationMessage("Refactoring was canceled by the user.");
      }
    } finally {
      setTimeout(() => {
        this.isApplyingEdit = false;
      }, 500);
    }
  }

  /**
   * Proposes automatic refactoring suggestions based on detected changes.
   * 
   * This method analyzes the provided changes and prepares a workspace edit containing
   * potential refactoring operations. If changes are detected, it prompts the user for
   * permission to review the proposed refactors before applying them.
   * 
   * @param changes - Array of change objects representing detected modifications that could benefit from refactoring
   * @returns A promise that resolves when the refactoring proposal process is complete
   * 
   * @remarks
   * - Returns early if currently applying an edit or if no changes are provided
   * - Only proceeds with user confirmation before presenting changes for review
   * - Uses the first change object when presenting changes for approval
   */
  public async proposeAutomaticRefactors(changes: ChangeObject[]): Promise<void> {
    if (this.isApplyingEdit || changes.length === 0) {
      return;
    }

    const workspaceEdit = await this.prepareWorkspaceEdit(changes);
    if (workspaceEdit && workspaceEdit.size > 0) {
      const confirmation = await vscode.window.showInformationMessage(
        `The extension has detected ${changes.length} potential refactoring(s). Would you like to review them?`,
        "Review Changes"
      );

      if (confirmation === "Review Changes") {
        await this.presentChangesForApproval(workspaceEdit, changes[0], changes);
      }
    }
  }

  /**
   * Prepares a workspace edit by processing an array of change objects and merging their edits.
   * 
   * This method iterates through the provided changes, uses the appropriate change handlers to generate
   * text edits, and ensures no duplicate edits are applied to the same range. It also handles file
   * deletions when specified in the change payload.
   * 
   * @param changes - Array of change objects to be processed into workspace edits
   * @returns A Promise that resolves to a WorkspaceEdit containing all merged changes, or undefined if an error occurs
   * 
   * @remarks
   * - Edits are deduplicated based on their exact range location (line and character positions)
   * - File deletions are processed with recursive and ignoreIfNotExists options
   * - If any change handler throws an error, an error message is shown and undefined is returned
   * - The method uses a cache through PrepareEditContext for optimization
   */
  private async prepareWorkspaceEdit(changes: ChangeObject[]): Promise<vscode.WorkspaceEdit | undefined> {
    const mergedEdit = new vscode.WorkspaceEdit();
    const modifiedRanges = new Set<string>();
    const allUniqueEdits = new Map<string, vscode.TextEdit[]>();

    for (const change of changes) {
      const tool = this.changeHandlerMap.get(change.type);
      if (tool) {
        try {

          const editFromTool = await tool.prepareEdit(change, this.cache);
          for (const [uri, textEdits] of editFromTool.entries()) {
            const uriString = uri.toString();
            const existingEdits = allUniqueEdits.get(uriString) || [];

            for (const edit of textEdits) {
              const rangeId = `${uriString}::${edit.range.start.line}:${edit.range.start.character}-${edit.range.end.line}:${edit.range.end.character}`;
              if (!modifiedRanges.has(rangeId)) {
                modifiedRanges.add(rangeId);
                existingEdits.push(edit);
              }
            }
            // Note: modifiedRanges was not part of the original payload interface
            // change.payload.modifiedRanges = Array.from(modifiedRanges);

            if (existingEdits.length > 0) {
              allUniqueEdits.set(uriString, existingEdits);
            }

          }

          if (change.type === 'DELETE_MODEL') {
            const deletePayload = change.payload as DeleteModelPayload;
            if (Array.isArray(deletePayload.urisToDelete)) {
              for (const uri of deletePayload.urisToDelete) {
                mergedEdit.deleteFile(uri, { recursive: true, ignoreIfNotExists: true });
              }
            }
          }

          if (change.type === 'RENAME_MODEL') {
            const renamePayload = change.payload as RenameModelPayload;
            if (renamePayload.newUri) {
              mergedEdit.renameFile(change.uri, renamePayload.newUri);
            }
          }

        } catch (error) {
          vscode.window.showErrorMessage(`Error preparing refactor for '${change.description}': ${error}`);
          return undefined;
        }
      }
    }

    for (const [uriString, edits] of allUniqueEdits) {
      mergedEdit.set(vscode.Uri.parse(uriString), edits);
    }
    return mergedEdit;
  }

  /**
   * Collects all file URIs that were modified during the refactoring operation.
   * 
   * This method gathers URIs from both the workspace edit entries and the change objects
   * to create a comprehensive list of files that should be checked for compilation errors.
   * 
   * @param workspaceEdit - The workspace edit containing text modifications
   * @param changes - Array of change objects that triggered the refactoring
   * @returns A Set of unique URIs representing all modified files
   */
  private collectModifiedUris(workspaceEdit: vscode.WorkspaceEdit, changes: ChangeObject[]): Set<vscode.Uri> {
    const modifiedUris = new Set<vscode.Uri>();
    for (const [uri] of workspaceEdit.entries()) {
      modifiedUris.add(uri);
    }
    for (const change of changes) {
      modifiedUris.add(change.uri);
    }

    return modifiedUris;
  }

  /**
   * Checks for compilation errors in the specified files.
   * 
   * This method uses VS Code's diagnostic API to detect compilation errors
   * in the provided file URIs. It's useful for determining whether a refactoring
   * operation has introduced any syntax or type errors that need attention.
   * 
   * @param uris - Set of file URIs to check for compilation errors
   * @returns A Promise that resolves to true if any compilation errors are found, false otherwise
   * 
   * @remarks
   * - Only checks for diagnostics with Error severity level
   * - Gracefully handles cases where diagnostics cannot be retrieved for a file
   * - Returns false if all files are error-free or if no diagnostics can be obtained
   */
  private async checkForCompilationErrors(uris: Set<vscode.Uri>): Promise<boolean> {
    for (const uri of uris) {
      try {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length > 0) {
          return true;
        }
      } catch (error) {
        // If we can't get diagnostics, we'll skip the error check for this file
        console.warn(`Could not get diagnostics for ${uri.fsPath}:`, error);
      }
    }
    return false;
  }

  /**
   * Retrieves the list of available refactor tools.
   * 
   * @returns An array of refactor tools that are currently registered with this controller.
   */
  public getTools(): IRefactorTool[] {
    return this.tools;
  }
}

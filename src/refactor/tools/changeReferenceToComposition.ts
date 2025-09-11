import * as vscode from "vscode";
import { 
  IRefactorTool, 
  ChangeObject, 
  ManualRefactorContext,
} from "../refactorInterfaces";
import { MetadataCache, PropertyMetadata, DecoratedClass } from "../../cache/cache";
import { ChangeReferenceToCompositionTool } from "../../commands/fields/changeReferenceToComposition";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { isModelFile } from "../../utils/metadata";

/**
 * Payload interface for changing a reference field to a composition field.
 */
export interface ChangeReferenceToCompositionPayload {
  sourceModelName: string;
  fieldName: string;
  fieldMetadata: PropertyMetadata;
  isManual: boolean;
}

/**
 * Refactor tool for converting reference fields to composition fields.
 * 
 * This tool allows users to convert @Reference fields to @Composition fields
 * through the VS Code refactor menu. It validates that the field is indeed
 * a reference field before allowing the conversion.
 */
export class ChangeReferenceToCompositionRefactorTool implements IRefactorTool {
  
  /**
   * Returns the VS Code command identifier for this refactor tool.
   */
  getCommandId(): string {
    return "slingr-vscode-extension.changeReferenceToComposition";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Change Reference to Composition";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["CHANGE_REFERENCE_TO_COMPOSITION"];
  }

  /**
   * Determines if this tool can handle a manual refactor trigger.
   * Only allows conversion if the field is a reference field.
   */
  async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
    // Must be in a model file
    if (!isModelFile(context.uri)) {
      return false;
    }

    // Must have field metadata
    if (!context.metadata || !('decorators' in context.metadata)) {
      return false;
    }

    const fieldMetadata = context.metadata as PropertyMetadata;
    
    // Check if this field has a @Reference decorator
    const hasReferenceDecorator = fieldMetadata.decorators.some(d => d.name === "Reference");
    
    return hasReferenceDecorator;
  }

  /**
   * This tool doesn't detect automatic changes.
   */
  analyze(): ChangeObject[] {
    return [];
  }

  /**
   * Initiates the manual refactor by creating a change object.
   */
  async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
    if (!context.metadata || !('decorators' in context.metadata)) {
      return undefined;
    }

    const fieldMetadata = context.metadata as PropertyMetadata;
    
    // Find the model that contains this field
    const cache = context.cache;
    const sourceModel = this.findSourceModel(cache, fieldMetadata);
    
    if (!sourceModel) {
      vscode.window.showErrorMessage("Could not find the model containing this field");
      return undefined;
    }

    const payload: ChangeReferenceToCompositionPayload = {
      sourceModelName: sourceModel.name,
      fieldName: fieldMetadata.name,
      fieldMetadata: fieldMetadata,
      isManual: true,
    };

    return {
      type: "CHANGE_REFERENCE_TO_COMPOSITION",
      uri: context.uri,
      description: `Change reference field '${fieldMetadata.name}' to composition in model '${sourceModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   * This delegates to the actual implementation tool.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ChangeReferenceToCompositionPayload;
    
    // We don't actually prepare the edit here since the command tool handles everything
    // This is more of a trigger for the actual implementation
    const workspaceEdit = new vscode.WorkspaceEdit();
    
    // Execute the actual command
    setTimeout(async () => {
      try {
        // Get the explorer provider from the extension context
        // For now, we'll create a mock explorer provider 
        const explorerProvider = {
          refresh: () => {}
        } as any;
        
        const tool = new ChangeReferenceToCompositionTool(explorerProvider);
        await tool.changeReferenceToComposition(
          cache,
          payload.sourceModelName,
          payload.fieldName
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to change reference to composition: ${error}`);
      }
    }, 100);

    return workspaceEdit;
  }

  /**
   * Finds the model that contains the given field.
   */
  private findSourceModel(cache: MetadataCache, fieldMetadata: PropertyMetadata): DecoratedClass | null {
    const allModels = cache.getDataModelClasses();
    
    for (const model of allModels) {
      const fieldInModel = Object.values(model.properties).find(
        prop => prop.name === fieldMetadata.name && 
               prop.declaration.uri.fsPath === fieldMetadata.declaration.uri.fsPath &&
               prop.declaration.range.start.line === fieldMetadata.declaration.range.start.line
      );
      
      if (fieldInModel) {
        return model;
      }
    }
    
    return null;
  }
}

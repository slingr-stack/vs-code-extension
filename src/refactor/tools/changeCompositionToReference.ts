import * as vscode from "vscode";
import { 
  IRefactorTool, 
  ChangeObject, 
  ManualRefactorContext,
} from "../refactorInterfaces";
import { MetadataCache, PropertyMetadata, DecoratedClass } from "../../cache/cache";
import { ChangeCompositionToReferenceTool } from "../../commands/fields/changeCompositionToReference";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { isModelFile } from "../../utils/metadata";

/**
 * Payload interface for changing a composition field to a reference field.
 */
export interface ChangeCompositionToReferencePayload {
  sourceModelName: string;
  fieldName: string;
  fieldMetadata: PropertyMetadata;
  isManual: boolean;
}

/**
 * Refactor tool for converting composition fields to reference fields.
 * 
 * This tool allows users to convert @Composition fields to @Reference fields
 * through the VS Code refactor menu. It validates that the field is indeed
 * a composition field before allowing the conversion.
 */
export class ChangeCompositionToReferenceRefactorTool implements IRefactorTool {
  
  /**
   * Returns the VS Code command identifier for this refactor tool.
   */
  getCommandId(): string {
    return "slingr-vscode-extension.changeCompositionToReference";
  }

  /**
   * Returns the human-readable title shown in refactor menus.
   */
  getTitle(): string {
    return "Change Composition to Reference";
  }

  /**
   * Returns the types of changes this tool handles.
   */
  getHandledChangeTypes(): string[] {
    return ["CHANGE_COMPOSITION_TO_REFERENCE"];
  }

  /**
   * Determines if this tool can handle a manual refactor trigger.
   * Only allows conversion if this is a component model that has a parent with a composition field.
   */
  async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
    // Must be in a model file
    if (!isModelFile(context.uri)) {
      return false;
    }

    // Must have class metadata (since composition fields are shown as models in explorer)
    if (!context.metadata || !('name' in context.metadata)) {
      return false;
    }

    const componentModel = context.metadata as DecoratedClass;
    
    // Check if this is a component model by looking for a parent model with a composition field pointing to it
    const parentFieldInfo = this.findParentCompositionField(context.cache, componentModel);
    
    return parentFieldInfo !== null;
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

    // When right-clicking on a composition field (shown as a model in explorer),
    // context.metadata is the component model, not the field metadata
    const componentModel = context.metadata as DecoratedClass;
    
    // Find the parent model and field that has a composition relationship to this component model
    const cache = context.cache;
    const parentFieldInfo = this.findParentCompositionField(cache, componentModel);
    
    if (!parentFieldInfo) {
      vscode.window.showErrorMessage("Could not find the parent model with composition field for this component model");
      return undefined;
    }

    const payload: ChangeCompositionToReferencePayload = {
      sourceModelName: parentFieldInfo.parentModel.name,
      fieldName: parentFieldInfo.fieldName,
      fieldMetadata: parentFieldInfo.fieldMetadata,
      isManual: true,
    };

    return {
      type: "CHANGE_COMPOSITION_TO_REFERENCE",
      uri: context.uri,
      description: `Change composition field '${parentFieldInfo.fieldName}' to reference in model '${parentFieldInfo.parentModel.name}'`,
      payload,
    };
  }

  /**
   * Prepares the workspace edit for the refactor operation.
   * This delegates to the actual implementation tool.
   */
  async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
    const payload = change.payload as ChangeCompositionToReferencePayload;
    
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
        
        const tool = new ChangeCompositionToReferenceTool(explorerProvider);
          await tool.changeCompositionToReference(
          cache,
          payload.sourceModelName,
          payload.fieldName
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to change composition to reference: ${error}`);
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

  /**
   * Finds the parent model that has a composition field pointing to the given component model.
   */
  private findParentCompositionField(cache: MetadataCache, componentModel: DecoratedClass): {
    parentModel: DecoratedClass;
    fieldName: string;
    fieldMetadata: PropertyMetadata;
  } | null {
    const allModels = cache.getDataModelClasses();
    
    for (const model of allModels) {
      for (const [fieldName, fieldMetadata] of Object.entries(model.properties)) {
        // Check if this field has a @Composition decorator and points to the component model
        const hasCompositionDecorator = fieldMetadata.decorators.some(d => d.name === "Composition");
        if (hasCompositionDecorator) {
          // Check if the field type matches the component model name (handle both singular and array types)
          const fieldType = fieldMetadata.type.replace('[]', ''); // Remove array suffix if present
          if (fieldType === componentModel.name) {
            return {
              parentModel: model,
              fieldName: fieldName,
              fieldMetadata: fieldMetadata
            };
          }
        }
      }
    }
    
    return null;
  }
}

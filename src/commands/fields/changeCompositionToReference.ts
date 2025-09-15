import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { FieldInfo, FieldTypeOption } from "../interfaces";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import * as path from "path";

/**
 * Tool for converting composition relationships to reference relationships.
 * 
 * This tool converts a @Composition field to a @Reference field by:
 * 1. Finding the component model that is currently embedded
 * 2. Extracting the component model to its own file
 * 3. Converting the component model from PersistentComponentModel to PersistentModel
 * 4. Converting the field from @Composition to @Reference
 * 5. Adding the necessary imports for the new referenced model
 */
export class ChangeCompositionToReferenceTool {
  private userInputService: UserInputService;
  private projectAnalysisService: ProjectAnalysisService;
  private sourceCodeService: SourceCodeService;
  private fileSystemService: FileSystemService;
  private explorerProvider: ExplorerProvider;
  private deleteFieldTool: DeleteFieldTool;

  constructor(explorerProvider: ExplorerProvider) {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.explorerProvider = explorerProvider;
    this.deleteFieldTool = new DeleteFieldTool();
  }

  /**
   * Converts a composition field to a reference field.
   *
   * @param cache - The metadata cache for context about existing models
   * @param sourceModelName - The name of the model containing the composition field
   * @param fieldName - The name of the composition field to convert
   * @returns Promise that resolves when the conversion is complete
   */
  public async changeCompositionToReference(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<void> {
    try {
      // Step 1: Validate the source model and composition field
      const { sourceModel, document, compositionField, componentModel } = await this.validateCompositionField(
        cache,
        sourceModelName,
        fieldName
      );

      // Step 2: Get confirmation from user
      const shouldProceed = await this.confirmConversion(componentModel.name, sourceModelName);
      if (!shouldProceed) {
        return; // User cancelled
      }

      // Step 3: Determine the target file path for the new independent model
      const targetFilePath = await this.determineTargetFilePath(sourceModel, componentModel.name);

      // Step 4: Generate and create the independent model using existing tools
      const modelFileUri = await this.generateAndCreateIndependentModel(componentModel, sourceModel, targetFilePath, cache);

      // Step 6: Remove the composition field from the source model
      await this.removeCompositionField(document, compositionField, cache);

      // Step 7: Remove the component model from the source file
      await this.removeComponentModel(document, componentModel, sourceModel, cache);

      // Step 8: Add the reference field to the source model
      await this.addReferenceField(document, sourceModel.name, fieldName, componentModel.name, compositionField.type.endsWith('[]'), cache);

      // Step 9: Add import for the new model in the source file
      const importEdit = new vscode.WorkspaceEdit();
      await this.sourceCodeService.addModelImport(document, componentModel.name, importEdit, cache);
      await vscode.workspace.applyEdit(importEdit);

      // Step 10: Focus on the newly modified field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 11: Show success message
      vscode.window.showInformationMessage(
        `Composition converted to reference! The component model '${componentModel.name}' is now an independent model in its own file.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to change composition to reference: ${error}`);
      console.error("Error changing composition to reference:", error);
    }
  }

  /**
   * Validates that the specified field is a valid composition field.
   */
  private async validateCompositionField(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<{
    sourceModel: DecoratedClass;
    document: vscode.TextDocument;
    compositionField: PropertyMetadata;
    componentModel: DecoratedClass;
  }> {
    // Get source model
    const sourceModel = cache.getModelByName(sourceModelName);
    if (!sourceModel) {
      throw new Error(`Source model '${sourceModelName}' not found in the project`);
    }

    // Get field
    const compositionField = sourceModel.properties[fieldName];
    if (!compositionField) {
      throw new Error(`Field '${fieldName}' not found in model '${sourceModelName}'`);
    }

    // Check if field has @Composition decorator
    const hasCompositionDecorator = compositionField.decorators.some(d => d.name === "Composition");
    if (!hasCompositionDecorator) {
      throw new Error(`Field '${fieldName}' is not a composition field`);
    }

    // Extract component model name from the field type
    const componentModelName = compositionField.type.replace('[]', ''); // Remove array suffix if present
    const componentModel = cache.getModelByName(componentModelName);
    if (!componentModel) {
      throw new Error(`Component model '${componentModelName}' not found in the project`);
    }

    // Verify that the component model is actually defined in the same file as the source model
    if (componentModel.declaration.uri.fsPath !== sourceModel.declaration.uri.fsPath) {
      throw new Error(`Component model '${componentModelName}' is not in the same file as the source model. This operation only works with embedded component models.`);
    }

    // Open source document
    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    if (!document) {
      throw new Error(`Could not open document for model '${sourceModelName}'`);
    }

    return { sourceModel, document, compositionField, componentModel };
  }

  /**
   * Asks user for confirmation before proceeding with the conversion.
   */
  private async confirmConversion(componentModelName: string, sourceModelName: string): Promise<boolean> {
    const message = `Convert composition to reference? The component model '${componentModelName}' will be moved to its own file and become an independent model.`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Convert",
      "Cancel"
    );

    return choice === "Convert";
  }

  /**
   * Determines the target file path for the new independent model.
   */
  private async determineTargetFilePath(sourceModel: DecoratedClass, componentModelName: string): Promise<string> {
    const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const fileName = `${componentModelName.toLowerCase()}.ts`;
    return path.join(sourceDir, fileName);
  }

  /**
   * Creates the independent model by copying the component model's class body.
   */
  private async generateAndCreateIndependentModel(
    componentModel: DecoratedClass,
    sourceModel: DecoratedClass,
    targetFilePath: string,
    cache: MetadataCache
  ): Promise<vscode.Uri> {
    // Step 1: Get the source document to extract the class body
    const sourceDocument = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    
    // Step 2: Extract the complete class body from the component model
    const classBody = this.sourceCodeService.extractClassBody(sourceDocument, componentModel.name);
    
    // Step 3: Get datasource from source model
    const sourceModelDecorator = cache.getModelDecoratorByName("Model", sourceModel);
    const dataSource = sourceModelDecorator?.arguments?.[0]?.dataSource;
    
    // Step 4: Extract existing model imports from the source file
    const existingImports = this.sourceCodeService.extractModelImports(sourceDocument);
    
    // Step 5: Convert the class body for independent model use
    const convertedClassBody = this.convertComponentClassBody(classBody);
    
    // Step 6: Generate the complete model file content
    const modelFileContent = this.sourceCodeService.generateModelFileContent(
      componentModel.name,
      convertedClassBody,
      "PersistentModel", // Change from PersistentComponentModel to PersistentModel
      dataSource,
      new Set(["Field"]), // Ensure Field is included
      false // This is a standalone model (with export)
    );
    
    // Step 7: Create the new model file
    const modelFileUri = vscode.Uri.file(targetFilePath);
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(modelFileUri, encoder.encode(modelFileContent));
    
    // Step 8: Add model imports to the new file if needed
    if (existingImports.length > 0) {
      await this.addModelImportsToNewFile(modelFileUri, existingImports);
    }
    
    console.log(`Created independent model file: ${targetFilePath}`);
    return modelFileUri;
  }

  /**
   * Converts a component model class body to work as an independent model.
   * This mainly involves ensuring proper formatting and removing any component-specific elements.
   */
  private convertComponentClassBody(classBody: string): string {
    // For now, we can use the class body as-is since the main difference is in the 
    // class declaration (PersistentComponentModel vs PersistentModel) which is handled
    // in generateModelFileContent. 
    
    // Future enhancements could include:
    // - Removing component-specific decorators if any
    // - Adjusting field configurations if needed
    // - Updating comments that reference "component"
    
    return classBody;
  }

  /**
   * Adds model imports to the newly created model file.
   */
  private async addModelImportsToNewFile(modelFileUri: vscode.Uri, importStatements: string[]): Promise<void> {
    if (importStatements.length === 0) {
      return;
    }
    
    try {
      const document = await vscode.workspace.openTextDocument(modelFileUri);
      const edit = new vscode.WorkspaceEdit();
      
      // Find the position after the slingr-framework import
      const content = document.getText();
      const lines = content.split("\n");
      
      let insertPosition = 1; // Default to after first line
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("from") && lines[i].includes("slingr-framework")) {
          insertPosition = i + 1;
          break;
        }
      }
      
      // Add each import statement
      const importsText = importStatements.join("\n") + "\n";
      edit.insert(modelFileUri, new vscode.Position(insertPosition, 0), importsText);
      
      await vscode.workspace.applyEdit(edit);
    } catch (error) {
      console.warn("Could not add model imports to new file:", error);
    }
  }

  /**
   * Removes the @Composition and @Field decorators from the field.
   */
  private async removeCompositionField(document: vscode.TextDocument, field: PropertyMetadata, cache: MetadataCache): Promise<void> {
    // Find the model name that contains this field
    const fileMetadata = cache.getMetadataForFile(document.uri.fsPath);
    let modelName = 'Unknown';
    
    if (fileMetadata) {
      for (const [className, classData] of Object.entries(fileMetadata.classes)) {
        // Type assertion since we know the structure from cache
        const classInfo = classData as DecoratedClass;
        if (classInfo.properties[field.name] === field) {
          modelName = className;
          break;
        }
      }
    }

    // Use the DeleteFieldTool to programmatically remove the field
    const workspaceEdit = await this.deleteFieldTool.deleteFieldProgrammatically(
      field,
      modelName,
      cache
    );

    // Apply the workspace edit
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  /**
   * Removes the component model from the source file.
   */
  private async removeComponentModel(
    document: vscode.TextDocument,
    componentModel: DecoratedClass,
    sourceModel: DecoratedClass,
    cache: MetadataCache
  ): Promise<void> {
    // Get the text range for the component model
    const modelRange = componentModel.declaration.range;
    
    // Extend the range to include any preceding decorators and following whitespace
    const extendedRange = new vscode.Range(
      new vscode.Position(Math.max(0, modelRange.start.line - 5), 0), // Include decorators
      new vscode.Position(modelRange.end.line + 2, 0) // Include trailing whitespace
    );

    // Create workspace edit to remove the component model
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.delete(document.uri, extendedRange);
    
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  /**
   * Adds the reference field to the source model.
   */
  private async addReferenceField(
    document: vscode.TextDocument,
    sourceModelName: string,
    fieldName: string,
    targetModelName: string,
    isArray: boolean,
    cache: MetadataCache
  ): Promise<void> {
    // Create field info for the reference field
    const fieldType: FieldTypeOption = {
      label: "Relationship",
      decorator: "Reference",
      tsType: isArray ? `${targetModelName}[]` : targetModelName,
      description: "Reference relationship",
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // References are typically optional
      additionalConfig: {
        relationshipType: "reference",
        targetModel: targetModelName,
      },
    };

    // Generate the field code
    const fieldCode = this.generateReferenceFieldCode(fieldInfo, targetModelName, isArray);

    // Insert the field
    await this.sourceCodeService.insertField(document, sourceModelName, fieldInfo, fieldCode, cache, false);
  }

  /**
   * Generates the TypeScript code for the reference field.
   */
  private generateReferenceFieldCode(fieldInfo: FieldInfo, targetModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field({})");

    // Add Reference decorator
    lines.push("@Reference()");

    // Add property declaration
    const typeDeclaration = isArray ? `${targetModelName}[]` : targetModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }
}

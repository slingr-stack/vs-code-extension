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
 * Tool for converting reference relationships to composition relationships.
 * 
 * This tool converts a @Reference field to a @Composition field by:
 * 1. Checking if the referenced model is used elsewhere
 * 2. Optionally deleting the referenced model file if not used elsewhere
 * 3. Creating a new component model in the same file as the owner
 * 4. Converting the field from @Reference to @Composition
 */
export class ChangeReferenceToCompositionTool {
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
   * Converts a reference field to a composition field.
   *
   * @param cache - The metadata cache for context about existing models
   * @param sourceModelName - The name of the model containing the reference field
   * @param fieldName - The name of the reference field to convert
   * @returns Promise that resolves when the conversion is complete
   */
  public async changeReferenceToComposition(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<void> {
    try {
      // Step 1: Validate the source model and reference field
      const { sourceModel, document, referenceField, targetModel } = await this.validateReferenceField(
        cache,
        sourceModelName,
        fieldName
      );

      // Step 2: Check if target model is referenced by other fields
      const isReferencedElsewhere = this.isModelReferencedElsewhere(cache, targetModel.name, sourceModelName, fieldName);

      // Step 3: Inform user about the action and get confirmation
      const shouldProceed = await this.confirmConversion(targetModel.name, isReferencedElsewhere);
      if (!shouldProceed) {
        return; // User cancelled
      }

      // Step 4: Create the component model content based on the target model
      const componentModelCode = await this.generateComponentModelCode(targetModel, sourceModel, cache);

      // Step 5: Remove the reference field decorators
      await this.removeReferenceField(document, referenceField, cache);

      // Step 6: Add the component model to the source file
      await this.addComponentModel(document, componentModelCode, sourceModel.name, cache);

      // Step 6.1: Remove the import for the target model since it's now defined in the same file
      await this.fileSystemService.removeModelImport(document, targetModel.name);

      // Step 7: Add the composition field
      await this.addCompositionField(document, sourceModel.name, fieldName, targetModel.name, false, cache);

      // Step 8: Delete the target model file if not referenced elsewhere
      if (!isReferencedElsewhere) {
        await this.deleteTargetModelFile(targetModel);
      }

      // Refresh the explorer to reflect changes
      //this.explorerProvider.refresh();

      // Step 9: Focus on the newly modified field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 10: Show success message
      const message = isReferencedElsewhere 
        ? `Reference converted to composition! The original ${targetModel.name} model was kept as it's referenced elsewhere.`
        : `Reference converted to composition! The original ${targetModel.name} model was deleted and recreated as a component.`;
      
      vscode.window.showInformationMessage(message);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to change reference to composition: ${error}`);
      console.error("Error changing reference to composition:", error);
    }
  }

  /**
   * Validates that the specified field is a valid reference field.
   */
  private async validateReferenceField(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<{
    sourceModel: DecoratedClass;
    document: vscode.TextDocument;
    referenceField: PropertyMetadata;
    targetModel: DecoratedClass;
  }> {
    // Get source model
    const sourceModel = cache.getModelByName(sourceModelName);
    if (!sourceModel) {
      throw new Error(`Source model '${sourceModelName}' not found in the project`);
    }

    // Get field
    const referenceField = sourceModel.properties[fieldName];
    if (!referenceField) {
      throw new Error(`Field '${fieldName}' not found in model '${sourceModelName}'`);
    }

    // Check if field has @Reference decorator
    const hasReferenceDecorator = referenceField.decorators.some(d => d.name === "Reference");
    if (!hasReferenceDecorator) {
      throw new Error(`Field '${fieldName}' is not a reference field`);
    }

    // Extract target model name from the field type
    const targetModelName = referenceField.type;
    const targetModel = cache.getModelByName(targetModelName);
    if (!targetModel) {
      throw new Error(`Target model '${targetModelName}' not found in the project`);
    }

    // Open source document
    const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    if (!document) {
      throw new Error(`Could not open document for model '${sourceModelName}'`);
    }

    return { sourceModel, document, referenceField, targetModel };
  }

  /**
   * Checks if a model is referenced by other fields in other models.
   */
  private isModelReferencedElsewhere(
    cache: MetadataCache,
    targetModelName: string,
    excludeSourceModelName: string,
    excludeFieldName: string
  ): boolean {
    const allModels = cache.getDataModelClasses();

    for (const model of allModels) {
      // Skip the source model when checking the specific field
      if (model.name === excludeSourceModelName) {
        // Check other fields in the same model
        for (const [fieldName, field] of Object.entries(model.properties)) {
          if (fieldName === excludeFieldName) {
            continue; // Skip the field we're converting
          }
          
          if (this.isFieldReferencingModel(field, targetModelName)) {
            return true;
          }
        }
      } else {
        // Check all fields in other models
        for (const field of Object.values(model.properties)) {
          if (this.isFieldReferencingModel(field, targetModelName)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Checks if a field references a specific model.
   */
  private isFieldReferencingModel(field: PropertyMetadata, targetModelName: string): boolean {
    // Check if field has relationship decorators and the type matches
    const hasRelationshipDecorator = field.decorators.some(d => 
      d.name === "Reference" || d.name === "Composition" || d.name === "Relationship"
    );
    
    if (hasRelationshipDecorator && field.type === targetModelName) {
      return true;
    }

    // Also check for array types like "TargetModel[]"
    if (hasRelationshipDecorator && field.type === `${targetModelName}[]`) {
      return true;
    }

    return false;
  }

  /**
   * Asks user for confirmation before proceeding with the conversion.
   */
  private async confirmConversion(targetModelName: string, isReferencedElsewhere: boolean): Promise<boolean> {
    const message = isReferencedElsewhere
      ? `Convert reference to composition? The referenced model '${targetModelName}' is used elsewhere, so it will be kept and a new component model will be created.`
      : `Convert reference to composition? The referenced model '${targetModelName}' is not used elsewhere, so it will be deleted and recreated as a component model.`;

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      "Convert",
      "Cancel"
    );

    return choice === "Convert";
  }

  /**
   * Generates the TypeScript code for the new component model by copying the target model's class body.
   */
  private async generateComponentModelCode(
    targetModel: DecoratedClass,
    sourceModel: DecoratedClass,
    cache: MetadataCache
  ): Promise<string> {
    // Step 1: Get the target model document to extract the class body
    const targetDocument = await vscode.workspace.openTextDocument(targetModel.declaration.uri);
    
    // Step 2: Extract the complete class body from the target model
    const classBody = this.sourceCodeService.extractClassBody(targetDocument, targetModel.name);
    
    // Step 3: Get datasource from source model
    const sourceModelDecorator = cache.getModelDecoratorByName("Model", sourceModel);
    const dataSource = sourceModelDecorator?.arguments?.[0]?.dataSource;
    
    // Step 4: Extract any enums from the target model file
    const enumDefinitions = this.sourceCodeService.extractEnumDefinitions(targetDocument);
    
    // Step 5: Check for enum name conflicts and resolve them
    const sourceDocument = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    const resolvedEnums = await this.resolveEnumConflicts(enumDefinitions, sourceDocument, classBody, sourceModel.name);
    
    // Step 6: Generate the complete component model content
    let componentModelCode = this.sourceCodeService.generateModelFileContent(
      targetModel.name,
      resolvedEnums.updatedClassBody,
      `PersistentComponentModel<${sourceModel.name}>`, // Use component model base class
      dataSource,
      new Set(["Field", "PersistentComponentModel"]), // Ensure required imports
      true // This is a component model (no export keyword)
    );
    
    // Step 7: Extract only the component model part (remove imports and add enums)
    const componentModelParts = this.extractComponentModelFromFileContent(componentModelCode);
    
    // Step 8: Add enum definitions if any exist
    if (resolvedEnums.enumDefinitions.length > 0) {
      const enumsContent = resolvedEnums.enumDefinitions.join('\n\n');
      return `${enumsContent}\n\n${componentModelParts}`;
    }
    
    return componentModelParts;
  }


  /**
   * Resolves enum name conflicts between target and source files.
   */
  private async resolveEnumConflicts(
    enumDefinitions: string[],
    sourceDocument: vscode.TextDocument,
    classBody: string,
    sourceModelName: string
  ): Promise<{ enumDefinitions: string[]; updatedClassBody: string }> {
    if (enumDefinitions.length === 0) {
      return { enumDefinitions: [], updatedClassBody: classBody };
    }
    
    const sourceContent = sourceDocument.getText();
    const existingEnums = this.extractEnumNames(sourceContent);
    const resolvedEnums: string[] = [];
    let updatedClassBody = classBody;
    
    for (const enumDef of enumDefinitions) {
      const enumName = this.extractEnumName(enumDef);
      
      if (enumName && existingEnums.includes(enumName)) {
        // Conflict detected, rename the enum
        const newEnumName = `${sourceModelName}${enumName}`;
        existingEnums.push(newEnumName); // Add to list to avoid future conflicts
        
        // Update enum definition
        const updatedEnumDef = enumDef.replace(
          new RegExp(`enum\\s+${enumName}\\b`),
          `enum ${newEnumName}`
        );
        
        // Update class body to use new enum name
        updatedClassBody = updatedClassBody.replace(
          new RegExp(`\\b${enumName}\\b`, 'g'),
          newEnumName
        );
        
        resolvedEnums.push(updatedEnumDef);
      } else {
        resolvedEnums.push(enumDef);
        if (enumName) {
          existingEnums.push(enumName);
        }
      }
    }
    
    return { enumDefinitions: resolvedEnums, updatedClassBody };
  }

  /**
   * Extracts enum names from file content.
   */
  private extractEnumNames(content: string): string[] {
    const enumRegex = /(?:export\s+)?enum\s+(\w+)/g;
    const enumNames: string[] = [];
    let match;
    
    while ((match = enumRegex.exec(content)) !== null) {
      enumNames.push(match[1]);
    }
    
    return enumNames;
  }

  /**
   * Extracts enum name from an enum definition.
   */
  private extractEnumName(enumDefinition: string): string | null {
    const match = enumDefinition.match(/(?:export\s+)?enum\s+(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Extracts only the component model part from full file content (removes imports).
   */
  private extractComponentModelFromFileContent(fileContent: string): string {
    const lines = fileContent.split('\n');
    const result: string[] = [];
    let foundModel = false;
    
    for (const line of lines) {
      // Skip import lines
      if (line.trim().startsWith('import ')) {
        continue;
      }
      
      // Skip empty lines before the model
      if (!foundModel && line.trim() === '') {
        continue;
      }
      
      // Once we find the model decorator or class, include everything
      if (line.trim().startsWith('@Model') || line.includes('class ')) {
        foundModel = true;
      }
      
      if (foundModel) {
        result.push(line);
      }
    }
    
    return result.join('\n');
  }

  /**
   * Removes the @Reference and @Field decorators from the field.
   */
  private async removeReferenceField(document: vscode.TextDocument, field: PropertyMetadata, cache: MetadataCache): Promise<void> {
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
   * Adds the component model to the source file.
   */
  private async addComponentModel(
    document: vscode.TextDocument,
    componentModelCode: string,
    sourceModelName: string,
    cache: MetadataCache
  ): Promise<void> {
    const newImports = new Set(["Model", "PersistentComponentModel"]);
    
    await this.sourceCodeService.insertModel(
      document,
      componentModelCode,
      sourceModelName, // Insert after the source model
      newImports
    );
  }

  /**
   * Adds the composition field to the source model.
   */
  private async addCompositionField(
    document: vscode.TextDocument,
    sourceModelName: string,
    fieldName: string,
    targetModelName: string,
    isArray: boolean,
    cache: MetadataCache
  ): Promise<void> {
    // Create field info for the composition field
    const fieldType: FieldTypeOption = {
      label: "Relationship",
      decorator: "Composition",
      tsType: isArray ? `${targetModelName}[]` : targetModelName,
      description: "Composition relationship",
    };

    const fieldInfo: FieldInfo = {
      name: fieldName,
      type: fieldType,
      required: false, // Compositions are typically optional
      additionalConfig: {
        relationshipType: "composition",
        targetModel: targetModelName,
        targetModelPath: document.uri.fsPath,
      },
    };

    // Generate the field code
    const fieldCode = this.generateCompositionFieldCode(fieldInfo, targetModelName, isArray);

    // Insert the field
    await this.sourceCodeService.insertField(document, sourceModelName, fieldInfo, fieldCode, cache, false);
  }

  /**
   * Generates the TypeScript code for the composition field.
   */
  private generateCompositionFieldCode(fieldInfo: FieldInfo, targetModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field({})");

    // Add Composition decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeDeclaration = isArray ? `${targetModelName}[]` : targetModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }

  /**
   * Deletes the target model file if it's safe to do so.
   */
  private async deleteTargetModelFile(targetModel: DecoratedClass): Promise<void> {
    try {
      await vscode.workspace.fs.delete(targetModel.declaration.uri);
      console.log(`Deleted target model file: ${targetModel.declaration.uri.fsPath}`);
    } catch (error) {
      console.warn(`Could not delete target model file: ${error}`);
      // Don't throw error here as the conversion was successful
    }
  }
}
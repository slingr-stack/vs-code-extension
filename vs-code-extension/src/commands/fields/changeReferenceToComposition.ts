import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { FieldInfo, FieldTypeOption } from "../interfaces";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { ExplorerProvider } from "../../explorer/explorerProvider";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { detectIndentation, applyIndentation } from "../../utils/detectIndentation";
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
  private deleteFieldTool: DeleteFieldTool;

  constructor() {
    this.userInputService = new UserInputService();
    this.projectAnalysisService = new ProjectAnalysisService();
    this.sourceCodeService = new SourceCodeService();
    this.fileSystemService = new FileSystemService();
    this.deleteFieldTool = new DeleteFieldTool();
  }

  /**
   * Converts a reference field to a composition field.
   *
   * @param cache - The metadata cache for context about existing models
   * @param sourceModelName - The name of the model containing the reference field
   * @param fieldName - The name of the reference field to convert
   * @returns Promise that resolves to a WorkspaceEdit containing all changes needed for the conversion
   */
  public async changeReferenceToComposition(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<vscode.WorkspaceEdit> {

    const edit = new vscode.WorkspaceEdit();
    try {
      // Step 1: Validate the source model and reference field
      const { sourceModel, document, referenceField, targetModel } = await this.validateReferenceField(
        cache,
        sourceModelName,
        fieldName
      );

      // Step 2: Check if target model is referenced by other fields
      const isReferencedElsewhere = this.isModelReferencedElsewhere(cache, targetModel.name, sourceModelName, fieldName);


      // Step 4: Create the component model content based on the target model
      const componentModelCode = await this.generateComponentModelCode(targetModel, sourceModel, cache);

      // Step 5: Remove the reference field decorators
      await this.removeReferenceField(document, referenceField, cache, edit);

      // Step 6: Add the component model to the source file
      await this.addComponentModel(document, componentModelCode, sourceModel.name, cache, edit);

      // Step 6.1: Remove the import for the target model since it's now defined in the same file
      await this.removeModelImport(document, targetModel.name, edit);

      // Step 7: Add the composition field
      await this.addCompositionField(document, sourceModel.name, fieldName, targetModel.name, false, cache, edit);

      // Step 8: Delete the target model file if not referenced elsewhere
      if (!isReferencedElsewhere) {
        await this.deleteTargetModelFile(targetModel, edit);
      }

     // Add necessary imports to the workspace edit
      await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, new Set(["Model", "BaseModel", "Field", "Composition"]));

      // Step 9: Focus on the newly modified field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 10: Show success message
      const message = isReferencedElsewhere 
        ? `Reference converted to composition! The origin
  private async addEnumDeletionToWorkspacal ${targetModel.name} model was kept as it's referenced elsewhere.`
        : `Reference converted to composition! The original ${targetModel.name} model was deleted and recreated as a component.`;
      
      vscode.window.showInformationMessage(message);

      // Return the consolidated workspace edit containing all changes
      return edit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to change reference to composition: ${error}`);
      console.error("Error changing reference to composition:", error);
      return edit; // Return the edit even if there was an error
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
    let componentModelCode = await this.sourceCodeService.generateModelFileContent(
      targetModel.name,
      resolvedEnums.updatedClassBody,
      `BaseModel`, // Use component model base class
      dataSource,
      new Set(["Field", "BaseModel"]), // Ensure required imports
      true,  // This is a component model (no export keyword)
      targetModel.declaration.uri.fsPath,
      cache
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
  private async removeReferenceField(
    document: vscode.TextDocument, 
    field: PropertyMetadata, 
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
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
    await this.deleteFieldTool.deleteFieldProgrammatically(
      field,
      modelName,
      cache,
      workspaceEdit
    );
  }

  /**
   * Adds the component model to the source file.
   */
  private async addComponentModel(
    document: vscode.TextDocument,
    componentModelCode: string,
    sourceModelName: string,
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    
    // Manually implement model insertion to use our workspace edit
    const lines = document.getText().split("\n");
    
    // Find the position to insert the model (after the source model)
    let insertPosition = lines.length; // Default to end of file
    if (sourceModelName) {
      try {
        const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModelName);
        insertPosition = classEndLine + 1;
      } catch (error) {
        console.warn(`Could not find source model "${sourceModelName}", inserting at end of file`);
      }
    }
    
    // Insert the component model with proper spacing
    const modelWithSpacing = `\n${componentModelCode}\n`;
    workspaceEdit.insert(document.uri, new vscode.Position(insertPosition, 0), modelWithSpacing, {label: 'Add component model', needsConfirmation: true});
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
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
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

    // Create the field insertion edits manually and merge into main workspace edit
    const lines = document.getText().split("\n");
    const { classStartLine, classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModelName);
    
    // Apply proper indentation
    const indentation = detectIndentation(lines, classStartLine, classEndLine);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    // Insert the field
    workspaceEdit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`, {label: `Add composition field ${fieldName}`, needsConfirmation: true});

    // Add necessary imports to the workspace edit
    const newImports = new Set<string>(["Composition"]);
    //await this.sourceCodeService.ensureSlingrFrameworkImports(document, workspaceEdit, newImports);
  }

  /**
   * Generates the TypeScript code for the composition field.
   */
  private generateCompositionFieldCode(fieldInfo: FieldInfo, targetModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field()");

    // Add Composition decorator
    lines.push("@Composition()");

    // Add property declaration
    const typeDeclaration = isArray ? `${targetModelName}[]` : targetModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }


  /**
   * Removes model import from the document.
   */
  private async removeModelImport(
    document: vscode.TextDocument, 
    modelName: string, 
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    const content = document.getText();
    const lines = content.split("\n");

    // Find and remove import lines that contain the model name
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for import statements that import the specific model
      if (line.trim().startsWith('import ') && line.includes(modelName)) {
        // Check if this import only imports the target model
        const importMatch = line.match(/import\s+{([^}]+)}\s+from/);
        if (importMatch) {
          const imports = importMatch[1].split(',').map(imp => imp.trim());
          
          if (imports.length === 1 && imports[0] === modelName) {
            // Remove the entire import line
            const range = new vscode.Range(
              new vscode.Position(i, 0),
              new vscode.Position(i + 1, 0)
            );
            workspaceEdit.delete(document.uri, range, {label: `Remove import for ${modelName}`, needsConfirmation: true});
          } else if (imports.includes(modelName)) {
            // Remove just the model name from the import
            const newImports = imports.filter(imp => imp !== modelName);
            const newImportLine = line.replace(
              /import\s+{[^}]+}/,
              `import { ${newImports.join(', ')} }`
            );
            const range = new vscode.Range(
              new vscode.Position(i, 0),
              new vscode.Position(i, line.length)
            );
            workspaceEdit.replace(document.uri, range, newImportLine, {label: `Update import removing ${modelName}`, needsConfirmation: true});
          }
        }
      }
    }
  }

  /**
   * Deletes the target model file if it's safe to do so.
   */
  private async deleteTargetModelFile(targetModel: DecoratedClass, workspaceEdit: vscode.WorkspaceEdit): Promise<void> {
    try {
      workspaceEdit.deleteFile(targetModel.declaration.uri, { ignoreIfNotExists: true }, {label: `Delete original model file ${targetModel.name}`, needsConfirmation: true});
      console.log(`Scheduled deletion of target model file: ${targetModel.declaration.uri.fsPath}`);
    } catch (error) {
      console.warn(`Could not schedule deletion of target model file: ${error}`);
      // Don't throw error here as the conversion was successful
    }
  }
}
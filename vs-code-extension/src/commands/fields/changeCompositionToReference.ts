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
 * Tool for converting composition relationships to reference relationships.
 * 
 * This tool converts a @Composition field to a @Reference
 */
export class ChangeCompositionToReferenceTool {
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
   * Converts a composition field to a reference field.
   *
   * @param cache - The metadata cache for context about existing models
   * @param sourceModelName - The name of the model containing the composition field
   * @param fieldName - The name of the composition field to convert
   * @returns Promise that resolves to a WorkspaceEdit containing all changes needed for the conversion
   */
  public async changeCompositionToReference(
    cache: MetadataCache,
    sourceModelName: string,
    fieldName: string
  ): Promise<vscode.WorkspaceEdit> {

    const edit = new vscode.WorkspaceEdit();
    
    try {
      // Step 1: Validate the source model and composition field
      const { sourceModel, document, compositionField, componentModel } = await this.validateCompositionField(
        cache,
        sourceModelName,
        fieldName
      );

      // Step 3: Determine the target file path for the new independent model
      const targetFilePath = await this.determineTargetFilePath(sourceModel, componentModel.name);

      // Step 4: Generate and create the independent model using existing tools
      await this.generateAndCreateIndependentModel(componentModel, sourceModel, targetFilePath, cache, edit);
      
      // Step 5: Extract related enums before removing the component model
      const relatedEnums = await this.sourceCodeService.extractRelatedEnums(document, componentModel, 
        this.sourceCodeService.extractClassBody(document, componentModel.name));

      // Step 6-8: Remove field, model, and enums in a single workspace edit to avoid coordinate issues
      await this.removeFieldModelAndEnums(document, compositionField, componentModel, relatedEnums, cache, edit);

      // Step 9: Add the reference field to the source model
      await this.addReferenceField(document, sourceModel.name, fieldName, componentModel.name, compositionField.type.endsWith('[]'), cache, edit);

      // Step 10: Add import for the new model in the source file
      await this.sourceCodeService.addModelImport(document, componentModel.name, edit, cache);

      // Step 11: Focus on the newly modified field
      await this.sourceCodeService.focusOnElement(document, fieldName);

      // Step 12: Show success message
      vscode.window.showInformationMessage(
        `Composition converted to reference! The component model '${componentModel.name}' is now an independent model in its own file.`
      );

      // Return the consolidated workspace edit containing all changes
      return edit;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to change composition to reference: ${error}`);
      console.error("Error changing composition to reference:", error);
      return edit; // Return the edit even if there was an error
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
   * Determines the target file path for the new independent model.
   */
  private async determineTargetFilePath(sourceModel: DecoratedClass, componentModelName: string): Promise<string> {
    const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
    const fileName = `${componentModelName}.ts`;
    return path.join(sourceDir, fileName);
  }

  /**
   * Creates the independent model by copying the component model's class body.
   */
  private async generateAndCreateIndependentModel(
    componentModel: DecoratedClass,
    sourceModel: DecoratedClass,
    targetFilePath: string,
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    
    // Step 1: Get the source document to extract the class body
    const sourceDocument = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);
    
    // Step 2: Extract the complete class body from the component model
    const classBody = this.sourceCodeService.extractClassBody(sourceDocument, componentModel.name);
    
    // Step 3: Extract related enums from the source file (for Choice fields)
    const relatedEnums = await this.sourceCodeService.extractRelatedEnums(sourceDocument, componentModel, classBody);
    
    // Step 4: Get datasource from source model
    const sourceModelDecorator = cache.getModelDecoratorByName("Model", sourceModel);
    const dataSource = sourceModelDecorator?.arguments?.[0]?.dataSource;
    
    // Step 5: Convert the class body for independent model use
    const convertedClassBody = this.convertComponentClassBody(classBody);
    
    // Step 6: Generate the complete model file content
    const modelFileContent = await this.sourceCodeService.generateModelFileContent(
      componentModel.name,
      convertedClassBody,
      "BaseModel",
      dataSource,
      undefined,
      false,
      targetFilePath,
      cache
    );
    
    // Step 8: Add related enums to the file content
    const finalFileContent = this.sourceCodeService.addEnumsToFileContent(modelFileContent, relatedEnums);
    
    // Step 9: Create the workspace edit to create the new model file
    const modelFileUri = vscode.Uri.file(targetFilePath);
    workspaceEdit.createFile(modelFileUri, { ignoreIfExists: true }, {label: 'Create independent model file', needsConfirmation: true});
    workspaceEdit.insert(modelFileUri, new vscode.Position(0, 0), finalFileContent, {label: 'Insert model content', needsConfirmation: true});
    
    console.log(`Prepared workspace edit to create independent model file: ${targetFilePath}`);
  }

  /**
   * Converts a component model class body to work as an independent model.
   * This mainly involves ensuring proper formatting and removing any component-specific elements.
   */
  private convertComponentClassBody(classBody: string): string {
 
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
   * Removes the composition field, component model, and unused enums in a single workspace edit
   * to avoid coordinate invalidation issues.
   */
  private async removeFieldModelAndEnums(
    document: vscode.TextDocument,
    compositionField: PropertyMetadata,
    componentModel: DecoratedClass,
    relatedEnums: string[],
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {

    // Step 1: Get field deletion range (using DeleteFieldTool logic)
    const fileMetadata = cache.getMetadataForFile(document.uri.fsPath);
    let modelName = 'Unknown';
    
    if (fileMetadata) {
      for (const [className, classData] of Object.entries(fileMetadata.classes)) {
        const classInfo = classData as DecoratedClass;
        if (classInfo.properties[compositionField.name] === compositionField) {
          modelName = className;
          break;
        }
      }
    }

    // Get field deletion edit without applying it
    const fieldDeletionEdit = await this.deleteFieldTool.deleteFieldProgrammatically(
      compositionField,
      modelName,
      cache
    );

    // Step 2: Get model deletion range
    await this.sourceCodeService.deleteModelClassFromFile(document.uri, componentModel, workspaceEdit);

    // Step 3: Get enum deletion ranges
    await this.addEnumDeletionsToWorkspaceEdit(document, relatedEnums, workspaceEdit, componentModel);

    // Step 4: Merge field deletion edits into the main workspace edit
    this.mergeWorkspaceEdits(fieldDeletionEdit, workspaceEdit);

    console.log("Prepared workspace edit to remove field, model, and unused enums");
  }

  /**
   * Adds enum deletion ranges to the workspace edit if the enums are no longer used.
   */
  private async addEnumDeletionsToWorkspaceEdit(
    document: vscode.TextDocument,
    extractedEnums: string[],
    workspaceEdit: vscode.WorkspaceEdit,
    componentModel: DecoratedClass
  ): Promise<void> {
    if (extractedEnums.length === 0) {
      return;
    }
    
    const sourceContent = document.getText();
    
    // Extract enum names from the enum definitions
    const enumNames = extractedEnums.map(enumDef => {
      const match = enumDef.match(/enum\s+(\w+)/);
      return match ? match[1] : null;
    }).filter(name => name !== null) as string[];
    
    console.log(`Found ${enumNames.length} enums to check for deletion: ${enumNames.join(', ')}`);
    
    // Check each enum to see if it's still used in the source file
    for (const enumName of enumNames) {
      if (!this.isEnumStillUsedInFile(sourceContent, enumName, extractedEnums, componentModel)) {
        console.log(`Enum "${enumName}" is not used anymore, scheduling for deletion`);
        await this.addEnumDeletionToWorkspaceEdit(document, enumName, workspaceEdit);
      } else {
        console.log(`Enum "${enumName}" is still used, keeping it in source file`);
      }
    }
  }

  /**
   * Checks if an enum is still referenced in the source file (excluding the extracted enums and component model).
   */
  private isEnumStillUsedInFile(sourceContent: string, enumName: string, extractedEnums: string[], componentModel: DecoratedClass): boolean {
    // Create a version of the source content without the extracted enums
    let contentWithoutExtractedEnums = sourceContent;
    for (const enumDef of extractedEnums) {
      contentWithoutExtractedEnums = contentWithoutExtractedEnums.replace(enumDef, '');
    }
    
    // Also remove the component model class from the content since we're extracting it
    // This prevents false positives where the enum is only used in the component model
    try {
      const lines = contentWithoutExtractedEnums.split('\n');
      const { classStartLine, classEndLine } = this.sourceCodeService.findClassBoundaries(lines, componentModel.name);
      
      // Remove the component model class from the content
      const linesWithoutComponentModel = [
        ...lines.slice(0, classStartLine),
        ...lines.slice(classEndLine + 1)
      ];
      contentWithoutExtractedEnums = linesWithoutComponentModel.join('\n');
    } catch (error) {
      console.warn(`Could not remove component model "${componentModel.name}" from content for enum usage check:`, error);
    }
    
    // Look for references to the enum name in the remaining content
    const enumRefRegex = new RegExp(`\\b${enumName}\\b`, 'g');
    const matches = contentWithoutExtractedEnums.match(enumRefRegex);
    
    console.log(`Checking if enum "${enumName}" is still used: found ${matches ? matches.length : 0} references`);
    
    // If there are matches, the enum is still used
    return matches !== null && matches.length > 0;
  }

  /**
   * Adds an enum deletion range to the workspace edit.
   */
  private async addEnumDeletionToWorkspaceEdit(
    document: vscode.TextDocument, 
    enumName: string, 
    workspaceEdit: vscode.WorkspaceEdit
  ): Promise<void> {
    const sourceContent = document.getText();
    const lines = sourceContent.split('\n');
    
    // Find the enum definition with better pattern matching
    let enumStartLine = -1;
    let enumEndLine = -1;
    
    // Look for the enum declaration line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match: "enum EnumName {" or "export enum EnumName {"
      const enumMatch = line.match(new RegExp(`^(export\\s+)?enum\\s+${enumName}\\s*\\{`));
      if (enumMatch) {
        enumStartLine = i;
        
        // Look for any preceding comments or empty lines that belong to this enum
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim();
          if (prevLine === '' || prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.endsWith('*/')) {
            enumStartLine = j;
          } else {
            break;
          }
        }
        
        // Find the closing brace
        let braceCount = 0;
        let foundOpenBrace = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          
          for (const char of currentLine) {
            if (char === '{') {
              braceCount++;
              foundOpenBrace = true;
            } else if (char === '}') {
              braceCount--;
              if (foundOpenBrace && braceCount === 0) {
                enumEndLine = j;
                break;
              }
            }
          }
          
          if (foundOpenBrace && braceCount === 0) {
            break;
          }
        }
        
        break; // Found the enum, stop searching
      }
    }
    
    if (enumStartLine !== -1 && enumEndLine !== -1) {
      // Include any trailing empty lines that belong to this enum
      /* while (enumEndLine + 1 < lines.length && lines[enumEndLine + 1].trim() === '') {
        enumEndLine++;
      } */
      
      // Create the range to delete (include the newline of the last line)
      const rangeToDelete = new vscode.Range(
        new vscode.Position(enumStartLine, 0),
        new vscode.Position(enumEndLine + 1, 0)
      );
      
      workspaceEdit.delete(document.uri, rangeToDelete, {label: `Delete unused enum ${enumName}`, needsConfirmation: true});
      console.log(`Scheduled deletion of enum "${enumName}" from lines ${enumStartLine} to ${enumEndLine}`);
    } else {
      console.warn(`Could not find enum "${enumName}" for deletion`);
    }
  }

  /**
   * Merges edits from one workspace edit into another.
   */
  private mergeWorkspaceEdits(sourceEdit: vscode.WorkspaceEdit, targetEdit: vscode.WorkspaceEdit): void {
    sourceEdit.entries().forEach(([uri, edits]) => {
      edits.forEach(edit => {
        if (edit instanceof vscode.TextEdit) {
          targetEdit.replace(uri, edit.range, edit.newText, {label: 'Merge field deletion edits', needsConfirmation: true});
        }
      });
    });
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
    cache: MetadataCache,
    workspaceEdit: vscode.WorkspaceEdit
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

    // Create the field insertion edits manually and merge into main workspace edit
    const lines = document.getText().split("\n");
    const { classStartLine, classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModelName);
    
    // Apply proper indentation
    const indentation = detectIndentation(lines, classStartLine, classEndLine);
    const indentedFieldCode = applyIndentation(fieldCode, indentation);

    // Insert the field
    workspaceEdit.insert(document.uri, new vscode.Position(classEndLine, 0), `\n${indentedFieldCode}\n`, {label: `Add reference field ${fieldName}`, needsConfirmation: true});

    // Add necessary imports to the workspace edit
    const newImports = new Set<string>(["Field", "Reference"]);
    await this.sourceCodeService.ensureSlingrFrameworkImports(document, workspaceEdit, newImports);
  }

  /**
   * Generates the TypeScript code for the reference field.
   */
  private generateReferenceFieldCode(fieldInfo: FieldInfo, targetModelName: string, isArray: boolean): string {
    const lines: string[] = [];

    // Add Field decorator
    lines.push("@Field()");

    // Add Reference decorator
    lines.push("@Reference()");

    // Add property declaration
    const typeDeclaration = isArray ? `${targetModelName}[]` : targetModelName;
    lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

    return lines.join("\n");
  }
}

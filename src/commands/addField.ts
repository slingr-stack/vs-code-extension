import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../cache/cache";
import { DefineFieldsTool } from "./defineFields";
import { AIEnhancedTool, FIELD_TYPE_OPTIONS, FieldTypeOption, FieldInfo } from "./interfaces";
import { detectIndentation, applyIndentation } from "../utils/detectIndentation";

/**
 * Tool for adding new fields to existing Model classes.
 * 
 * This tool provides both manual field creation and AI-enhanced field generation.
 * It analyzes the target model, gathers user input, creates the basic field structure,
 * and optionally enhances it with AI assistance based on user descriptions.
 * 
 * @example
 * ```typescript
 * // Manual field addition:
 * @Field()
 * @Text()
 * title: string;
 * 
 * // AI-enhanced with description "user's full name with validation":
 * @Field({
 *     required: true
 * })
 * @Text({
 *     maxLength: 100
 * })
 * fullName: string;
 * ```
 */
export class AddFieldTool implements AIEnhancedTool {
    
    private defineFieldsTool: DefineFieldsTool;
    
    constructor() {
        this.defineFieldsTool = new DefineFieldsTool();
    }
    
    /**
     * Processes user input with AI enhancement for field addition.
     * This method is used when AI assistance is requested for adding a field.
     * @param userInput - Description of the field to create
     * @param targetUri - Target model file for the new field
     * @param cache - Metadata cache instance
     * @param additionalContext - Additional context for field creation
     */
    async processWithAI(
        userInput: string,
        targetUri: vscode.Uri,
        cache: MetadataCache,
        additionalContext?: any
    ): Promise<void> {
        // The current addField method handles user interaction internally,
        // so we just call it with the provided parameters
        await this.addField(targetUri, cache);
    }
    
    /**
     * Adds a new field to an existing model file.
     * 
     * @param targetUri - The URI of the model file where the field should be added
     * @param cache - The metadata cache for context about existing models (optional)
     * @returns Promise that resolves when the field is added
     */
    public async addField(targetUri: vscode.Uri, cache?: MetadataCache): Promise<void> {
        try {
            // Step 1: Validate target file
            const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, cache);
            
            // Step 2: Get field information from user
            const fieldInfo = await this.gatherFieldInformation(modelClass, cache);
            if (!fieldInfo) {
                return; // User cancelled
            }
            
            // Step 3: Get optional AI description
            const aiDescription = await this.getAIDescription();
            
            // Step 4: Generate basic field structure
            const fieldCode = this.generateFieldCode(fieldInfo);
            
        // Step 5: Insert field into model class
        await this.insertFieldIntoModel(document, modelClass.name, fieldCode, fieldInfo, cache);
        
        // Step 5.5: If it's a Choice field, also create the enum
        if (fieldInfo.type.decorator === 'Choice') {
            await this.insertEnumForChoiceField(document, fieldInfo);
        }            // Step 6: Apply AI enhancement if description was provided
            if (aiDescription?.trim() && cache) {
                try {
                    // Give the cache a moment to process the new field
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Create a specific prompt for the newly added field
                    const enhancementPrompt = this.createFieldEnhancementPrompt(
                        fieldInfo,
                        aiDescription.trim(),
                        modelClass.name
                    );
                    
                    await this.defineFieldsTool.processFieldDescriptions(
                        enhancementPrompt,
                        targetUri,
                        cache,
                        modelClass.name
                    );
                } catch (aiError) {
                    console.warn('Failed to apply AI enhancement:', aiError);
                    vscode.window.showWarningMessage(
                        `Field added successfully, but AI enhancement failed: ${aiError}. You can manually enhance the field later.`
                    );
                }
            }
            
            // Step 7: Show success message
            const successMessage = aiDescription?.trim() && cache 
                ? `Field ${fieldInfo.name} added and enhanced successfully!`
                : `Field ${fieldInfo.name} added successfully!`;
            vscode.window.showInformationMessage(successMessage);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add field: ${error}`);
            console.error('Error adding field:', error);
        }
    }
    
    /**
     * Validates the target file and prepares it for field addition.
     */
    private async validateAndPrepareTarget(
        targetUri: vscode.Uri, 
        cache?: MetadataCache
    ): Promise<{ modelClass: DecoratedClass, document: vscode.TextDocument }> {
        // Ensure the file is a TypeScript file
        if (!targetUri.fsPath.endsWith('.ts')) {
            throw new Error('Target file must be a TypeScript file (.ts)');
        }
        
        // Open the document
        const document = await vscode.workspace.openTextDocument(targetUri);
        
        // Get model information from cache
        if (!cache) {
            throw new Error('Metadata cache is required for field addition');
        }
        
        const fileMetadata = cache.getMetadataForFile(targetUri.fsPath);
        if (!fileMetadata) {
            throw new Error('No metadata found for this file. Make sure it contains a valid model class.');
        }
        
        // Find the model class (class with @Model decorator)
        const modelClasses = Object.values(fileMetadata.classes).filter(
            (cls: DecoratedClass) => cls.decorators.some(d => d.name === 'Model')
        );
        
        if (modelClasses.length === 0) {
            throw new Error('No model class found in this file. Make sure the class has a @Model decorator.');
        }
        
        if (modelClasses.length > 1) {
            // If multiple model classes, ask user to choose
            const choices = modelClasses.map((cls: DecoratedClass) => cls.name);
            const selectedModel = await vscode.window.showQuickPick(choices, {
                placeHolder: "Multiple model classes found. Select the target model:"
            });
            
            if (!selectedModel) {
                throw new Error('No model selected');
            }
            
            const modelClass = modelClasses.find((cls: DecoratedClass) => cls.name === selectedModel);
            if (!modelClass) {
                throw new Error('Selected model not found');
            }
            
            return { modelClass, document };
        }
        
        return { modelClass: modelClasses[0], document };
    }
    
    /**
     * Gathers field information from the user through interactive prompts.
     */
    private async gatherFieldInformation(modelClass: DecoratedClass, cache?: MetadataCache): Promise<FieldInfo | null> {
        // Step 1: Get field name
        const fieldName = await vscode.window.showInputBox({
            prompt: "Enter the field name (camelCase)",
            placeHolder: "e.g., userName, projectTitle, isActive",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "Field name is required";
                }
                if (!/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
                    return "Field name must be in camelCase (e.g., userName, projectTitle)";
                }
                
                // Check if field already exists in the model
                const existingFields = Object.keys(modelClass.properties || {});
                if (existingFields.includes(value.trim())) {
                    return `Field '${value.trim()}' already exists in this model`;
                }
                
                return null;
            }
        });
        
        if (!fieldName) {
            return null; // User cancelled
        }
        
        // Step 2: Get field type
        const fieldType = await this.selectFieldType();
        if (!fieldType) {
            return null; // User cancelled
        }
        
        // Step 3: Get required status
        const isRequired = await this.getRequiredStatus();
        if (isRequired === undefined) {
            return null; // User cancelled
        }
        
        // Step 4: Handle special field types
        let additionalConfig: Record<string, any> = {};
        
        if (fieldType.decorator === 'Relationship') {
            const relationshipConfig = await this.getRelationshipConfiguration(cache);
            if (!relationshipConfig) {
                return null; // User cancelled
            }
            additionalConfig = relationshipConfig;
        }
        
        return {
            name: fieldName.trim(),
            type: fieldType,
            required: isRequired,
            additionalConfig: additionalConfig
        };
    }
    
    /**
     * Shows a quick pick for field type selection.
     */
    private async selectFieldType(): Promise<FieldTypeOption | null> {
        const items = FIELD_TYPE_OPTIONS.map(option => ({
            label: option.label,
            description: option.description,
            detail: `@${option.decorator}() : ${option.tsType}`,
            option: option
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select the field type",
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        return selected?.option || null;
    }
    
    /**
     * Gets the required status from the user.
     */
    private async getRequiredStatus(): Promise<boolean | undefined> {
        const choice = await vscode.window.showQuickPick(
            [
                { label: "Required", description: "Field must have a value", value: true },
                { label: "Optional", description: "Field can be empty", value: false }
            ],
            {
                placeHolder: "Is this field required?"
            }
        );
        
        return choice?.value;
    }
    
    /**
     * Gets optional AI description for field enhancement.
     */
    private async getAIDescription(): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt: "Enter a description for AI enhancement (optional - press Enter to skip)",
            placeHolder: "e.g., user's full name with validation, email with domain restrictions"
        });
    }
    
    /**
     * Gets relationship configuration for Relationship fields.
     */
    private async getRelationshipConfiguration(cache?: MetadataCache): Promise<Record<string, any> | null> {
        // Step 1: Get available models
        const availableModels = this.getAvailableModels(cache);
        if (availableModels.length === 0) {
            vscode.window.showWarningMessage('No models found for relationship. Make sure you have other model classes defined.');
            return null;
        }
        
        // Step 2: Let user select target model
        const targetModel = await vscode.window.showQuickPick(
            availableModels.map(model => ({
                label: model,
                description: `Reference to ${model} model`
            })),
            {
                placeHolder: "Select the target model for this relationship"
            }
        );
        
        if (!targetModel) {
            return null; // User cancelled
        }
        
        // Step 3: Let user select relationship type
        const relationshipType = await vscode.window.showQuickPick(
            [
                {
                    label: "Reference",
                    description: "Reference relationship - points to another entity",
                    value: "reference"
                },
                {
                    label: "Composition", 
                    description: "Composition relationship - contains/owns another entity",
                    value: "composition"
                }
            ],
            {
                placeHolder: "Select the relationship type"
            }
        );
        
        if (!relationshipType) {
            return null; // User cancelled
        }
        
        return {
            targetModel: targetModel.label,
            relationshipType: relationshipType.value
        };
    }
    
    /**
     * Adds an import for a target model type.
     */
    private async addModelImport(
        document: vscode.TextDocument,
        targetModel: string,
        edit: vscode.WorkspaceEdit,
        cache?: MetadataCache
    ): Promise<void> {
        const content = document.getText();
        const lines = content.split('\n');
        
        // Check if the model is already imported
        const existingImport = lines.find(line => 
            line.includes('import') && 
            line.includes(targetModel) && 
            !line.includes('slingr-framework')
        );
        
        if (existingImport) {
            return; // Already imported
        }
        
        // Find the best place to insert the import (after existing imports)
        let insertLine = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                insertLine = i + 1;
            } else if (lines[i].trim() === '' && insertLine > 0) {
                // Stop after imports section
                break;
            }
        }
        
        // Determine the import path
        let importPath = `./${targetModel}`;
        
        if (cache) {
            // Find the file path for the target model
            const targetModelFilePath = this.findModelFilePath(cache, targetModel);
            
            if (targetModelFilePath) {
                // Calculate relative path from current document to target model file
                const currentDir = path.dirname(document.uri.fsPath);
                const targetDir = path.dirname(targetModelFilePath);
                const relativePath = path.relative(currentDir, targetDir);
                
                // Remove .ts extension from target file
                const targetFileName = path.basename(targetModelFilePath, '.ts');
                
                if (relativePath) {
                    importPath = `./${relativePath}/${targetFileName}`;
                } else {
                    importPath = `./${targetFileName}`;
                }
                
                // Normalize path separators for consistency
                importPath = importPath.replace(/\\/g, '/');
            }
        }
        
        // Create the import statement
        const importStatement = `import { ${targetModel} } from '${importPath}';`;
        
        edit.insert(document.uri, new vscode.Position(insertLine, 0), importStatement + '\n');
    }
    
    /**
     * Finds the file path for a given model name in the cache.
     */
    private findModelFilePath(cache: MetadataCache, modelName: string): string | undefined {
        // Get all data models and check their locations
        const modelClasses = cache.getDataModelClasses();
        const targetModel = modelClasses.find(model => model.name === modelName);
        
        if (!targetModel) {
            return undefined;
        }
        
        // Since we can't get the file path directly from DecoratedClass,
        // we need to search through all files to find where this model is defined
        // We'll use workspace.findFiles to get all TypeScript files and check each one
        return this.searchForModelInFiles(cache, modelName);
    }
    
    /**
     * Searches for a model in all cached files.
     */
    private searchForModelInFiles(cache: MetadataCache, modelName: string): string | undefined {
        // Get all data models and find the one we're looking for
        const modelClasses = cache.getDataModelClasses();
        const targetModel = modelClasses.find(model => model.name === modelName);
        
        if (!targetModel) {
            return undefined;
        }
        
        // Get the model's declaration location to determine the file path
        if (targetModel.declaration && targetModel.declaration.uri) {
            return targetModel.declaration.uri.fsPath;
        }
        
        // Fallback: check common patterns for model file locations
        const commonPaths = [
            `src/data/${modelName}.ts`,
            `src/data/models/${modelName}.ts`,
            `src/models/${modelName}.ts`
        ];
        
        for (const possiblePath of commonPaths) {
            const fileMetadata = cache.getMetadataForFile(possiblePath);
            if (fileMetadata?.classes[modelName]) {
                return possiblePath;
            }
        }
        
        // If not found, return undefined (will use default relative import)
        return undefined;
    }
    
    /**
     * Gets available models from the cache.
     */
    private getAvailableModels(cache?: MetadataCache): string[] {
        if (!cache) {
            return [];
        }
        
        const dataModels = cache.getDataModelClasses();
        return dataModels.map(model => model.name).sort();
    }
    
    /**
     * Generates the TypeScript code for the field.
     */
    private generateFieldCode(fieldInfo: FieldInfo): string {
        const lines: string[] = [];
        
        // Add Field decorator (without indentation - will be applied later)
        if (fieldInfo.required) {
            lines.push("@Field({");
            lines.push("  required: true");
            lines.push("})");
        } else {
            lines.push("@Field({})");
        }
        
        // Add type-specific decorator
        if (fieldInfo.type.decorator === 'Relationship' && fieldInfo.additionalConfig?.relationshipType) {
            lines.push(`@${fieldInfo.type.decorator}({`);
            lines.push(`  type: '${fieldInfo.additionalConfig.relationshipType}'`);
            lines.push(`})`);
        } else {
            lines.push(`@${fieldInfo.type.decorator}()`);
        }
        
        // Add property declaration
        // For Choice fields, use enum type instead of string
        if (fieldInfo.type.decorator === 'Choice') {
            const enumName = this.generateEnumName(fieldInfo.name);
            lines.push(`${fieldInfo.name}!: ${enumName};`);
        } else if (fieldInfo.type.decorator === 'Relationship') {
            // For Relationship fields, use the target model type
            const targetModel = fieldInfo.additionalConfig?.targetModel || 'any';
            lines.push(`${fieldInfo.name}!: ${targetModel};`);
        } else {
            lines.push(`${fieldInfo.name}!: ${fieldInfo.type.tsType};`);
        }
        
        return lines.join("\n");
    }
    
    /**
     * Inserts the field code into the model class at the appropriate location.
     */
    private async insertFieldIntoModel(
        document: vscode.TextDocument,
        modelClassName: string,
        fieldCode: string,
        fieldInfo: FieldInfo,
        cache?: MetadataCache
    ): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        const content = document.getText();
        const lines = content.split('\n');

        // Find import statements to ensure decorators are imported
        const decoratorImports = new Set<string>();
        decoratorImports.add('Field');
        decoratorImports.add(fieldInfo.type.decorator);
        
        // Handle model imports for Relationship fields
        if (fieldInfo.type.decorator === 'Relationship' && fieldInfo.additionalConfig?.targetModel) {
            await this.addModelImport(document, fieldInfo.additionalConfig.targetModel, edit, cache);
        }
        
        // Add imports if missing or update existing import
        const slingrFrameworkImportLine = lines.findIndex(line => 
            line.includes('from') && line.includes('slingr-framework')
        );
        
        if (slingrFrameworkImportLine !== -1) {
            // Update existing import
            const currentImport = lines[slingrFrameworkImportLine];
            const importMatch = currentImport.match(/import\s+\{([^}]+)\}\s+from\s+['"]slingr-framework['"];?/);
            
            if (importMatch) {
                const currentImports = importMatch[1]
                    .split(',')
                    .map(imp => imp.trim())
                    .filter(imp => imp.length > 0);
                
                // Add new imports that aren't already present
                const allImports = new Set([...currentImports, ...decoratorImports]);
                const newImportString = `import { ${Array.from(allImports).sort().join(', ')} } from 'slingr-framework';`;
                
                edit.replace(
                    document.uri,
                    new vscode.Range(slingrFrameworkImportLine, 0, slingrFrameworkImportLine, currentImport.length),
                    newImportString
                );
            }
        } else {
            // Add new import if no slingr-framework import exists
            const newImportString = `import { ${Array.from(decoratorImports).sort().join(', ')} } from 'slingr-framework';\n`;
            edit.insert(document.uri, new vscode.Position(0, 0), newImportString);
        } 
        
        // Find the model class and its closing brace
        let classStartLine = -1;
        let classEndLine = -1;
        let braceCount = 0;
        let inClass = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for class declaration
            if (line.includes(`class ${modelClassName}`) && line.includes('extends')) {
                classStartLine = i;
                inClass = true;
                if (line.includes('{')) {
                    braceCount = 1;
                }
                continue;
            }
            
            if (inClass) {
                // Count braces to find class end
                const openBraces = (line.match(/\{/g) || []).length;
                const closeBraces = (line.match(/\}/g) || []).length;
                braceCount += openBraces - closeBraces;
                
                if (braceCount === 0) {
                    classEndLine = i;
                    break;
                }
            }
        }
        
        if (classStartLine === -1 || classEndLine === -1) {
            throw new Error(`Could not find class ${modelClassName} boundaries`);
        }
        
        // Detect existing indentation pattern from field declarations
        const detectedIndentation = detectIndentation(lines, classStartLine, classEndLine);
        
        // Find the best insertion point (before the closing brace, after existing fields)
        let insertionLine = classEndLine; // This will be the closing brace line
        
        // Look for existing fields to insert after them
        let foundExistingContent = false;
        for (let i = classEndLine - 1; i > classStartLine; i--) {
            const line = lines[i].trim();
            if (line && !line.startsWith('}') && !line.startsWith('//') && !line.startsWith('*')) {
                insertionLine = i + 1;
                foundExistingContent = true;
                break;
            }
        }
        
        // If no existing content found, insert right before the closing brace
        // but ensure we're not on the same line as the closing brace
        if (!foundExistingContent) {
            insertionLine = classEndLine; // Insert at the closing brace line, content will push it down
        }
        
        // Apply detected indentation to the field code
        const indentedFieldCode = applyIndentation(fieldCode, detectedIndentation);
        
        // Prepare the insertion
        const insertPosition = new vscode.Position(insertionLine, 0);
        
        // Add spacing if needed
        let codeToInsert = indentedFieldCode;
        
        // Always add a newline before the field if we're inserting at the closing brace
        // or if there's existing content above
        if (insertionLine === classEndLine || foundExistingContent) {
            codeToInsert = "\n" + codeToInsert;
        }
        
        // Always add a newline after the field to separate it from the closing brace
        codeToInsert = codeToInsert + "\n";
        
        edit.insert(document.uri, insertPosition, codeToInsert);
        
        // Apply the edit
        await vscode.workspace.applyEdit(edit);
        
        // Save the document
        await document.save();
    }
    
    /**
     * Generates an enum name from a field name.
     * Converts camelCase field name to PascalCase enum name.
     */
    private generateEnumName(fieldName: string): string {
        // Convert camelCase to PascalCase and add appropriate suffix
        const pascalCase = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
        
        // Add descriptive suffix based on common patterns
        const fieldLower = fieldName.toLowerCase();
        
        if (fieldLower.includes('status')) {
            return pascalCase.replace(/status/i, 'Status');
        }
        if (fieldLower.includes('type')) {
            return pascalCase.replace(/type/i, 'Type');
        }
        if (fieldLower.includes('category')) {
            return pascalCase.replace(/category/i, 'Category');
        }
        if (fieldLower.includes('state')) {
            return pascalCase.replace(/state/i, 'State');
        }
        if (fieldLower.includes('mode')) {
            return pascalCase.replace(/mode/i, 'Mode');
        }
        if (fieldLower.includes('level')) {
            return pascalCase.replace(/level/i, 'Level');
        }
        
        // Default: add "Type" suffix if no pattern matches
        return pascalCase + 'Type';
    }
    
    /**
     * Creates and inserts an enum definition for a Choice field at the end of the file.
     */
    private async insertEnumForChoiceField(
        document: vscode.TextDocument,
        fieldInfo: FieldInfo
    ): Promise<void> {
        const enumName = this.generateEnumName(fieldInfo.name);
        
        // Ask user for enum values
        const enumValues = await this.getEnumValues(fieldInfo.name, enumName);
        if (!enumValues || enumValues.length === 0) {
            return; // User cancelled or provided no values
        }
        
        // Generate enum code
        const enumCode = this.generateEnumCode(enumName, enumValues);
        
        // Insert enum at the end of the file
        const content = document.getText();
        const lines = content.split('\n');
        
        // Find the last non-empty line
        let insertionLine = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim()) {
                insertionLine = i + 1;
                break;
            }
        }
        
        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(insertionLine, 0);
        
        // Add spacing before enum
        const codeToInsert = "\n" + enumCode + "\n";
        
        edit.insert(document.uri, insertPosition, codeToInsert);
        await vscode.workspace.applyEdit(edit);
        await document.save();
    }
    
    /**
     * Prompts user for enum values.
     */
    private async getEnumValues(fieldName: string, enumName: string): Promise<string[] | null> {
        const enumValuesInput = await vscode.window.showInputBox({
            prompt: `Enter enum values for ${enumName} (comma-separated)`,
            placeHolder: "e.g. in-progress, completed",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "At least one enum value is required";
                }
                return null;
            }
        });
        
        if (!enumValuesInput) {
            return null;
        }
        
        // Parse and clean up the values
        return enumValuesInput
            .split(',')
            .map(value => value.trim())
            .filter(value => value.length > 0)
            .map(value => this.normalizeEnumValue(value));
    }
    
    /**
     * Normalizes an enum value to follow PascalCase conventions.
     */
    private normalizeEnumValue(value: string): string {
        // If it's already in PascalCase, return as is
        if (/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
            return value;
        }
        
        // Convert to PascalCase
        return value
            .replace(/[-_\s]+/g, ' ') // Replace hyphens, underscores, and spaces with spaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
    
    /**
     * Generates the enum code.
     */
    private generateEnumCode(enumName: string, values: string[]): string {
        const lines: string[] = [];
        
        lines.push(`export enum ${enumName} {`);
        
        values.forEach((value, index) => {
            const isLast = index === values.length - 1;
            // Use PascalCase for enum key, kebab-case for string value
            const kebabValue = value
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .toLowerCase();
            const enumEntry = `  ${value} = '${kebabValue}'${isLast ? '' : ','}`;
            lines.push(enumEntry);
        });
        
        lines.push('}');
        
        return lines.join('\n');
    }
    
    
    
    /**
     * Creates a specific prompt for enhancing the newly added field.
     */
    private createFieldEnhancementPrompt(
        fieldInfo: FieldInfo,
        description: string,
        modelName: string
    ): string {
        return `Enhance the field '${fieldInfo.name}' of type ${fieldInfo.type.label} in model ${modelName}. ` +
               `Current field structure: @Field(${fieldInfo.required ? '{required: true}' : ''}) @${fieldInfo.type.decorator}() ${fieldInfo.name}: ${fieldInfo.type.tsType}. ` +
               `Enhancement description: ${description}`;
    }
}

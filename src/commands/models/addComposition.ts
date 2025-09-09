import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../../cache/cache";
import { AIEnhancedTool, FieldInfo, FieldTypeOption } from "../interfaces";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";

/**
 * Tool for adding composition relationships to existing Model classes.
 *
 * This tool creates a new inner model within the same file as the outer model
 * and establishes a composition relationship between them. The inner model
 * name is derived from the field name (converted to singular), and the field
 * in the outer model is created as an array if the field name is plural.
 *
 * @example
 * ```typescript
 * // Adding field "addresses" creates:
 * // 1. New Address model with backref to parent
 * // 2. Field in outer model: addresses: Address[]
 *
 * @Field()
 * @Relationship({ type: 'composition' })
 * addresses!: Address[];
 * ```
 */
export class AddCompositionTool implements AIEnhancedTool {
    private userInputService: UserInputService;
    private projectAnalysisService: ProjectAnalysisService;
    private sourceCodeService: SourceCodeService;
    private fileSystemService: FileSystemService;

    constructor() {
        this.userInputService = new UserInputService();
        this.projectAnalysisService = new ProjectAnalysisService();
        this.sourceCodeService = new SourceCodeService();
        this.fileSystemService = new FileSystemService();
    }

    /**
     * Processes user input with AI enhancement for composition addition.
     * @param userInput - Description of the composition to create
     * @param targetUri - Target model file for the new composition
     * @param cache - Metadata cache instance
     * @param additionalContext - Additional context for composition creation
     */
    async processWithAI(
        userInput: string,
        targetUri: vscode.Uri,
        cache: MetadataCache,
        additionalContext?: any
    ): Promise<void> {
        // For now, delegate to the main method
        await this.addComposition(targetUri, cache);
    }

    /**
     * Adds a composition relationship to an existing model file.
     *
     * @param targetUri - The URI of the model file where the composition should be added
     * @param cache - The metadata cache for context about existing models
     * @returns Promise that resolves when the composition is added
     */
    public async addComposition(targetUri: vscode.Uri, cache: MetadataCache): Promise<void> {
        try {
            // Step 1: Validate target file
            const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, cache);

            // Step 2: Get field name from user
            const fieldName = await this.getCompositionFieldName(modelClass);
            if (!fieldName) {
                return; // User cancelled
            }

            // Step 3: Determine inner model name and array status
            const { innerModelName, isArray } = this.determineInnerModelInfo(fieldName);

            // Step 4: Check if inner model already exists
            await this.validateInnerModelName(document, innerModelName);

            // Step 5: Create the inner model
            await this.createInnerModel(document, innerModelName, modelClass.name);

            // Step 6: Add composition field to outer model
            await this.addCompositionField(document, modelClass.name, fieldName, innerModelName, isArray, cache);

            // Step 7: Show success message
            vscode.window.showInformationMessage(
                `Composition relationship created successfully! Added ${innerModelName} model and ${fieldName} field.`
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add composition: ${error}`);
            console.error("Error adding composition:", error);
        }
    }

    /**
     * Validates the target file and prepares it for composition addition.
     */
    private async validateAndPrepareTarget(
        targetUri: vscode.Uri,
        cache: MetadataCache
    ): Promise<{ modelClass: DecoratedClass; document: vscode.TextDocument }> {
        // Ensure the file is a TypeScript file
        if (!targetUri.fsPath.endsWith(".ts")) {
            throw new Error("Target file must be a TypeScript file (.ts)");
        }

        // Open the document
        const document = await vscode.workspace.openTextDocument(targetUri);

        // Get model information from cache
        const modelClass = await this.projectAnalysisService.findModelClass(document, cache);
        if (!modelClass) {
            throw new Error("No model class found in this file. Make sure the class has a @Model decorator.");
        }

        return { modelClass, document };
    }

    /**
     * Gets the composition field name from the user.
     */
    private async getCompositionFieldName(modelClass: DecoratedClass): Promise<string | null> {
        const fieldName = await vscode.window.showInputBox({
            prompt: "Enter the composition field name (camelCase)",
            placeHolder: "e.g., addresses, phoneNumbers, tasks",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "Field name is required";
                }
                if (!/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
                    return "Field name must be in camelCase (e.g., addresses, phoneNumbers)";
                }

                // Check if field already exists in the model
                const existingFields = Object.keys(modelClass.properties || {});
                if (existingFields.includes(value.trim())) {
                    return `Field '${value.trim()}' already exists in this model`;
                }

                return null;
            },
        });

        return fieldName?.trim() || null;
    }

    /**
     * Determines the inner model name and whether the field should be an array.
     */
    private determineInnerModelInfo(fieldName: string): { innerModelName: string; isArray: boolean } {
        const singularName = this.toSingular(fieldName);
        const innerModelName = this.toPascalCase(singularName);
        const isArray = fieldName !== singularName; // If we converted from plural to singular, it's an array

        return { innerModelName, isArray };
    }

    /**
     * Converts a potentially plural field name to singular.
     */
    private toSingular(fieldName: string): string {
        // Handle common pluralization patterns
        if (fieldName.endsWith("ies")) {
            return fieldName.slice(0, -3) + "y";
        } else if (fieldName.endsWith("es")) {
            // Check if it's a word that ends with s, x, ch, sh
            const base = fieldName.slice(0, -1);
            if (base.endsWith("s") || base.endsWith("x") || base.endsWith("ch") || base.endsWith("sh")) {
                return base;
            }
            // Otherwise it might be a regular plural like "boxes" -> "box"
            return fieldName.slice(0, -2);
        } else if (fieldName.endsWith("s") && fieldName.length > 1) {
            // Simple plural case
            return fieldName.slice(0, -1);
        }
        
        // If no plural pattern found, return as is
        return fieldName;
    }

    /**
     * Converts camelCase to PascalCase.
     */
    private toPascalCase(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Validates that the inner model name doesn't already exist.
     */
    private async validateInnerModelName(document: vscode.TextDocument, innerModelName: string): Promise<void> {
        const content = document.getText();
        if (content.includes(`class ${innerModelName}`)) {
            throw new Error(`A class named '${innerModelName}' already exists in this file`);
        }
    }

    /**
     * Creates the inner model in the same file.
     */
    private async createInnerModel(
        document: vscode.TextDocument,
        innerModelName: string,
        outerModelName: string
    ): Promise<void> {
        // Generate the inner model code
        const innerModelCode = this.generateInnerModelCode(innerModelName, outerModelName);
        
        // Use the new insertModel method to insert after the outer model
        await this.sourceCodeService.insertModel(
            document,
            innerModelCode,
            outerModelName, // Insert after the outer model
            new Set(["Model", "Field", "Relationship"]) // Ensure required decorators are imported
        );
    }

    /**
     * Generates the TypeScript code for the inner model.
     */
    private generateInnerModelCode(innerModelName: string, outerModelName: string): string {
        const lines: string[] = [];

        lines.push(`@Model()`);
        lines.push(`class ${innerModelName} {`);
        lines.push(``);
        lines.push(`}`);

        return lines.join("\n");
    }

    /**
     * Adds the composition field to the outer model.
     */
    private async addCompositionField(
        document: vscode.TextDocument,
        outerModelName: string,
        fieldName: string,
        innerModelName: string,
        isArray: boolean,
        cache: MetadataCache
    ): Promise<void> {
        // Create field info for the composition field
        const fieldType: FieldTypeOption = {
            label: "Relationship",
            decorator: "Relationship",
            tsType: isArray ? `${innerModelName}[]` : innerModelName,
            description: "Composition relationship"
        };

        const fieldInfo: FieldInfo = {
            name: fieldName,
            type: fieldType,
            required: false, // Compositions are typically optional
            additionalConfig: {
                relationshipType: "composition",
                targetModel: innerModelName,
                targetModelPath: document.uri.fsPath
            }
        };

        // Generate the field code
        const fieldCode = this.generateCompositionFieldCode(fieldInfo, innerModelName, isArray);

        // Insert the field
        await this.sourceCodeService.insertField(document, outerModelName, fieldInfo, fieldCode, cache);
    }

    /**
     * Generates the TypeScript code for the composition field.
     */
    private generateCompositionFieldCode(fieldInfo: FieldInfo, innerModelName: string, isArray: boolean): string {
        const lines: string[] = [];

        // Add Field decorator
        lines.push("@Field({})");

        // Add Relationship decorator
        lines.push("@Composition()");

        // Add property declaration
        const typeDeclaration = isArray ? `${innerModelName}[]` : innerModelName;
        lines.push(`${fieldInfo.name}!: ${typeDeclaration};`);

        return lines.join("\n");
    }
}

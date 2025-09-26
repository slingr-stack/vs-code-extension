// src/commands/fields/extractFieldsToEmbedded.ts
import * as vscode from "vscode";
import { ChangeObject, ManualRefactorContext, ExtractFieldsToEmbeddedPayload } from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { ExtractFieldsController } from "./extractFieldsController";
import { ModelService } from "../../services/modelService";
import * as path from "path";

/**
 * Refactor tool for extracting multiple fields from a model to a new embedded model.
 *
 * This tool allows users to select multiple fields and move them to a new embedded
 * model in a separate file, creating an embedded relationship between the source and new models.
 * The embedded model extends BaseModel and has no dataSource.
 */
export class ExtractFieldsToEmbeddedTool extends ExtractFieldsController {
    private deleteFieldTool: DeleteFieldTool;
    private modelService: ModelService;

    constructor() {
        super();
        this.deleteFieldTool = new DeleteFieldTool();
        this.modelService = new ModelService();
    }

    /**
     * Returns the VS Code command identifier for this refactor tool.
     */
    getCommandId(): string {
        return "slingr-vscode-extension.extractFieldsToEmbedded";
    }

    /**
     * Returns the human-readable title shown in refactor menus.
     */
    getTitle(): string {
        return "Extract Fields to Embedded";
    }

    /**
     * Returns the types of changes this tool handles.
     */
    getHandledChangeTypes(): string[] {
        return ["EXTRACT_FIELDS_TO_EMBEDDED"];
    }

    /**
     * Initiates the manual refactor by prompting user for field selection, new model name, and embedded field name.
     */
    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const fieldSelection = await this.getSelectedFieldsFromContext(context, "embedded");
        if (!fieldSelection) {
            return undefined;
        }

        const { sourceModel, selectedFields } = fieldSelection;

        // Get the new model name
        const newModelName = await this.userInputService.showPrompt("Enter the name for the new embedded model:");
        if (!newModelName) {
            return undefined;
        }

        // Get the embedded field name
        const embeddedFieldName = await this.userInputService.showPrompt(
            "Enter the name for the new embedded field (e.g., 'address', 'profile'):"
        );
        if (!embeddedFieldName) {
            return undefined;
        }

        const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
        const newModelPath = path.join(sourceDir, `${newModelName}.ts`);
        const newModelUri = vscode.Uri.file(newModelPath);

        const payload: ExtractFieldsToEmbeddedPayload = {
            sourceModelName: sourceModel.name,
            newModelName: newModelName,
            embeddedFieldName: embeddedFieldName,
            fieldsToExtract: selectedFields,
            isManual: true,
            urisToCreate: [
                {
                    uri: newModelUri,
                },
            ],
        };

        return {
            type: "EXTRACT_FIELDS_TO_EMBEDDED",
            uri: context.uri,
            description: `Extract ${selectedFields.length} field(s) to new embedded model '${newModelName}' with embedded field '${embeddedFieldName}' in model '${sourceModel.name}'`,
            payload,
        };
    }

    /**
     * Prepares the workspace edit for the refactor operation.
     */
    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const payload = change.payload as ExtractFieldsToEmbeddedPayload;

        try {
            const sourceModel = cache.getModelByName(payload.sourceModelName);
            if (!sourceModel) {
                throw new Error(`Could not find source model '${payload.sourceModelName}'`);
            }

            const edit = new vscode.WorkspaceEdit();

            // Get the URI from the payload
            const newModelUri = payload.urisToCreate![0].uri;

            // Generate the complete file content using ModelService
            const completeFileContent = await this.generateCompleteEmbeddedModelFileWithService(
                payload.newModelName,
                payload.fieldsToExtract,
                newModelUri.fsPath
            );

            const metadata: vscode.WorkspaceEditEntryMetadata = {
                label: `Create new embedded model file ${path.basename(newModelUri.fsPath)}`,
                description: `Creating new embedded model file for ${payload.newModelName}`,
                needsConfirmation: true,
            };

            // Create the file with content
            edit.createFile(
                newModelUri,
                {
                    overwrite: false,
                    ignoreIfExists: true,
                    contents: Buffer.from(completeFileContent, "utf8"),
                },
                metadata
            );

            // Step 2: Add the embedded field to the source model
            await this.addEmbeddedFieldToSourceModel(
                edit,
                sourceModel,
                payload.embeddedFieldName,
                payload.newModelName,
                cache
            );

            // Step 3: Remove the fields from the source model
            for (const field of payload.fieldsToExtract) {
                await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache, edit);
            }

            return edit;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to prepare extract fields to embedded edit: ${error}`);
            throw error;
        }
    }

    /**
     * Generates the complete file content for the new embedded model using ModelService.
     * Embedded models extend BaseModel and have no dataSource.
     */
    private async generateCompleteEmbeddedModelFileWithService(
        modelName: string,
        fieldsToExtract: PropertyMetadata[],
        targetFilePath: string
    ): Promise<string> {
        // Generate class body from fields
        const classBodyLines: string[] = [];
        for (const field of fieldsToExtract) {
            const fieldCode = this.generateFieldCodeFromPropertyMetadata(field);
            classBodyLines.push(fieldCode);
            classBodyLines.push(""); // Empty line between fields
        }
        const classBody = classBodyLines.join("\n");

        // Collect required imports from PropertyMetadata decorators
        const existingImports = new Set<string>();
        for (const field of fieldsToExtract) {
            for (const decorator of field.decorators) {
                existingImports.add(decorator.name);
            }
        }
        

        // Use ModelService to generate the complete file content
        // Embedded models have no dataSource, so we pass undefined
        return await this.modelService.generateModelFileContent(
            modelName,
            classBody,
            undefined, // no dataSource for embedded models
            existingImports,
            false, // isComponent = false since it's a separate model file
            targetFilePath,
            undefined, // no cache needed for embedded models
            undefined, // no docs
            true, // includeImports = true since this is a new file
            false // includeDefaultId = false for embedded models
        );
    }

    /**
     * Adds an embedded field to the source model.
     */
    private async addEmbeddedFieldToSourceModel(
        edit: vscode.WorkspaceEdit,
        sourceModel: DecoratedClass,
        embeddedFieldName: string,
        targetModelName: string,
        cache: MetadataCache
    ): Promise<void> {
        // Check if embedded field already exists
        const existingFields = Object.keys(sourceModel.properties || {});
        if (existingFields.includes(embeddedFieldName)) {
            throw new Error(`Field '${embeddedFieldName}' already exists in model ${sourceModel.name}`);
        }

        const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);

        // Generate the embedded field code
        const fieldCode = this.generateEmbeddedFieldCode(embeddedFieldName, targetModelName);

        // Add required imports
        const requiredImports = new Set(["Field", "Embedded"]);
        await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

        // Add import for the target model
        await this.sourceCodeService.addModelImport(document, targetModelName, edit, cache);

        // Find class boundaries and add field
        const lines = document.getText().split("\n");
        const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModel.name);

        const metadata: vscode.WorkspaceEditEntryMetadata = {
            label: `Add embedded field ${embeddedFieldName}`,
            description: `Adding embedded field ${embeddedFieldName} of type ${targetModelName}`,
            needsConfirmation: true,
        };

        edit.insert(sourceModel.declaration.uri, new vscode.Position(classEndLine, 0), `\n${fieldCode}\n`, metadata);
    }

    /**
     * Public method for programmatic usage of the extract fields to embedded functionality.
     */
    public async extractFieldsToEmbedded(
        cache: MetadataCache,
        sourceModelName: string,
        fieldsToExtract: PropertyMetadata[],
        newModelName: string,
        embeddedFieldName: string
    ): Promise<vscode.WorkspaceEdit> {
        const sourceModel = cache.getModelByName(sourceModelName);
        if (!sourceModel) {
            throw new Error(`Could not find source model '${sourceModelName}'`);
        }

        const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
        const newModelPath = path.join(sourceDir, `${newModelName}.ts`);
        const newModelUri = vscode.Uri.file(newModelPath);

        const payload: ExtractFieldsToEmbeddedPayload = {
            sourceModelName: sourceModelName,
            newModelName: newModelName,
            embeddedFieldName: embeddedFieldName,
            fieldsToExtract: fieldsToExtract,
            isManual: false,
            urisToCreate: [
                {
                    uri: newModelUri,
                },
            ],
        };

        const changeObject: ChangeObject = {
            type: "EXTRACT_FIELDS_TO_EMBEDDED",
            uri: sourceModel.declaration.uri,
            description: `Extract ${fieldsToExtract.length} field(s) to new embedded model '${newModelName}' with embedded field '${embeddedFieldName}' in model '${sourceModelName}'`,
            payload,
        };

        return await this.prepareEdit(changeObject, cache);
    }

    /**
     * Generates the embedded field code with only @Embedded() decorator.
     */
    private generateEmbeddedFieldCode(fieldName: string, targetModelName: string): string {
        const lines: string[] = [];

        // Add Embedded decorator (no arguments needed)
        lines.push("  @Embedded()");

        // Add property declaration
        lines.push(`  ${fieldName}!: ${targetModelName};`);

        return lines.join("\n");
    }
}
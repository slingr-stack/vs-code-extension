import * as vscode from "vscode";
import {
  IRefactorTool,
  ChangeObject,
  ManualRefactorContext,
  ExtractFieldsToReferencePayload,
} from "../../refactor/refactorInterfaces";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { NewModelTool } from "../models/newModel";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import { TreeViewContext } from "../commandHelpers";
import { isModelFile } from "../../utils/metadata";
import * as path from 'path';

/**
 * Refactor tool for extracting multiple fields from a model to a new reference model.
 *
 * This tool allows users to select multiple fields and move them to a new reference
 * model in a separate file, creating a reference relationship between the source and new models.
 * It provides preview functionality before applying changes.
 */
export class ExtractFieldsToReferenceTool implements IRefactorTool {
    private userInputService: UserInputService;
    private sourceCodeService: SourceCodeService;
    private fileSystemService: FileSystemService;
    private newModelTool: NewModelTool;
    private addFieldTool: AddFieldTool;
    private deleteFieldTool: DeleteFieldTool;

    constructor() {
        this.userInputService = new UserInputService();
        this.sourceCodeService = new SourceCodeService();
        this.fileSystemService = new FileSystemService();
        this.newModelTool = new NewModelTool();
        this.addFieldTool = new AddFieldTool();
        this.deleteFieldTool = new DeleteFieldTool();
    }

    /**
     * Returns the VS Code command identifier for this refactor tool.
     */
    getCommandId(): string {
        return "slingr-vscode-extension.extractFieldsToReference";
    }

    /**
     * Returns the human-readable title shown in refactor menus.
     */
    getTitle(): string {
        return "Extract Fields to Reference";
    }

    /**
     * Returns the types of changes this tool handles.
     */
    getHandledChangeTypes(): string[] {
        return ["EXTRACT_FIELDS_TO_REFERENCE"];
    }

    /**
     * Determines if this tool can handle a manual refactor trigger.
     * Allows extraction when multiple fields are selected in a model file.
     */
    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        // Must be in a model file
        if (!isModelFile(context.uri)) {
            return false;
        }

        // Get the source model from context
        const sourceModel = this.getSourceModelFromContext(context);
        if (!sourceModel) {
            return false;
        }

        // For manual trigger, we allow it if there are fields in the model
        return Object.keys(sourceModel.properties || {}).length > 1; // Need at least 2 fields to extract
    }

    /**
     * This tool doesn't detect automatic changes.
     */
    analyze(): ChangeObject[] {
        return [];
    }

    /**
     * Initiates the manual refactor by prompting user for field selection, new model name, and reference field name.
     */
    async initiateManualRefactor(
        context: ManualRefactorContext,
    ): Promise<ChangeObject | undefined> {
        const sourceModel = this.getSourceModelFromContext(context);
        if (!sourceModel) {
            vscode.window.showErrorMessage("Could not find a model in the current context");
            return undefined;
        }

        // Get all fields in the model
        const allFields = Object.values(sourceModel.properties) as PropertyMetadata[];
        if (allFields.length < 2) {
            vscode.window.showErrorMessage("Model must have at least 2 fields to extract some to reference");
            return undefined;
        }

        let selectedFields: PropertyMetadata[] | undefined;

        const treeViewContext = context.treeViewContext as TreeViewContext | undefined;

        if (treeViewContext?.fieldItems && treeViewContext.fieldItems.length > 0) {
            // Tree view context: use the selected field items
            selectedFields = treeViewContext.fieldItems.map((fieldItem) => {
                const fieldItemName = fieldItem.label.toLowerCase();
                const field = allFields.find((prop) => prop.name === fieldItemName);
                if (!field) {
                    throw new Error(`Could not find field '${fieldItem.label}' in model '${context.metadata?.name}'`);
                }
                return field;
            });
        } else {
            // Let user select which fields to extract
            selectedFields = await this.selectFieldsForExtraction(allFields);
            if (!selectedFields || selectedFields.length === 0) {
                return undefined;
            }
        }

        // Get the new model name
        const newModelName = await this.userInputService.showPrompt(
            "Enter the name for the new reference model:"
        );
        if (!newModelName) {
            return undefined;
        }

        // Get the reference field name
        const referenceFieldName = await this.userInputService.showPrompt(
            "Enter the name for the new reference field (e.g., 'user', 'category'):"
        );
        if (!referenceFieldName) {
            return undefined;
        }

        const payload: ExtractFieldsToReferencePayload = {
            sourceModelName: sourceModel.name,
            newModelName: newModelName,
            referenceFieldName: referenceFieldName,
            fieldsToExtract: selectedFields,
            isManual: true,
        };

        return {
            type: "EXTRACT_FIELDS_TO_REFERENCE",
            uri: context.uri,
            description: `Extract ${selectedFields.length} field(s) to new reference model '${newModelName}' with reference field '${referenceFieldName}' in model '${sourceModel.name}'`,
            payload,
        };
    }

    /**
     * Prepares the workspace edit for the refactor operation.
     */
    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const payload = change.payload as ExtractFieldsToReferencePayload;

        try {
            const sourceModel = cache.getModelByName(payload.sourceModelName);
            if (!sourceModel) {
                throw new Error(`Could not find source model '${payload.sourceModelName}'`);
            }

            const combinedEdit = new vscode.WorkspaceEdit();

            const sourceDir = path.dirname(sourceModel.declaration.uri.fsPath);
            const newModelPath = path.join(sourceDir, `${payload.newModelName}.ts`);
            const newModelUri = vscode.Uri.file(newModelPath);

            // Step 1: Create the new reference model with the extracted fields
            const { edit: edit } = await this.createReferenceModelWithFields(
                sourceModel,
                payload.newModelName,
                payload.fieldsToExtract,
                cache,
                newModelUri
            );

            // Step 2: Add the reference field to the source model
            await this.addReferenceFieldToSourceModel(
                edit,
                sourceModel,
                payload.referenceFieldName,
                payload.newModelName,
                cache
            );

            // Step 3: Remove the fields from the source model
            for (const field of payload.fieldsToExtract) {
                await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache, edit);
            }

            return edit;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to prepare extract fields to reference edit: ${error}`);
            throw error;
        }
    }

    /**
     * Helper method to get selected fields from editor selections.
     */
    private getSelectedFields(model: DecoratedClass, selections: readonly vscode.Selection[]): PropertyMetadata[] {
        const selectedFields: PropertyMetadata[] = [];
        for (const selection of selections) {
            for (const field of Object.values(model.properties)) {
                if (selection.intersection(field.declaration.range)) {
                    selectedFields.push(field);
                }
            }
        }
        return selectedFields;
    }

    /**
     * Shows user a quick pick to select which fields to extract.
     */
    private async selectFieldsForExtraction(allFields: PropertyMetadata[]): Promise<PropertyMetadata[] | undefined> {
        const fieldItems = allFields.map((field) => ({
            label: field.name,
            description: this.getFieldTypeDescription(field),
            field: field,
        }));

        const selectedItems = await vscode.window.showQuickPick(fieldItems, {
            canPickMany: true,
            placeHolder: "Select fields to extract to the new reference model",
            title: "Extract Fields to Reference",
        });

        return selectedItems?.map((item) => item.field);
    }

    /**
     * Gets a description of the field type for display in the quick pick.
     */
    private getFieldTypeDescription(field: PropertyMetadata): string {
        const decoratorName = this.getDecoratorName(field.decorators);
        return `@${decoratorName}`;
    }

    /**
     * Gets the source model from the refactor context, handling different context types.
     */
    private getSourceModelFromContext(context: ManualRefactorContext): DecoratedClass | null {
        // Case 1: metadata is already a DecoratedClass (model)
        if (context.metadata && "properties" in context.metadata) {
            return context.metadata as DecoratedClass;
        }

        // Case 2: metadata is a PropertyMetadata (field) - find the containing model
        if (context.metadata && "decorators" in context.metadata) {
            const fieldMetadata = context.metadata as PropertyMetadata;
            return this.findSourceModelForField(context.cache, fieldMetadata);
        }

        // Case 3: no specific metadata - try to find model at the range
        return this.findModelAtRange(context.cache, context.uri, context.range);
    }

    /**
     * Finds the model that contains the given field.
     */
    private findSourceModelForField(cache: MetadataCache, fieldMetadata: PropertyMetadata): DecoratedClass | null {
        const allModels = cache.getDataModelClasses();

        for (const model of allModels) {
            const fieldInModel = Object.values(model.properties).find(
                (prop) =>
                    prop.name === fieldMetadata.name &&
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
     * Finds the model class that contains the given range.
     */
    private findModelAtRange(cache: MetadataCache, uri: vscode.Uri, range: vscode.Range): DecoratedClass | null {
        const allModels = cache.getDataModelClasses();

        for (const model of allModels) {
            if (model.declaration.uri.fsPath === uri.fsPath && model.declaration.range.contains(range)) {
                return model;
            }
        }

        return null;
    }

    /**
     * Gets the decorator name for a field's type.
     */
    private getDecoratorName(decorators: any[]): string {
        const typeDecorator = decorators.find((d) => FIELD_TYPE_OPTIONS.some((o) => o.decorator === d.name));
        return typeDecorator ? typeDecorator.name : "Text";
    }

    /**
     * Creates a new reference model in a separate file with the extracted fields.
     */
    private async createReferenceModelWithFields(
        sourceModel: DecoratedClass,
        newModelName: string,
        fieldsToExtract: PropertyMetadata[],
        cache: MetadataCache,
        newModelUri: vscode.Uri
    ): Promise<{ edit: vscode.WorkspaceEdit; newModelUri: vscode.Uri }> {
        // Check if model with this name already exists
        const existingModel = cache.getModelByName(newModelName);
        if (existingModel) {
            throw new Error(`A model named '${newModelName}' already exists in the project`);
        }

        const edit = new vscode.WorkspaceEdit();

        // Generate the complete file content including imports and model
        const completeFileContent = this.generateCompleteReferenceModelFile(newModelName, fieldsToExtract, sourceModel, cache);

        edit.createFile(newModelUri, {overwrite: false, ignoreIfExists: true, contents: Buffer.from(completeFileContent, 'utf8')});

        return { edit, newModelUri };
    }

    /**
     * Generates the complete file content for the new reference model, including imports.
     */
    private generateCompleteReferenceModelFile(
        modelName: string,
        fieldsToExtract: PropertyMetadata[],
        sourceModel: DecoratedClass,
        cache: MetadataCache
    ): string {
        const lines: string[] = [];

        // Extract data source from source model
        const dataSource = this.extractDataSourceFromModel(sourceModel, cache);

        // Generate imports
        const requiredImports = new Set(["Model", "Field", "PersistentModel"]);
        for (const field of fieldsToExtract) {
            for (const decorator of field.decorators) {
                requiredImports.add(decorator.name);
            }
        }

        // Add the import statement
        const importList = Array.from(requiredImports).sort();
        lines.push(`import { ${importList.join(', ')} } from 'slingr-framework';`);


        //Add dataSource import 
        lines.push(`import { ${dataSource} } from '../datasources/datasource';`);
        lines.push(''); // Empty line after imports

        // Add model decorator and class
        if (dataSource) {
            lines.push(`@Model({`);
            lines.push(`  dataSource: ${dataSource}`);
            lines.push(`})`);
        } else {
            lines.push(`@Model()`);
        }

        lines.push(`export class ${modelName} extends PersistentModel {`);
        lines.push("");

        // Add each field using PropertyMetadata to preserve all decorator information
        for (const field of fieldsToExtract) {
            const fieldCode = this.generateFieldCodeFromPropertyMetadata(field);
            lines.push(...fieldCode.split("\n").map((line) => (line ? `  ${line}` : "")));
            lines.push("");
        }

        lines.push("}");
        lines.push(''); // Empty line at end

        return lines.join("\n");
    }

    /**
     * Generates field code directly from PropertyMetadata, preserving all decorator information.
     */
    private generateFieldCodeFromPropertyMetadata(property: PropertyMetadata): string {
        const lines: string[] = [];

        // Add all decorators in the same order as the original
        for (const decorator of property.decorators) {
            if (decorator.name === "Field" || decorator.name === "Relationship") {
                // Handle Field and Relationship decorators with their arguments
                if (decorator.arguments && decorator.arguments.length > 0) {
                    lines.push(`@${decorator.name}({`);
                    const args = decorator.arguments[0]; // Usually the first argument contains the options object
                    if (typeof args === "object" && args !== null) {
                        // Format each property of the arguments object
                        for (const [key, value] of Object.entries(args)) {
                            if (typeof value === "string") {
                                lines.push(`  ${key}: "${value}",`);
                            } else if (typeof value === "boolean") {
                                lines.push(`  ${key}: ${value},`);
                            } else if (typeof value === "number") {
                                lines.push(`  ${key}: ${value},`);
                            } else {
                                lines.push(`  ${key}: ${JSON.stringify(value)},`);
                            }
                        }
                    }
                    lines.push("})");
                } else {
                    lines.push(`@${decorator.name}({})`);
                }
            } else {
                // Handle type decorators (Text, Choice, etc.) with their arguments
                if (decorator.arguments && decorator.arguments.length > 0) {
                    const args = decorator.arguments[0];
                    if (typeof args === "object" && args !== null && Object.keys(args).length > 0) {
                        lines.push(`@${decorator.name}({`);
                        for (const [key, value] of Object.entries(args)) {
                            if (typeof value === "string") {
                                lines.push(`  ${key}: "${value}",`);
                            } else if (typeof value === "boolean") {
                                lines.push(`  ${key}: ${value},`);
                            } else if (typeof value === "number") {
                                lines.push(`  ${key}: ${value},`);
                            } else if (Array.isArray(value)) {
                                lines.push(`  ${key}: ${JSON.stringify(value)},`);
                            } else {
                                lines.push(`  ${key}: ${JSON.stringify(value)},`);
                            }
                        }
                        lines.push("})");
                    } else {
                        lines.push(`@${decorator.name}()`);
                    }
                } else {
                    lines.push(`@${decorator.name}()`);
                }
            }
        }

        // Add property declaration using the original type
        lines.push(`${property.name}!: ${property.type};`);

        return lines.join("\n");
    }

    /**
     * Extracts the dataSource from a model using the cache.
     */
    private extractDataSourceFromModel(model: DecoratedClass, cache: MetadataCache): string | undefined {
        const modelDecorator = model.decorators.find((d) => d.name === "Model");
        return modelDecorator?.arguments?.[0]?.dataSource;
    }

    /**
     * Adds a reference field to the source model.
     */
    private async addReferenceFieldToSourceModel(
        edit: vscode.WorkspaceEdit,
        sourceModel: DecoratedClass,
        referenceFieldName: string,
        targetModelName: string,
        cache: MetadataCache
    ): Promise<void> {
        // Check if reference field already exists
        const existingFields = Object.keys(sourceModel.properties || {});
        if (existingFields.includes(referenceFieldName)) {
            throw new Error(`Field '${referenceFieldName}' already exists in model ${sourceModel.name}`);
        }

        const document = await vscode.workspace.openTextDocument(sourceModel.declaration.uri);

        // Generate the reference field code
        const fieldCode = this.generateReferenceFieldCode(referenceFieldName, targetModelName);

        // Add required imports
        const requiredImports = new Set(["Field", "Reference"]);
        await this.sourceCodeService.ensureSlingrFrameworkImports(document, edit, requiredImports);

        // Find class boundaries and add field
        const lines = document.getText().split("\n");
        const { classEndLine } = this.sourceCodeService.findClassBoundaries(lines, sourceModel.name);

        edit.insert(sourceModel.declaration.uri, new vscode.Position(classEndLine, 0), `\n${fieldCode}\n`);
    }

    /**
     * Generates the reference field code.
     */
    private generateReferenceFieldCode(fieldName: string, targetModelName: string): string {
        const lines: string[] = [];

        // Add Field decorator
        lines.push("  @Field({})");

        // Add Reference decorator
        lines.push("  @Reference()");

        // Add property declaration
        lines.push(`  ${fieldName}!: ${targetModelName};`);

        return lines.join("\n");
    }


}
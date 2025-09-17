// src/commands/fields/extractFieldsToEmbedded.ts
import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";

export class ExtractFieldsToEmbeddedTool {
    private userInputService: UserInputService;
    private projectAnalysisService: ProjectAnalysisService;
    private sourceCodeService: SourceCodeService;
    private deleteFieldTool: DeleteFieldTool;

    constructor() {
        this.userInputService = new UserInputService();
        this.projectAnalysisService = new ProjectAnalysisService();
        this.sourceCodeService = new SourceCodeService();
        this.deleteFieldTool = new DeleteFieldTool();
    }

    public async extractFieldsToEmbedded(cache: MetadataCache, editor: vscode.TextEditor, modelName:string): Promise<void> {
        try {
            const { document, selections } = editor;
            const sourceModel = cache.getModelByName(modelName);
            if (!sourceModel) {
                throw new Error("Could not find a model class in the current file.");
            }

            const selectedFields = this.getSelectedFields(sourceModel, selections);
            if (selectedFields.length === 0) {
                vscode.window.showInformationMessage("No fields selected.");
                return;
            }

            const newModelName = await this.userInputService.showPrompt("Enter the name for the new embedded model:");
            if (!newModelName) return;

            // Create the new embedded model with the selected fields
            const newModelContent = this.generateEmbeddedModelContent(newModelName, selectedFields);
            await this.sourceCodeService.insertModel(document, newModelContent, sourceModel.name);

            // Remove the fields from the source model
            for (const field of selectedFields) {
                const deleteEdit = await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache);
                await vscode.workspace.applyEdit(deleteEdit);
            }
            
            // Add the embedded field
            const embeddedFieldInfo: FieldInfo = {
                name: this.toCamelCase(newModelName),
                type: { decorator: 'Embedded', label: 'Embedded', tsType: newModelName, description: 'Embedded Model' },
                required: false
            };
            // This will require a new decorator and logic in AddFieldTool, for now, we'll add it manually
            const fieldCode = `@Field()\n    @Embedded()\n    ${embeddedFieldInfo.name}!: ${newModelName};`;
            await this.sourceCodeService.insertField(document, sourceModel.name, embeddedFieldInfo, fieldCode, cache, false);

            vscode.window.showInformationMessage(`Fields extracted to new embedded model '${newModelName}'.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to extract fields to embedded model: ${error}`);
        }
    }

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

    private generateEmbeddedModelContent(modelName: string, fields: PropertyMetadata[]): string {
        let content = `\n@Model()\nclass ${modelName} {\n`;
        for (const field of fields) {
            for(const decorator of field.decorators) {
                content += `    @${decorator.name}(${this.formatDecoratorArgs(decorator.arguments)})\n`;
            }
            content += `    ${field.name}!: ${field.type};\n\n`;
        }
        content += '}\n';
        return content;
    }

    private formatDecoratorArgs(args: any[]): string {
        if (!args || args.length === 0) {
            return '';
        }
        return JSON.stringify(args[0]).replace(/"/g, "'");
    }

    private toCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
}
// src/commands/fields/extractFieldsToReference.ts
import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { FileSystemService } from "../../services/fileSystemService";
import { NewModelTool } from "../models/newModel";
import { AddFieldTool } from "./addField";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import { FieldInfo, FIELD_TYPE_OPTIONS } from "../interfaces";
import * as path from 'path';

export class ExtractFieldsToReferenceTool {
    private userInputService: UserInputService;
    private projectAnalysisService: ProjectAnalysisService;
    private sourceCodeService: SourceCodeService;
    private fileSystemService: FileSystemService;
    private newModelTool: NewModelTool;
    private addFieldTool: AddFieldTool;
    private deleteFieldTool: DeleteFieldTool;

    constructor() {
        this.userInputService = new UserInputService();
        this.projectAnalysisService = new ProjectAnalysisService();
        this.sourceCodeService = new SourceCodeService();
        this.fileSystemService = new FileSystemService();
        this.newModelTool = new NewModelTool();
        this.addFieldTool = new AddFieldTool();
        this.deleteFieldTool = new DeleteFieldTool();
    }

    public async extractFieldsToReference(cache: MetadataCache, editor: vscode.TextEditor, modelName:string): Promise<void> {
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

            const newModelName = await this.userInputService.showPrompt("Enter the name for the new model:");
            if (!newModelName) return;

            const referenceFieldName = await this.userInputService.showPrompt("Enter the name for the new reference field:");
            if (!referenceFieldName) return;

            const targetFilePath = path.join(path.dirname(document.uri.fsPath), `${newModelName}.ts`);

            // Create the new model with the extracted fields
            const newModelUri = await this.newModelTool.createModelProgrammatically(newModelName, targetFilePath, `Represents a reference model with fields from ${sourceModel.name}.`);
            for (const field of selectedFields) {
                const fieldInfo = this.propertyMetadataToFieldInfo(field);
                await this.addFieldTool.addFieldProgrammatically(newModelUri, fieldInfo, modelName, cache, true);
            }

            // Remove the fields from the source model
            for (const field of selectedFields) {
                const deleteEdit = await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache);
                await vscode.workspace.applyEdit(deleteEdit);
            }

            // Add the reference relationship to the source model
            const referenceFieldInfo: FieldInfo = {
                name: referenceFieldName,
                type: FIELD_TYPE_OPTIONS.find(o => o.decorator === "Relationship")!,
                required: false,
                additionalConfig: {
                    targetModel: newModelName,
                    relationshipType: 'reference'
                }
            };
            await this.addFieldTool.addFieldProgrammatically(document.uri, referenceFieldInfo,modelName, cache);

            vscode.window.showInformationMessage(`Fields extracted to new reference model '${newModelName}'.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to extract fields to reference: ${error}`);
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

    private propertyMetadataToFieldInfo(property: PropertyMetadata): FieldInfo {
        const fieldType = FIELD_TYPE_OPTIONS.find(o => o.decorator === this.getDecoratorName(property.decorators)) || FIELD_TYPE_OPTIONS[0];
        const fieldDecorator = property.decorators.find(d => d.name === 'Field');
        const isRequired = fieldDecorator?.arguments.some((arg: any) => arg.required === true) || false;

        return {
            name: property.name,
            type: fieldType,
            required: isRequired
        };
    }
    
    private getDecoratorName(decorators: any[]): string {
        const typeDecorator = decorators.find(d => FIELD_TYPE_OPTIONS.some(o => o.decorator === d.name));
        return typeDecorator ? typeDecorator.name : 'Text';
    }
}
// src/commands/fields/extractFieldsToParent.ts
import * as vscode from "vscode";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
import { UserInputService } from "../../services/userInputService";
import { ProjectAnalysisService } from "../../services/projectAnalysisService";
import { SourceCodeService } from "../../services/sourceCodeService";
import { DeleteFieldTool } from "../../refactor/tools/deleteField";
import * as path from 'path';

export class ExtractFieldsToParentTool {
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

    public async extractFieldsToParent(cache: MetadataCache, editor: vscode.TextEditor, modelName:string): Promise<void> {
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

            const newModelName = await this.userInputService.showPrompt("Enter the name for the new abstract parent model:");
            if (!newModelName) return;

            // Create the new parent model
            const newModelContent = this.generateParentModelContent(newModelName, selectedFields);
            const targetFilePath = path.join(path.dirname(document.uri.fsPath), `${newModelName}.ts`);
            const newModelUri = vscode.Uri.file(targetFilePath);
            await vscode.workspace.fs.writeFile(newModelUri, Buffer.from(newModelContent, 'utf8'));

            // Remove the fields from the source model
            for (const field of selectedFields) {
                const deleteEdit = await this.deleteFieldTool.deleteFieldProgrammatically(field, sourceModel.name, cache);
                await vscode.workspace.applyEdit(deleteEdit);
            }

            // Update the source model to extend the new parent model
            await this.updateSourceModelToExtend(document, sourceModel.name, newModelName);
            
            vscode.window.showInformationMessage(`Fields extracted to new parent model '${newModelName}'.`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to extract fields to parent model: ${error}`);
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

    private generateParentModelContent(modelName: string, fields: PropertyMetadata[]): string {
        let content = `import { BaseModel, Field, Text, Model } from 'slingr-framework';\n\n`; // Add necessary imports
        content += `@Model()\nexport abstract class ${modelName} extends BaseModel {\n`;
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

    private async updateSourceModelToExtend(document: vscode.TextDocument, sourceModelName: string, newParentName: string) {
        const edit = new vscode.WorkspaceEdit();
        const text = document.getText();
        const regex = new RegExp(`(class ${sourceModelName} extends) (\\w+)`);
        const match = text.match(regex);

        if (match) {
            const index = match.index || 0;
            const startPos = document.positionAt(index + match[1].length + 1);
            const endPos = document.positionAt(index + match[1].length + 1 + match[2].length);
            edit.replace(document.uri, new vscode.Range(startPos, endPos), newParentName);

            // Add import for the new parent model
            const importStatement = `\nimport { ${newParentName} } from './${newParentName}';`;
            const firstLine = document.lineAt(0);
            edit.insert(document.uri, firstLine.range.start, importStatement);

            await vscode.workspace.applyEdit(edit);
        }
    }
}
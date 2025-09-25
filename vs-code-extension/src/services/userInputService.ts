import * as vscode from 'vscode';
import { FIELD_TYPE_OPTIONS, FieldTypeDefinition, FieldInfo } from '../utils/fieldTypeRegistry';
import { MetadataCache, DecoratedClass } from '../cache/cache';

export class UserInputService {

    public async getModelName(existingModels: string[]): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt: "Enter the name of the new model (PascalCase)",
            placeHolder: "e.g., Task, User, Project",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "Model name is required";
                }
                if (!/^[A-Z][a-zA-Z0-9]*$/.test(value.trim())) {
                    return "Model name must be in PascalCase (e.g., Task, UserProfile)";
                }
                if (existingModels.includes(value.trim())) {
                    return `A model named '${value.trim()}' already exists.`;
                }
                return null;
            },
        });
    }

    public async getFieldInfo(modelClass: DecoratedClass, cache?: MetadataCache): Promise<FieldInfo | null> {
        const fieldName = await this.getFieldName(modelClass);
        if (!fieldName) return null;

        const fieldType = await this.selectFieldType();
        if (!fieldType) return null;

        const isRequired = await this.getRequiredStatus();
        if (isRequired === undefined) return null;

        let additionalConfig: Record<string, any> = {};
        if (fieldType.decorator === 'Relationship') {
            const relationshipConfig = await this.getRelationshipConfiguration(cache);
            if (!relationshipConfig) return null;
            additionalConfig = relationshipConfig;
        }

        return { name: fieldName, type: fieldType, required: isRequired, additionalConfig };
    }

    public async getConfirmation(prompt: string, ...actions: string[]): Promise<string | undefined> {
        return await vscode.window.showWarningMessage(prompt, ...actions);
    }

    public async showPrompt(prompt: string, placeHolder?: string): Promise<string | undefined> {
        return await vscode.window.showInputBox({ prompt, placeHolder });
    }

    private async getFieldName(modelClass: DecoratedClass): Promise<string | undefined> {
        const existingFields = Object.keys(modelClass.properties || {});
        return await vscode.window.showInputBox({
            prompt: "Enter the field name (camelCase)",
            placeHolder: "e.g., userName, projectTitle",
            validateInput: (value) => {
                if (!value || !/^[a-z][a-zA-Z0-9]*$/.test(value.trim())) {
                    return "Field name must be in camelCase.";
                }
                if (existingFields.includes(value.trim())) {
                    return `Field '${value.trim()}' already exists in this model.`;
                }
                return null;
            }
        });
    }

    private async selectFieldType(): Promise<FieldTypeDefinition | undefined> {
        const items = FIELD_TYPE_OPTIONS.map(option => ({
            label: option.label,
            description: option.description,
            detail: `@${option.decorator}() : ${option.tsType}`,
            option
        }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: "Select the field type" });
        return selected?.option;
    }

    private async getRequiredStatus(): Promise<boolean | undefined> {
        const choice = await vscode.window.showQuickPick(
            [
                { label: "Required", description: "Field must have a value", value: true },
                { label: "Optional", description: "Field can be empty", value: false }
            ],
            { placeHolder: "Is this field required?" }
        );
        return choice?.value;
    }

    private async getRelationshipConfiguration(cache?: MetadataCache): Promise<Record<string, any> | null> {
        if (!cache) return null;
        const availableModels = cache.getDataModelClasses().map(m => m.name).sort();
        if (availableModels.length === 0) {
            vscode.window.showWarningMessage('No other models found for relationship.');
            return { targetModel: 'any', relationshipType: 'reference' };
        }

        const targetModel = await vscode.window.showQuickPick(availableModels, { placeHolder: "Select the target model" });
        if (!targetModel) return null;

        const relationshipType = await vscode.window.showQuickPick(
            ["reference", "composition"],
            { placeHolder: "Select the relationship type" }
        );
        if (!relationshipType) return null;

        return { targetModel, relationshipType };
    }
}
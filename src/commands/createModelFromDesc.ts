import * as vscode from 'vscode';
import * as path from 'path';
import { MetadataCache } from '../cache/cache';

export class CreateModelFromDescriptionTool {

    public async createModel(cache: MetadataCache): Promise<void> {
        const userInput = await vscode.window.showInputBox({
            prompt: "Describe the model you want to create",
            placeHolder: "e.g., A model to store customer information including name, email, and phone number."
        });

        if (!userInput) {
            return;
        }

        const appDescriptionPath = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'docs', 'app-description.md');
        let appDescription = 'No application description found.';
        try {
            const appDescriptionContent = await vscode.workspace.fs.readFile(vscode.Uri.file(appDescriptionPath));
            appDescription = appDescriptionContent.toString();
        } catch (error) {
            console.warn('Could not read app-description.md');
        }

        const prompt = this.generatePrompt(userInput, appDescription);

        await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
    }

    private generatePrompt(userInput: string, appDescription: string): string {
        return `
You are an expert in the Slingr framework. Your task is to create a new data model based on the user's request and the application's description.

**User Request:**
"${userInput}"

**Application Description:**
"${appDescription}"

**Instructions:**
1.  **Framework Usage:** You MUST use the Slingr framework. All models MUST extend \`BaseModel\` and use the \`@Model()\` and \`@Field()\` decorators.
2.  **File Location:** The new model file should be placed in the \`/src/data\` directory. The filename should be the camelCase version of the model name (e.g., \`userProfile.ts\` for a \`UserProfile\` model).
3.  **Model Naming:** The class name for the model should be in PascalCase.
4.  **Field Types:** Use appropriate field types and decorators from the Slingr framework (e.g., \`@Text\`, \`@Email\`, \`@Integer\`, \`@Relationship\`).
5.  **Relationships:** If the model references other existing models, make sure to import them and use the \`@Relationship\` decorator correctly.
6.  **Code Only:** Provide only the TypeScript code for the new model file. Do not include any explanations or markdown formatting.

**Example of a good response:**
\`\`\`typescript
import { Model, Field, Text, Email } from 'slingr-framework';
import { BaseModel } from 'slingr-framework';

@Model()
export class Customer extends BaseModel {
    @Field({ required: true })
    @Text({ maxLength: 50 })
    name: string;

    @Field({ required: true })
    @Email()
    email: string;

    @Field()
    @Text()
    phoneNumber: string;
}
\`\`\`
`;
    }
}
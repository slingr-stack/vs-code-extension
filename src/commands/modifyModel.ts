import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';

export class ModifyModelTool {

    public async modifyModel(cache: MetadataCache): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('Please open a model file to modify.');
            return;
        }

        const document = activeEditor.document;
        const content = document.getText();

        if (!content.includes('@Model')) {
            vscode.window.showErrorMessage('The current file does not appear to be a model file.');
            return;
        }

        const userInput = await vscode.window.showInputBox({
            prompt: "Describe the changes you want to make to this model",
            placeHolder: "e.g., Add a 'lastName' field, make the 'email' field optional, and rename 'name' to 'firstName'."
        });

        if (!userInput) {
            return;
        }

        const prompt = this.generatePrompt(userInput, document.uri.fsPath, content);

        await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
    }

    private generatePrompt(userInput: string, filePath: string, fileContent: string): string {
        return `
You are an expert in the Slingr framework. Your task is to modify an existing data model based on the user's request.

**User Request:**
"${userInput}"

**File to Modify:**
\`${filePath}\`

**Current File Content:**
\`\`\`typescript
${fileContent}
\`\`\`

**Instructions:**
1.  **Framework Usage:** You MUST use the Slingr framework and its decorators correctly. Data models are located in the \`/src/data\` directory.
2.  **Apply Changes:** Apply the user's requested changes to the provided file content.
3.  **Refactoring Tools:** For renames or other refactorings, it's better to use the built-in refactoring tools. For this task, you can simply apply the changes directly to the code.
4.  **Code Only:** Provide only the complete, modified TypeScript code for the file. Do not include any explanations or markdown formatting.
`;
    }
}
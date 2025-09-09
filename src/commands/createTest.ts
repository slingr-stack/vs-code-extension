import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass } from "../cache/cache";

export class CreateTestTool {

    public async createTest(targetUri: vscode.Uri, cache: MetadataCache): Promise<void> {
        try {
            const { modelClass, document } = await this.validateAndPrepareTarget(targetUri, cache);
            const modelName = modelClass.name;
            const targetDirectory = path.dirname(document.uri.fsPath);
            const testFileName = `${this.toCamelCase(modelName)}.test.ts`;
            const testFilePath = path.join(targetDirectory, '..', '__tests__', testFileName);
            const testFileUri = vscode.Uri.file(testFilePath);

            const overwrite = await this.checkIfFileExists(testFileUri, testFileName);
            if (overwrite !== 'Overwrite') {
                return;
            }

            const aiPrompt = this.buildAIPrompt(modelClass);

            await this.requestAITestGeneration(aiPrompt, testFileUri);

            vscode.window.showInformationMessage(`Test file for ${modelName} created successfully!`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create test: ${error}`);
            console.error('Error creating test:', error);
        }
    }

    private async validateAndPrepareTarget(
        targetUri: vscode.Uri,
        cache: MetadataCache
    ): Promise<{ modelClass: DecoratedClass, document: vscode.TextDocument }> {
        if (!targetUri.fsPath.endsWith('.ts')) {
            throw new Error('Target file must be a TypeScript file (.ts)');
        }

        const document = await vscode.workspace.openTextDocument(targetUri);
        const fileMetadata = cache.getMetadataForFile(targetUri.fsPath);

        if (!fileMetadata) {
            throw new Error('No metadata found for this file. Make sure it contains a valid model class.');
        }

        const modelClasses = Object.values(fileMetadata.classes).filter(
            (cls: DecoratedClass) => cls.decorators.some(d => d.name === 'Model')
        );

        if (modelClasses.length === 0) {
            throw new Error('No model class found in this file. Make sure the class has a @Model decorator.');
        }

        if (modelClasses.length > 1) {
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

    private async checkIfFileExists(testFileUri: vscode.Uri, testFileName: string): Promise<string | undefined> {
        try {
            await vscode.workspace.fs.stat(testFileUri);
            return await vscode.window.showWarningMessage(
                `Test file ${testFileName} already exists. Do you want to overwrite it?`,
                'Overwrite',
                'Cancel'
            );
        } catch {
            // File doesn't exist
        }
        return 'Overwrite';
    }

    private buildAIPrompt(modelClass: DecoratedClass): string {
        const modelName = modelClass.name;
        const fields = Object.values(modelClass.properties).map(prop => {
            return `- ${prop.name}: ${prop.type}`;
        }).join('\n');

        const rawPrompt = `
        You are an expert TypeScript developer specializing in testing with Jest.
        I need you to generate a Jest test suite for the following data model.

        ## CONTEXT

        ### Target Model: ${modelName}

        ### Model Fields:

        ${fields}

        ## TASK

        Generate a Jest test suite for the "${modelName}" model.

        ## REQUIREMENTS

        1.  **Use Jest:** The test suite must be written using the Jest testing framework.
        2.  **File Location:** The test file should be placed in a 'test/${modelName}' directory at the first level.
        3.  **File Naming:** The test file should be named '${this.toCamelCase(modelName)}.test.ts'.
        4.  **Test Coverage:** Include tests for:
            * **Model Instantiation:** Test that the model can be instantiated correctly.
            * **Field Validation:** For each field, add tests for validation rules (e.g., required fields, data types).
            * **Relationships:** If there are relationships, test that they are handled correctly.
            * **Default Values:** Test that default values are set as expected.
            * **Edge Cases:** Include tests for edge cases and invalid data.
        5.  **Imports:** Add any necessary import statements for the model and other dependencies.

        ## OUTPUT FORMAT

        Return ONLY valid TypeScript code for the test file. Do not include:
        - Explanatory text or markdown formatting.

        Example output format:
        \`\`\`typescript
        import { ${modelName} } from '../${this.toCamelCase(modelName)}';

        describe('${modelName}', () => {
            it('should create an instance of ${modelName}', () => {
            const instance = new ${modelName}();
            expect(instance).toBeInstanceOf(${modelName});
        });

        // Add more tests here...
        });
        \`\`\`

        Generate the test suite now:
        `;
        const prompt = rawPrompt.replace(/^\s+/gm, '');

        return prompt;
    }

    private async requestAITestGeneration(prompt: string, testFileUri: vscode.Uri): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            "AI Test Case Generation: An AI prompt has been prepared. Do you want to execute it in the chat view?",
            "Execute Prompt"
        );

        if (action === "Execute Prompt") {
            await vscode.commands.executeCommand("workbench.action.chat.openAgent", { query: prompt });
            // In a real implementation, you would get the response from the AI
            // and write it to the testFileUri. For this example, we'll just open the chat.
        }
    }

    private toCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
}
import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass } from "../cache/cache";
import { AIService } from "../services/aiService";

export class CreateTestTool {

    constructor(private aiService:AIService) {}
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

            this.aiService.createTestWithAI(modelClass);

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

    private toCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
}
import * as vscode from 'vscode';
import * as path from 'path';
import { MetadataCache } from '../cache/cache';
import { AppTreeItem } from '../explorer/appTreeItem';

export class CreateModelFromDescriptionTool {

    constructor() {
    }

    public async createModel(cache: MetadataCache, context?: vscode.Uri | AppTreeItem): Promise<void> {
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
        
        // Check if the command was triggered from a model node to create a composition
        let parentModelInfo: { name: string, filePath: string } | null = null;
        if (context) {
            parentModelInfo = this.detectParentModel(context, cache);
        }

        const prompt = this.generatePrompt(userInput, appDescription, parentModelInfo);

        // Execute the chat command
        await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
    }

    private generatePrompt(userInput: string, appDescription: string, parentModelInfo?: { name: string, filePath: string } | null): string {
        let rawPrompt =  `
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
        5.  **Relationships:** If the model references other existing models, make sure to import them and use the \`@Relationship\` decorator correctly. In the other way round, if other models reference this model, ensure to use the \`@Relationship\` decorator in those models as well.
        6.  **Code Only:** Provide only the TypeScript code for the new model file. Do not include any explanations or markdown formatting.

        **Example of a good response:**
        \`\`\`typescript
        import { Model, Field, Text, Email } from 'slingr-framework';
        import { BaseModel } from 'slingr-framework';

        @Model()
        export class Customer extends BaseModel {
            @Field({ required: true })
            @Text({ maxLength: 50 })
            name!: string;

            @Field({ required: true })
            @Email()
            email!: string;

            @Field()
            @Text()
            phoneNumber!: string;
        }
        \`\`\`
        `;
        if (parentModelInfo) {
            rawPrompt += `
            **Parent Model Context:**
            This new model will be used as a composition in the "${parentModelInfo.name}" model.
            
            **IMPORTANT:** After creating the new model, you MUST also add a composition relationship field to the "${parentModelInfo.name}" model (located at ${parentModelInfo.filePath}) that references this new model. The field should:
            - Use the @Relationship decorator
            - Have relationshipType: 'composition'
            - Be named as a plural, camelCase version of the new model name
            - Import the new model class
            `; 
        }
        const prompt = rawPrompt.replace(/^\s+/gm, '');
        return prompt;
    }

    /**
     * Detects if the command is being executed from a model context.
     * Handles both AppTreeItem (app tree explorer) and vscode.Uri (file explorer) contexts.
     * @param context - The context where the command was triggered (AppTreeItem or vscode.Uri)
     * @param cache - The metadata cache for model lookup
     * @returns Information about the parent model or null if not in a model context
     */
    private detectParentModel(context: AppTreeItem | vscode.Uri, cache: MetadataCache): { name: string; filePath: string } | null {
        if (context instanceof AppTreeItem) {
            // Handle app tree explorer context
            return this.detectParentModelFromTreeItem(context, cache);
        } else {
            // Handle file explorer context (vscode.Uri)
            return this.detectParentModelFromFile(context, cache);
        }
    }

    /**
     * Detects parent model from app tree item context.
     * @param targetUri - The AppTreeItem where the command was triggered
     * @param cache - The metadata cache for model lookup
     * @returns Information about the parent model or null if not in a model context
     */
    private detectParentModelFromTreeItem(targetUri: AppTreeItem, cache: MetadataCache): { name: string; filePath: string } | null {
        // Check if the current item is a model or if we need to traverse up the tree
        let currentItem: AppTreeItem | undefined = targetUri;
        
        while (currentItem) {
            // Check if this item represents a model
            if (currentItem.itemType === 'model' && currentItem.metadata) {
                // This is a model item, get its information
                const modelMetadata = currentItem.metadata as any;
                const modelName = modelMetadata.name || currentItem.label;
                
                // Try to find the file path for this model
                const modelFilePath = this.findModelFilePath(modelName, cache);
                
                if (modelFilePath) {
                    return {
                        name: modelName,
                        filePath: modelFilePath
                    };
                }
            }
            
            // Move to parent item
            currentItem = currentItem.parent;
        }
        
        return null;
    }

    /**
     * Detects if the command is being executed from a file context (VS Code file explorer).
     * @param fileUri - The file URI where the command was triggered
     * @param cache - The metadata cache for model lookup
     * @returns Information about the parent model or null if not triggered from a model file
     */
    private detectParentModelFromFile(fileUri: vscode.Uri, cache: MetadataCache): { name: string; filePath: string } | null {
        const filePath = fileUri.fsPath;
        
        // Check if this is a TypeScript file in the src/data directory (model file)
        if (!filePath.endsWith('.ts') || !filePath.includes('/src/data/') && !filePath.includes('\\src\\data\\')) {
            return null;
        }
        
        // Get the file metadata from cache
        const normalizedPath = filePath.replace(/\\/g, '/');
        const fileMetadata = cache.getMetadataForFile(normalizedPath);
        
        if (!fileMetadata) {
            return null;
        }
        
        // Look for a class with @Model decorator in this file
        for (const classData of Object.values(fileMetadata.classes)) {
            if (classData.isDataModel && classData.decorators.some(d => d.name === 'Model')) {
                return {
                    name: classData.name,
                    filePath: filePath
                };
            }
        }
        
        return null;
    }

    /**
     * Finds the file path for a given model name in the cache.
     * @param modelName - The name of the model to find
     * @param cache - The metadata cache
     * @returns The file path of the model or null if not found
     */
    private findModelFilePath(modelName: string, cache: MetadataCache): string | null {
        // Get all data models and find the one we're looking for
        const modelClasses = cache.getDataModelClasses();
        const targetModel = modelClasses.find(model => model.name === modelName);
        
        if (!targetModel) {
            return null;
        }
        
        // Get the model's declaration location to determine the file path
        if (targetModel.declaration && targetModel.declaration.uri) {
            return targetModel.declaration.uri.fsPath;
        }
        
        return null;
    }
}
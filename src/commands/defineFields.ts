import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../cache/cache";
import { fieldTypeConfig } from "../utils/fieldTypes";

/**
 * Tool for defining fields using AI assistance.
 * 
 * This tool analyzes field descriptions provided by users and generates appropriate
 * field definitions with proper decorators based on the application context, existing
 * models, and field patterns. It integrates with VS Code's language services to provide
 * intelligent field generation.
 * 
 */
export class DefineFieldsTool {
    
    /**
     * Processes field descriptions and generates field definitions with AI assistance.
     * 
     * @param fieldsDescription - Free text description of fields to be created
     * @param targetModelUri - URI of the model file where fields will be added
     * @param cache - Metadata cache for context about existing models and fields
     * @param modelName - Name of the target model class
     * @returns Promise that resolves when fields are processed and added
     */
    public async processFieldDescriptions(
        fieldsDescription: string,
        targetModelUri: vscode.Uri,
        cache: MetadataCache,
        modelName: string
    ): Promise<void> {
        try {
            // Step 1: Gather application context
            const appContext = await this.gatherApplicationContext(cache, targetModelUri);
            
            // Step 2: Analyze existing model context
            const modelContext = await this.analyzeModelContext(targetModelUri, modelName, cache);
            
            // Step 3: Build AI prompt with context
            const aiPrompt = this.buildAIPrompt(fieldsDescription, appContext, modelContext);
            
            // Step 4: Request AI field generation
            await this.requestAIFieldGeneration(aiPrompt);
            
            
            vscode.window.showInformationMessage(`Fields successfully generated for ${modelName}!`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process field descriptions: ${error}`);
            console.error('Error processing field descriptions:', error);
        }
    }

    /**
     * Gathers comprehensive application context including existing models, 
     * common field patterns, and project structure.
     */
    private async gatherApplicationContext(cache: MetadataCache, targetUri: vscode.Uri): Promise<ApplicationContext> {
        const context: ApplicationContext = {
            existingModels: [],
            commonFieldPatterns: new Map(),
            availableFieldTypes: Object.keys(fieldTypeConfig),
            projectStructure: await this.analyzeProjectStructure(),
            relationshipTargets: []
        };

        // Get all data models (models with @Model decorator)
        const dataModels = cache.getDataModelClasses();
        
        for (const model of dataModels) {
            const modelInfo: ModelInfo = {
                name: model.name,
                fields: [],
                filePath: model.declaration.uri.fsPath,
                documentation: this.extractModelDocumentation(model)
            };

            // Extract field information
            for (const [fieldName, field] of Object.entries(model.properties)) {
                const fieldInfo: FieldInfo = {
                    name: fieldName,
                    type: (field as PropertyMetadata).type,
                    decorators: (field as PropertyMetadata).decorators.map((d: any) => d.name),
                    documentation: this.extractFieldDocumentation(field as PropertyMetadata)
                };
                modelInfo.fields.push(fieldInfo);
                
                // Track common field patterns
                const pattern = `${fieldInfo.name}:${fieldInfo.type}`;
                const count = context.commonFieldPatterns.get(pattern) || 0;
                context.commonFieldPatterns.set(pattern, count + 1);
            }

            context.existingModels.push(modelInfo);
            context.relationshipTargets.push(model.name);
        }

        return context;
    }

    /**
     * Analyzes the current model context including existing fields and their patterns.
     */
    private async analyzeModelContext(
        modelUri: vscode.Uri, 
        modelName: string, 
        cache: MetadataCache
    ): Promise<ModelContext> {
        const context: ModelContext = {
            modelName,
            existingFields: [],
            filePath: modelUri.fsPath,
            imports: [],
            usedEnums: []
        };

        // Try to get existing model metadata from cache
        const fileMetadata = cache.getMetadataForFile(modelUri.fsPath);
        if (fileMetadata) {
            const modelClass = fileMetadata.classes[modelName];
            if (modelClass) {
                context.existingFields = Object.values(modelClass.properties).map((prop: PropertyMetadata) => ({
                    name: prop.name,
                    type: prop.type,
                    decorators: prop.decorators.map((d: any) => d.name),
                    documentation: this.extractFieldDocumentation(prop)
                }));
            }
        }

        // Analyze current file content for imports and enums
        const document = await vscode.workspace.openTextDocument(modelUri);
        const content = document.getText();
        
        context.imports = this.extractImports(content);
        context.usedEnums = this.extractEnums(content);

        return context;
    }

    /**
     * Builds a comprehensive AI prompt with all necessary context for field generation.
     */
    private buildAIPrompt(
        fieldsDescription: string, 
        appContext: ApplicationContext, 
        modelContext: ModelContext
    ): string {
        const prompt = `
You are an expert TypeScript developer working on a model-driven application. 
I need you to generate TypeScript field definitions based on a description.

## CONTEXT

### Target Model: ${modelContext.modelName}
File: ${modelContext.filePath}

### Existing Fields in This Model:
${modelContext.existingFields.length > 0 
    ? modelContext.existingFields.map(f => `- ${f.name}: ${f.type} (decorators: ${f.decorators.join(', ')})`).join('\n')
    : '- No existing fields'
}

### Available Field Types and Their Usage:
${appContext.availableFieldTypes.map(type => {
    const config = fieldTypeConfig[type];
    const supportedArgs = config.supportedArgs.map(arg => `${arg.name}: ${arg.type}`).join(', ');
    return `- @${type}(): ${config.requiredTsType || 'various'} (args: ${supportedArgs})`;
}).join('\n')}

### Existing Models in Application (for relationships):
${appContext.existingModels.map(m => `- ${m.name} (${m.fields.length} fields)`).join('\n')}

### Common Field Patterns in This Project:
${Array.from(appContext.commonFieldPatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => `- ${pattern} (used ${count} times)`)
    .join('\n')
}

## TASK

Generate TypeScript field definitions for the following description:
"${fieldsDescription}"

## REQUIREMENTS

1. Generate proper TypeScript property declarations with appropriate decorators
2. Use the most suitable decorator type based on the field description
3. Include proper TypeScript types that match the decorator requirements
4. For relationships, reference existing models when possible
5. For enums/choices, create enum definitions and use @Choice decorator
6. Include reasonable default parameters for decorators when appropriate
7. Add brief documentation comments for complex fields
8. Follow the existing code style and patterns from the project
9. Ensure no duplicate field names with existing fields in the model
10. Add any necessary relative import statements for used decorators and types. Imports for types should be from the folder: 'src/framework/shared/types'
11. Before adding a property in a decorator, check if the property is supported by that decorator type'.

## OUTPUT FORMAT

Return ONLY valid TypeScript code that can be inserted into the class body. Do not include:
- Class declaration
- Explanatory text

Example output format:
\`\`\`typescript
@Field({
  required: true
})
@Text()
title: string;

@Field()
@Text()
description: string;

@Field()
@Relationship()
customer: Customer;

@Field()
@Date()
date: Date;

@Field()
@Relationship({
    type: 'composition'
})
project: Project;
\`\`\`

Generate the fields now:
        `;

        return prompt;
    }

    /**
     * Requests AI field generation using VS Code's built-in chat functionality.
     * Shows a notification asking the user if they want to execute the AI prompt in chat.
     */
    private async requestAIFieldGeneration(prompt: string): Promise<string> {
        // TODO: Integrate with actual AI service (GitHub Copilot, OpenAI, etc.)
        const action = await vscode.window.showInformationMessage(
            "AI Field Generation: An AI prompt has been prepared. Do you want to execute it in the chat view?",
            "Execute Prompt"
        );

        if (action === "Execute Prompt") {
            await vscode.commands.executeCommand("workbench.action.chat.open", prompt);
            return "";
        }

        return ""; // User cancelled
    }


    /**
     * Extracts documentation from model decorators.
     */
    private extractModelDocumentation(model: DecoratedClass): string | undefined {
        const modelDecorator = model.decorators.find(d => d.name === 'Model');
        if (modelDecorator?.arguments) {
            const docsArg = modelDecorator.arguments.find(arg => arg.docs);
            return docsArg?.docs;
        }
        return undefined;
    }

    /**
     * Extracts documentation from field decorators.
     */
    private extractFieldDocumentation(field: PropertyMetadata): string | undefined {
        for (const decorator of field.decorators) {
            if (decorator.arguments) {
                const docsArg = decorator.arguments.find((arg: any) => arg.docs);
                if (docsArg) {
                    return docsArg.docs;
                }
            }
        }
        return undefined;
    }

    /**
     * Analyzes project structure to understand patterns and conventions.
     */
    private async analyzeProjectStructure(): Promise<ProjectStructure> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return { dataFolderPath: '', frameworkPath: '', hasCustomTypes: false };
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const dataPath = path.join(rootPath, 'src', 'data');
        const frameworkPath = path.join(rootPath, 'src', 'framework');

        return {
            dataFolderPath: dataPath,
            frameworkPath: frameworkPath,
            hasCustomTypes: await this.checkForCustomTypes(dataPath)
        };
    }

    /**
     * Checks if the project has custom field types or enums.
     */
    private async checkForCustomTypes(dataPath: string): Promise<boolean> {
        try {
            const files = await vscode.workspace.findFiles('src/data/**/*.ts');
            for (const file of files) {
                const document = await vscode.workspace.openTextDocument(file);
                const content = document.getText();
                if (content.includes('export enum ') || content.includes('export type ')) {
                    return true;
                }
            }
        } catch (error) {
            console.warn('Could not analyze custom types:', error);
        }
        return false;
    }

    /**
     * Extracts import statements from file content.
     */
    private extractImports(content: string): string[] {
        const importRegex = /import\s+.*?\s+from\s+['"][^'"]+['"];?/g;
        const matches = content.match(importRegex);
        return matches || [];
    }

    /**
     * Extracts enum definitions from file content.
     */
    private extractEnums(content: string): string[] {
        const enumRegex = /export\s+enum\s+(\w+)/g;
        const enums: string[] = [];
        let match;
        while ((match = enumRegex.exec(content)) !== null) {
            enums.push(match[1]);
        }
        return enums;
    }
}

// Supporting interfaces for context gathering

interface ApplicationContext {
    existingModels: ModelInfo[];
    commonFieldPatterns: Map<string, number>;
    availableFieldTypes: string[];
    projectStructure: ProjectStructure;
    relationshipTargets: string[];
}

interface ModelContext {
    modelName: string;
    existingFields: FieldInfo[];
    filePath: string;
    imports: string[];
    usedEnums: string[];
}

interface ModelInfo {
    name: string;
    fields: FieldInfo[];
    filePath: string;
    documentation?: string;
}

interface FieldInfo {
    name: string;
    type: string;
    decorators: string[];
    documentation?: string;
}

interface ProjectStructure {
    dataFolderPath: string;
    frameworkPath: string;
    hasCustomTypes: boolean;
}
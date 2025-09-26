import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache, DecoratedClass, PropertyMetadata } from "../../cache/cache";
<<<<<<< HEAD
import { FIELD_TYPE_REGISTRY } from "../../utils/fieldTypeRegistry";
=======
import { fieldTypeConfig } from "../../utils/fieldTypes";
>>>>>>> framework/main
import { AIService } from "../../services/aiService";
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

    private aiService: AIService;

    constructor() {
        this.aiService = new AIService();
    }
    
    /**
     * Processes field descriptions and generates field definitions with AI assistance.
     * 
     * @param fieldsDescription - Free text description of fields to be created
     * @param targetModelUri - URI of the model file where fields will be added
     * @param cache - Metadata cache for context about existing models and fields
     * @param modelName - Name of the target model class
<<<<<<< HEAD
     * @param autoExecute - Whether to automatically execute the AI prompt without user confirmation
=======
>>>>>>> framework/main
     * @returns Promise that resolves when fields are processed and added
     */
    public async processFieldDescriptions(
        fieldsDescription: string,
        targetModelUri: vscode.Uri,
        cache: MetadataCache,
<<<<<<< HEAD
        modelName: string,
        autoExecute: boolean = false
=======
        modelName: string
>>>>>>> framework/main
    ): Promise<void> {
        try {
            this.aiService.defineFieldsWithAI(
                fieldsDescription,
                targetModelUri,
                cache,
<<<<<<< HEAD
                modelName,
                autoExecute
=======
                modelName
>>>>>>> framework/main
            );
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to define fields: ${error}`);
            console.error('Error defining fields with AI:', error);
        }

    }

}
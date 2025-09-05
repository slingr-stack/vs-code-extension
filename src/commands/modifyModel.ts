import * as vscode from 'vscode';
import { MetadataCache } from '../cache/cache';
import { AIService } from '../services/aiService';

export class ModifyModelTool {

    constructor(private aiService: AIService) {}

    public async modifyModel(cache: MetadataCache): Promise<void> {
        try{
            await this.aiService.modifyModelWithAI(cache);
        }
        catch (error: any) {
            vscode.window.showErrorMessage(`Failed to modify model: ${error.message}`);
        }
    }
}
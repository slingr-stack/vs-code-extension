import * as vscode from "vscode";
import * as path from "path";
import { MetadataCache } from "../../cache/cache";
import { AppTreeItem } from "../../explorer/appTreeItem";
import { AIService } from "../../services/aiService";

export class CreateModelFromDescriptionTool {
  constructor(private aiService: AIService) {}

  public async createModel(cache: MetadataCache, context?: vscode.Uri | AppTreeItem): Promise<void> {
    try {
      await this.aiService.createModelWithAI(cache, context);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create model from description: ${error.message}`);
    }
  }
}

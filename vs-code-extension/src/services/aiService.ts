import * as vscode from "vscode";
import { MetadataCache, DecoratedClass } from "../cache/cache";
import { FieldInfo } from "../commands/interfaces";
import { AppTreeItem } from "../explorer/appTreeItem";
import { fieldTypeConfig } from "../utils/fieldTypes";
import { ApplicationContext, ModelContext } from "./projectAnalysisService";
import { FileSystemService } from "./fileSystemService";
import { ProjectAnalysisService } from "./projectAnalysisService";

export class AIService {

  private fileSystemService: FileSystemService;
  private projectAnalysisService: ProjectAnalysisService;

  constructor() {
    this.fileSystemService = new FileSystemService();
    this.projectAnalysisService = new ProjectAnalysisService();
  }

  public async createModelWithAI(cache: MetadataCache, context?: vscode.Uri | AppTreeItem): Promise<void> {
    const userInput = await vscode.window.showInputBox({
      prompt: "Describe the model you want to create",
      placeHolder: "e.g., A customer model with name, email, and phone number.",
    });
    if (!userInput) {return;}

    const appDescriptionPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath + "/docs/app-description.md";
    let appDescription = "No application description found.";
    try {
      const appDescriptionContent = await vscode.workspace.fs.readFile(vscode.Uri.file(appDescriptionPath));
      appDescription = appDescriptionContent.toString();
    } catch (error) {
      console.warn("Could not read app-description.md");
    }

    // Check if the command was triggered from a model node to create a composition
    let parentModelInfo: { name: string; filePath: string } | null = null;
    if (context) {
      parentModelInfo = this.detectParentModel(context, cache);
    }

    const prompt = this.generateCreateModelPrompt(userInput, appDescription, parentModelInfo);
    await vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });
  }

  public async modifyModelWithAI(cache: MetadataCache): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("Please open a model file to modify.");
      return;
    }

    const document = activeEditor.document;
    const content = document.getText();

    if (!content.includes("@Model")) {
      vscode.window.showErrorMessage("The current file does not appear to be a model file.");
      return;
    }

    const userInput = await vscode.window.showInputBox({
      prompt: "Describe the changes you want to make to this model",
      placeHolder: "e.g., Add a 'lastName' field, make the 'email' field optional, and rename 'name' to 'firstName'.",
    });

    if (!userInput) {
      return;
    }

    const prompt = this.generateModifyModelPrompt(userInput, document.uri.fsPath, content);
    await vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });
  }

  public async defineFieldsWithAI(
    fieldsDescription: string,
    targetModelUri: vscode.Uri,
    cache: MetadataCache,
    modelName: string
  ): Promise<void> {
    try {
      // Step 1: Gather application context
      const appContext = await this.projectAnalysisService.gatherApplicationContext(cache, targetModelUri);

      // Step 2: Analyze existing model context
      const modelContext = await this.projectAnalysisService.analyzeModelContext(targetModelUri, modelName, cache);

      // Step 3: Build AI prompt with context
      const prompt = this.generateDefineFieldsPrompt(fieldsDescription, appContext, modelContext);

      // Step 4: Request AI field generation
      const action = await vscode.window.showInformationMessage(
        "AI Field Generation: An AI prompt has been prepared. Do you want to execute it in the chat view?",
        "Execute Prompt"
      );

      if (action === "Execute Prompt") {
        await vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });
      }

      vscode.window.showInformationMessage(`Fields successfully generated for ${modelName}!`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to process field descriptions: ${error}`);
      console.error("Error processing field descriptions:", error);
    }
  }

  public async createTestWithAI(modelClass: DecoratedClass): Promise<void> {
    try {
      const prompt = this.generateCreateTestPrompt(modelClass);

      await vscode.commands.executeCommand("workbench.action.chat.open", { query: prompt });

      vscode.window.showInformationMessage(`Test file for ${modelClass.name} created successfully!`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create test: ${error}`);
      console.error("Error creating test:", error);
    }
  }

  // --- Private Prompt Generation Methods ---

  private generateCreateModelPrompt(
    userInput: string,
    appDescription: string,
    parentModelInfo?: { name: string; filePath: string } | null
  ): string {
    let rawPrompt = `
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
    const prompt = rawPrompt.replace(/^\s+/gm, "");
    return prompt;
  }

  private generateModifyModelPrompt(userInput: string, filePath: string, fileContent: string): string {
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

  private generateDefineFieldsPrompt(
    fieldsDescription: string,
    appContext: ApplicationContext,
    modelContext: ModelContext
  ): string {
    const rawPrompt = `
You are an expert TypeScript developer working on a model-driven application. 
I need you to generate TypeScript field definitions based on a description.

## CONTEXT

### Target Model: ${modelContext.modelName}
File: ${modelContext.filePath}

### Existing Fields in This Model:
${
  modelContext.existingFields.length > 0
    ? modelContext.existingFields
        .map((f) => `- ${f.name}: ${f.type} (decorators: ${f.decorators.join(", ")})`)
        .join("\n")
    : "- No existing fields"
}

### Available Field Types and Their Usage:
${appContext.availableFieldTypes
  .map((type) => {
    const config = fieldTypeConfig[type];
    const supportedArgs = config.supportedArgs?.map((arg) => `${arg.name}: ${arg.type}`).join(", ");
    return `- @${type}(): ${config.requiredTsType || "various"} (args: ${supportedArgs || "none"})`;
  })
  .join("\n")}

### Existing Models in Application (for relationships):
${appContext.existingModels.map((m) => `- ${m.name} (${m.fields.length} fields)`).join("\n")}

### Common Field Patterns in This Project:
${Array.from(appContext.commonFieldPatterns.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([pattern, count]) => `- ${pattern} (used ${count} times)`)
  .join("\n")}

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
title!: string;

@Field({})
@Text()
description!: string;

@Field({})
@Relationship()
customer!: Customer;

@Field({})
@Date()
date!: Date;

@Field({})
@Relationship({
    type: 'composition'
})
project!: Project;

@Field({})
@Choice()
status: ProjectStatus = ProjectStatus.Planning;
\`\`\`

Generate the fields now, write in the file: ${modelContext.filePath}.
            `;
    const prompt = rawPrompt.replace(/^\s+/gm, "");

    return prompt;
  }

  private generateCreateTestPrompt(modelClass: DecoratedClass): string {
    const modelName = modelClass.name;
    const fields = Object.values(modelClass.properties)
      .map((prop) => {
        return `- ${prop.name}: ${prop.type}`;
      })
      .join("\n");

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
    const prompt = rawPrompt.replace(/^\s+/gm, "");

    return prompt;
  }

  /**
   * Detects if the command is being executed from a model context.
   * Handles both AppTreeItem (app tree explorer) and vscode.Uri (file explorer) contexts.
   * @param context - The context where the command was triggered (AppTreeItem or vscode.Uri)
   * @param cache - The metadata cache for model lookup
   * @returns Information about the parent model or null if not in a model context
   */
  private detectParentModel(
    context: AppTreeItem | vscode.Uri,
    cache: MetadataCache
  ): { name: string; filePath: string } | null {
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
  private detectParentModelFromTreeItem(
    targetUri: AppTreeItem,
    cache: MetadataCache
  ): { name: string; filePath: string } | null {
    // Check if the current item is a model or if we need to traverse up the tree
    let currentItem: AppTreeItem | undefined = targetUri;

    while (currentItem) {
      // Check if this item represents a model
      if (currentItem.itemType === "model" && currentItem.metadata) {
        // This is a model item, get its information
        const modelMetadata = currentItem.metadata as any;
        const modelName = modelMetadata.name || currentItem.label;

        // Try to find the file path for this model
        const modelFilePath = this.findModelFilePath(modelName, cache);

        if (modelFilePath) {
          return {
            name: modelName,
            filePath: modelFilePath,
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
  private detectParentModelFromFile(
    fileUri: vscode.Uri,
    cache: MetadataCache
  ): { name: string; filePath: string } | null {
    const filePath = fileUri.fsPath;

    // Check if this is a TypeScript file in the src/data directory (model file)
    if (!filePath.endsWith(".ts") || (!filePath.includes("/src/data/") && !filePath.includes("\\src\\data\\"))) {
      return null;
    }

    // Get the file metadata from cache
    const normalizedPath = filePath.replace(/\\/g, "/");
    const fileMetadata = cache.getMetadataForFile(normalizedPath);

    if (!fileMetadata) {
      return null;
    }

    // Look for a class with @Model decorator in this file
    for (const classData of Object.values(fileMetadata.classes)) {
      if (classData.isDataModel && classData.decorators.some((d) => d.name === "Model")) {
        return {
          name: classData.name,
          filePath: filePath,
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
    const targetModel = modelClasses.find((model) => model.name === modelName);

    if (!targetModel) {
      return null;
    }

    // Get the model's declaration location to determine the file path
    if (targetModel.declaration && targetModel.declaration.uri) {
      return targetModel.declaration.uri.fsPath;
    }

    return null;
  }

    public toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
}

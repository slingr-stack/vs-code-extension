import * as vscode from "vscode";
import * as path from "path";
import { AppTreeItem } from "../../explorer/appTreeItem";



/**
 * Tool for creating new Model classes with the @Model decorator and extending BaseModel.
 * 
 * This is a standalone creation tool that doesn't participate in the refactoring system.
 * It provides a simple interface for generating new model files with proper structure.
 * 
 * @example
 * ```typescript
 * // Generated model example:
 * @Model()
 * class Task extends BaseModel {
 *     @Field()
 *     name: string;
 * }
 * ```
 */
export class NewModelTool {
    
    /**
     * Creates a new model file in the specified directory.
     * 
     * @param targetUri - The URI where the new model should be created (file, folder, or AppTreeItem)
     * @returns Promise that resolves when the model is created
     */
    public async createNewModel(targetUri: vscode.Uri | AppTreeItem): Promise<void> {
        let finalTargetUri: vscode.Uri;
        
        // Handle different types of input
        if (targetUri instanceof AppTreeItem) {
            // Handle AppTreeItem case
            if (targetUri.folderPath) {
                // Use the folderPath directly (this now includes dataRoot path)
                finalTargetUri = vscode.Uri.file(targetUri.folderPath);
            } else {
                // Fallback to src/data if folderPath is not available
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found');
                }
                finalTargetUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'src', 'data'));
            }
        } else {
            // Handle vscode.Uri case
            finalTargetUri = targetUri;
            if (path.extname(finalTargetUri.fsPath)) {
                // If it's a file, use its directory
                finalTargetUri = vscode.Uri.file(path.dirname(finalTargetUri.fsPath));
            }
        }
        try {
            // Step 1: Get model name from user
            const modelName = await vscode.window.showInputBox({
                prompt: "Enter the name of the new model (PascalCase)",
                placeHolder: "e.g., Task, User, Project",
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return "Model name is required";
                    }
                    if (!/^[A-Z][a-zA-Z0-9]*$/.test(value.trim())) {
                        return "Model name must be in PascalCase (e.g., Task, UserProfile)";
                    }
                    return null;
                }
            });

            if (!modelName) {
                return; // User cancelled
            }

            // Step 2: Get optional documentation
            const docs = await vscode.window.showInputBox({
                prompt: "Enter optional documentation for the model (press Enter to skip)",
                placeHolder: "e.g., Represents a task in the project management system"
            });

            // Step 3: Get optional fields information
            const fieldsInfo = await vscode.window.showInputBox({
                prompt: "Enter field information (free text, press Enter to skip)",
                placeHolder: "e.g., title (string), description (text), project (relationship to Project), status (enum)"
            });

            // Step 4: Determine target file path
            let targetDirectory = finalTargetUri.fsPath;
            
            // If the context URI is a file, get its directory
            if (path.extname(finalTargetUri.fsPath)) {
                targetDirectory = path.dirname(finalTargetUri.fsPath);
            }
            
            // If we're not in src/data, default to src/data
            if (!targetDirectory.includes('/src/data/')) {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(finalTargetUri);
                if (workspaceFolder) {
                    targetDirectory = path.join(workspaceFolder.uri.fsPath, 'src', 'data');
                }
            }

            // Convert PascalCase to camelCase for filename
            const fileName = this.toCamelCase(modelName) + '.ts';
            const targetFilePath = path.join(targetDirectory, fileName);
            const targetFileUri = vscode.Uri.file(targetFilePath);

            // Step 5: Check if file already exists
            try {
                await vscode.workspace.fs.stat(targetFileUri);
                const overwrite = await vscode.window.showWarningMessage(
                    `File ${fileName} already exists. Do you want to overwrite it?`,
                    { modal: true },
                    'Overwrite',
                    'Cancel'
                );
                if (overwrite !== 'Overwrite') {
                    return;
                }
            } catch {
                // File doesn't exist, which is what we want
            }

            // Step 6: Generate model content
            const modelContent = this.generateModelContent(modelName, docs?.trim() || null, fieldsInfo?.trim() || null, targetDirectory);

            // Step 7: Create the file
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(targetFileUri, encoder.encode(modelContent));

            // Step 8: Open the new file
            const document = await vscode.workspace.openTextDocument(targetFileUri);
            await vscode.window.showTextDocument(document);

            // Step 9: Show success message
            vscode.window.showInformationMessage(`Model ${modelName} created successfully!`);

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create model: ${error}`);
            console.error('Error creating new model:', error);
        }
    }

    /**
     * Generates the TypeScript content for a new model class.
     * 
     * @param modelName - The name of the model class
     * @param docs - Optional documentation string
     * @param fieldsInfo - Optional field information (to be processed later by AI)
     * @param targetDirectory - The directory where the model file will be created
     * @returns The complete TypeScript content for the model file
     */
    private generateModelContent(modelName: string, docs?: string | null, fieldsInfo?: string | null, targetDirectory?: string): string {
        const lines: string[] = [];
        
        // Calculate relative paths dynamically based on target directory
        let relativePathToFramework = '../framework/shared';
        
        if (targetDirectory) {
            // Find the workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const workspacePath = workspaceFolder.uri.fsPath;
                const srcDataPath = path.join(workspacePath, 'src', 'data');
                
                // Calculate how deep we are from src/data
                const relativePath = path.relative(srcDataPath, targetDirectory);
                if (relativePath && relativePath !== '.') {
                    // Count the number of subdirectories
                    const depth = relativePath.split(path.sep).length;
                    // Add extra "../" for each level deep
                    relativePathToFramework = '../'.repeat(depth + 1) + 'framework/shared';
                }
            }
        }
        
        // Add imports with dynamically calculated relative paths
        lines.push(`import { Model } from '${relativePathToFramework}/Model';`);
        lines.push(`import { Field } from '${relativePathToFramework}/Field';`);
        lines.push("import { BaseEntity } from 'typeorm';");
        lines.push("");
        
        // Add documentation comment if provided
        if (docs) {
            lines.push("/**");
            lines.push(` * ${docs}`);
            lines.push(" */");
        }
        
        // Add Model decorator
        if (docs) {
            lines.push(`@Model({ docs: "${docs}" })`);
        } else {
            lines.push("@Model()");
        }
        
        // Add class declaration
        lines.push(`export class ${modelName} extends BaseEntity {`);
        
        // Add fields information as a comment if provided
        if (fieldsInfo) {
            lines.push("");
            lines.push("    // TODO: Process the following field information:");
            lines.push(`    // ${fieldsInfo}`);
            lines.push("    // Use the AI field processor tool to generate proper field definitions");
        }
        
        // Add a sample field as placeholder
        lines.push("");
        lines.push("    @Field()");
        lines.push("    name: string;");
        
        lines.push("}");
        lines.push("");
        
        return lines.join("\n");
    }

    /**
     * Converts PascalCase to camelCase for filename generation.
     * 
     * @param str - PascalCase string
     * @returns camelCase string
     * 
     * @example
     * toCamelCase("UserProfile") // returns "userProfile"
     * toCamelCase("Task") // returns "task"
     */
    private toCamelCase(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
}
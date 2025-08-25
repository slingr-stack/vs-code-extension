import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext } from '../refactorInterfaces';
import { FileMetadata, MetadataCache, PropertyMetadata } from '../../cache/cache';
import { isEntity, isEntityFile, isField } from '../../utils/metadata';
import { fieldTypeConfig } from '../../utils/fieldTypes';

/**
 * A refactoring tool that handles changing field type decorators in entity classes.
 * 
 * This tool can automatically detect when field decorators or TypeScript types change
 * and propose refactorings to keep them consistent. It supports manual refactoring
 * through a Quick Pick menu and can handle special cases like converting primitive
 * types to Choice fields with enum creation.
 * 
 * Supported field types include: Choice, Html, Integer, LongText, Relationship, and Text.
 * 
 * The tool provides two main scenarios:
 * 1. Automatic detection of decorator/type mismatches during file analysis
 * 2. Manual field type changes initiated by user commands
 * 
 * Special handling is provided for Choice fields, where the tool can guide users
 * through creating new enums and updating both the decorator and property type
 * accordingly.
 * @implements @see {@link IRefactorTool}
 */
export class ChangeFieldTypeTool implements IRefactorTool {

    private readonly availableTypes = Object.keys(fieldTypeConfig);

    public getCommandId(): string {
        return 'slingr-vscode-extension.changeFieldType';
    }

    public getTitle(): string {
        return 'Change Field Type';
    }

    public getHandledChangeTypes(): string[] {
        return ['CHANGE_FIELD_TYPE'];
    }

    private getTypeDecoratorName(prop: PropertyMetadata): string | undefined {
        const decorator = prop.decorators.find(d => this.availableTypes.includes(d.name));
        return decorator?.name;
    }

    public async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        if (!context.metadata) {
            return false;
        }
        return (isEntityFile(context.uri) && isField(context.metadata));
    }

    /**
     * Analyzes changes between old and new file metadata to detect field type changes.
     * 
     * This method compares entity classes and their field properties between two versions
     * of a file to identify when field types or decorators have been modified. It handles
     * two main scenarios:
     * 1. Explicit decorator changes by the user
     * 2. TypeScript type changes that suggest a different decorator should be used
     * 
     * The method also accounts for entity and field renames that may have occurred
     * through other refactoring tools by examining accumulated changes.
     * 
     * @param oldFileMeta - The metadata from the previous version of the file
     * @param newFileMeta - The metadata from the current version of the file
     * @param accumulatedChanges - Array of changes from other refactoring tools that may affect entity/field names
     * @returns An array of ChangeObject instances representing detected field type changes
     */
    public analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata, accumulatedChanges: ChangeObject[] = []): ChangeObject[] {
        const changes: ChangeObject[] = [];
        if (!oldFileMeta || !newFileMeta || !isEntityFile(newFileMeta.uri)) {
            return [];
        }

        const classRenames = new Map<string, string>();
        const fieldRenamesByClass = new Map<string, Map<string, string>>();
        // Check for accumulated changes that may affect the analysis
        for (const change of accumulatedChanges) {
            if (change.type === 'RENAME_ENTITY' && change.payload.oldName && change.payload.newName) {
                classRenames.set(change.payload.oldName, change.payload.newName);
            }
            if (change.type === 'RENAME_FIELD' && change.payload.oldName && change.payload.newName) {
                const className = change.payload.entityName;
                if (!className) { continue; }
                if (!fieldRenamesByClass.has(className)) {
                    fieldRenamesByClass.set(className, new Map());
                }
                fieldRenamesByClass.get(className)!.set(change.payload.oldName, change.payload.newName);
            }
        }

        for (const oldClassName in oldFileMeta.classes) {
            const oldClass = oldFileMeta.classes[oldClassName];
            const expectedNewClassName = classRenames.get(oldClassName) || oldClassName;
            const newClass = newFileMeta.classes[expectedNewClassName];
            if (!newClass || !isEntity(newClass) || !isEntity(oldClass)) {
                continue;
            }

            const fieldRenames = fieldRenamesByClass.get(oldClassName) || new Map();
            for (const oldPropName in oldClass.properties) {
                const oldProp = oldClass.properties[oldPropName];
                const expectedNewPropName = fieldRenames.get(oldPropName) || oldPropName;
                const newProp = newClass.properties[expectedNewPropName];

                if (!newProp || !isField(oldProp) || !isField(newProp)) {
                    continue;
                }
                const oldDecoratorName = this.getTypeDecoratorName(oldProp);
                const newDecoratorName = this.getTypeDecoratorName(newProp);
                const oldTsType = oldProp.type;
                const newTsType = newProp.type;

                // Detect if the user explicitly changed the decorator
                if (oldDecoratorName && newDecoratorName && oldDecoratorName !== newDecoratorName) {
                    const oldDecorator = oldProp.decorators.find(d => d.name === oldDecoratorName);
                    changes.push({
                        type: 'CHANGE_FIELD_TYPE',
                        uri: newFileMeta.uri,
                        description: `Decorator for '${newProp.name}' changed to '@${newDecoratorName}'.`,
                        payload: { isManual: false, field: newProp, newType: newDecoratorName, oldDecorator }
                    });
                }
                // Detect if the user changed the TS type, but not the decorator
                else if (oldTsType !== newTsType && oldDecoratorName === newDecoratorName) {
                    const suggestedDecorator = this.getDecoratorForType(newTsType);
                    // Propose a change only if the current decorator is not an appropriate one for the new type
                    if (suggestedDecorator && suggestedDecorator !== newDecoratorName) {
                        const oldDecorator = oldProp.decorators.find(d => d.name === oldDecoratorName);
                        changes.push({
                            type: 'CHANGE_FIELD_TYPE',
                            uri: newFileMeta.uri,
                            description: `Type for '${newProp.name}' changed to '${newTsType}'. Suggest changing decorator to '@${suggestedDecorator}'.`,
                            payload: { isManual: false, field: newProp, newType: suggestedDecorator, oldDecorator }
                        });
                    }
                }
            }
        }
        return changes;
    }

    /**
     * Initiates a manual refactor operation to change the type of a field.
     * 
     * This method validates that the provided context contains a valid field with a type decorator,
     * prompts the user to select a new type from available options, and returns a change object
     * that describes the refactor operation to be performed.
     * 
     * @param context - The manual refactor context containing metadata about the field to be changed
     * @returns A Promise that resolves to a ChangeObject describing the field type change operation,
     *          or undefined if the operation was cancelled or validation failed
     * 
     * @throws Will show error messages via VS Code window if:
     *         - The context doesn't contain valid field metadata
     *         - No valid type decorator is found on the field
     */
    public async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        if (!context.metadata || !('type' in context.metadata) || !isField(context.metadata)) {
            vscode.window.showErrorMessage('Could not find a valid field to change type.');
            return undefined;
        }

        const field = context.metadata as PropertyMetadata;
        const typeDecorator = field.decorators.find(d => this.availableTypes.includes(d.name));
        const fieldDecorator = field.decorators.find(d => d.name === 'Field');
        const targetDecorator = typeDecorator || fieldDecorator;
        if (!targetDecorator) {
            vscode.window.showErrorMessage('Could not find a valid decorator on this field.');
            return;
        }

        const newType = await vscode.window.showQuickPick(this.availableTypes, {
            placeHolder: `Select a new type for '${field.name}'`,
        });
        if (!newType) {
            return undefined;
        }

        return {
            type: 'CHANGE_FIELD_TYPE',
            uri: context.uri,
            description: `Change type of '${field.name}' to '${newType}'.`,
            payload: {
                isManual: true,
                newType: newType,
                field: field,
                decoratorPosition: targetDecorator.position,
                oldDecorator: typeDecorator // Will be undefined if only @Field exists
            }
        };
    }

    /**
     * Prepares a workspace edit for changing a field type in the metadata.
     * 
     * Handles two main scenarios:
     * 1. Converting a primitive type to 'Choice' type, which requires creating an enum
     * 2. All other type changes, which involve updating the decorator string and validating the new type
     * 
     * @param change - The change object containing the new type, field information, and decorator position
     * @param cache - The metadata cache used for constructing decorator strings
     * @returns A promise that resolves to a WorkspaceEdit containing all necessary changes
     */
     public async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const { isManual, newType, field, decoratorPosition, oldDecorator } = change.payload;
        const workspaceEdit = new vscode.WorkspaceEdit();

        let isReplacing = false;
        let positionToActOn: vscode.Range | undefined;

        if (isManual) {
            positionToActOn = decoratorPosition;
            isReplacing = !!oldDecorator;
        } else {
            const typeDecorator = field?.decorators.find((d: any) => this.availableTypes.includes(d.name));
            if (typeDecorator) {
                positionToActOn = typeDecorator.position;
                isReplacing = true;
            } else {
                positionToActOn = field?.decorators.find((d: any) => d.name === 'Field')?.position;
                isReplacing = false;
            }
        }

        if (!newType || !field || !positionToActOn) {
            return workspaceEdit;
        }
        if (newType === 'Choice' && this.isPrimitiveType(field.type)) {
            await this.applyChoiceEnumCreation(workspaceEdit, field, positionToActOn, change.uri);
        } else {
            let oldArgs = new Map<string, any>();
            if (isManual && isReplacing) {
                const document = await vscode.workspace.openTextDocument(change.uri);
                const oldDecoratorText = document.getText(positionToActOn);
                oldArgs = this.parseDecoratorArguments(oldDecoratorText);
            } else if (!isManual && oldDecorator?.arguments) {
                oldArgs = new Map(Object.entries(oldDecorator.arguments));
            }

            const newTypeConfig = fieldTypeConfig[newType];
            const transferredArgs = new Map<string, any>();
            if (newTypeConfig) {
                const newSupportedArgNames = new Set(newTypeConfig.supportedArgs.map(arg => arg.name));
                for (const [key, value] of oldArgs.entries()) {
                    if (newSupportedArgNames.has(key)) { transferredArgs.set(key, value); }
                }
            }

            const decoratorString = newTypeConfig
                ? newTypeConfig.buildDecoratorString(newType, transferredArgs)
                : `@${newType}()`; 

            if (isReplacing) {
                workspaceEdit.replace(change.uri, positionToActOn, decoratorString);
            } else {
                const document = await vscode.workspace.openTextDocument(change.uri);
                const decoratorLine = document.lineAt(positionToActOn.start.line);
                const indentation = decoratorLine.text.substring(0, decoratorLine.firstNonWhitespaceCharacterIndex);
                const textToInsert = `${decoratorString}\n${indentation}`;
                workspaceEdit.insert(change.uri, positionToActOn.start, textToInsert);
            }

            const typeCorrectionEdit = await this.validateAndCorrectType(field, newType, change.uri);
            if (typeCorrectionEdit) {
                workspaceEdit.replace(change.uri, typeCorrectionEdit.range, typeCorrectionEdit.newText);
            }
        }
        return workspaceEdit;
    }

    /**
     * Applies a choice enum creation refactoring by generating a new enum type and updating the field decorator.
     * 
     * This method performs the following operations:
     * 1. Derives an enum name from the field name (capitalizing the first letter)
     * 2. Prompts the user to input comma-separated enum values via an input box
     * 3. Generates and inserts a new enum definition at the end of the file
     * 4. Replaces the existing decorator with a new @Choice decorator that references the enum
     * 5. Updates the property's type from 'string' to the new enum type
     * 
     * @param workspaceEdit - The VS Code workspace edit to accumulate all text changes
     * @param field - The property metadata containing information about the field being refactored
     * @param decoratorPosition - The range position of the existing decorator to be replaced
     * @param uri - The URI of the file being modified
     * @returns A promise that resolves when all edit operations are complete
     * 
     * @remarks
     * - If the user cancels the input dialog or provides no values, the operation is aborted
     * - Enum values are sanitized by trimming whitespace and removing internal spaces
     * - The generated enum uses lowercase string values with PascalCase enum member names
     * - Labels in the @Choice decorator are converted to title case for display purposes
     */
    private async applyChoiceEnumCreation(workspaceEdit: vscode.WorkspaceEdit, field: PropertyMetadata, decoratorPosition: vscode.Range, uri: vscode.Uri) {
        const enumName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
        const valuesString = await vscode.window.showInputBox({
            prompt: `Create enum '${enumName}' for field '${field.name}'. Enter comma-separated values.`,
            placeHolder: "Example: ToDo, InProgress, Done"
        });
        if (!valuesString) {
            return;
        } 
        const values = valuesString.split(',').map(v => v.trim().replace(/\s/g, '')).filter(v => v);
        if (values.length === 0) {
            return;
        }

        // Generate the enum definition to be inserted at the end of the file
        const enumMembers = values.map(v => `    ${v} = "${v.toLowerCase()}",`).join('\n');
        const enumString = `\n\nexport enum ${enumName} {\n${enumMembers}\n}`;
        const document = await vscode.workspace.openTextDocument(uri);
        const endOfFile = document.lineAt(document.lineCount - 1).range.end;
        workspaceEdit.insert(uri, endOfFile, enumString);

        // Generate the new @Choice decorator
        const labels = values.map(v => `            ${v}: "${this.toTitleCase(v)}"`).join(',\n');
        const decoratorString = `@Choice<${enumName}>({\n        labels: {\n${labels}\n        }\n    })`;
        workspaceEdit.replace(uri, decoratorPosition, decoratorString);

        // Create an edit to change the property's type from 'string' to the new enum name
        const typeCorrectionEdit = await this.validateAndCorrectType(field, enumName, uri, true);
        if (typeCorrectionEdit) {
            workspaceEdit.replace(uri, typeCorrectionEdit.range, typeCorrectionEdit.newText);
        }
    }

    /**
     * Validates and corrects the type of a field declaration in a TypeScript document.
     * 
     * @param field - The property metadata containing type and declaration information
     * @param newType - The new type to validate or apply to the field
     * @param uri - The URI of the document containing the field declaration
     * @param force - Whether to force the type change without validation (defaults to false)
     * @returns A TextEdit object for replacing the field type, or undefined if no change is needed
     * 
     * @remarks
     * When force is false, the method determines the required type based on decorator rules.
     * When force is true, it uses the newType directly.
     * The method performs case-insensitive comparison to avoid unnecessary changes.
     * 
     * @example
     * ```typescript
     * const edit = await validateAndCorrectType(fieldMetadata, 'string', documentUri);
     * if (edit) {
     *   // Apply the text edit to change the field type
     * }
     * ```
     */
    private async validateAndCorrectType(field: PropertyMetadata, newType: string, uri: vscode.Uri, force: boolean = false): Promise<vscode.TextEdit | undefined> {
        const requiredType = force ? newType : this.getRequiredTypeForDecorator(newType);
        if (!requiredType || field.type.toLowerCase() === requiredType.toLowerCase()) {
            return undefined;
        }

        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const line = document.lineAt(field.declaration.range.start.line);
            const typeRegex = new RegExp(`(:\\s*)${field.type}`);
            const match = line.text.match(typeRegex);

            if (match && typeof match.index === 'number') {
                const startPos = line.range.start.translate(0, match.index + match[1].length);
                const endPos = startPos.translate(0, field.type.length);
                return vscode.TextEdit.replace(new vscode.Range(startPos, endPos), requiredType);
            }
        } catch (e) { console.error(e); }
        return undefined;
    }

    private parseDecoratorArguments(decoratorText: string): Map<string, any> {
        const args = new Map<string, any>();
        const match = decoratorText.match(/@\w+\(\s*(\{[\s\S]*\})\s*\)/);
        if (!match || !match[1]) {
            return args;
        }
        
        const argBlock = match[1];
        // This regex captures key-value pairs. It's simplified and may need enhancing for complex values like nested objects.
        const argRegex = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(\w+|[\d.]+))/g;

        let argMatch;
        while ((argMatch = argRegex.exec(argBlock)) !== null) {
            const key = argMatch[1];
            const value = argMatch[2] || argMatch[3] || argMatch[4];
            
            if (value === 'true') {
                args.set(key, true);
            } else if (value === 'false') {
                args.set(key, false);
            } else if (!isNaN(Number(value))) {
                args.set(key, Number(value));
            } else {
                args.set(key, value);
            }
        }
        return args;
    }

    /**
     * Maps TypeScript primitive types to their corresponding decorator names.
     * 
     * @param tsType - The TypeScript type name (case-insensitive)
     * @returns The corresponding decorator name, or undefined if no mapping exists
     * 
     * @example
     * ```typescript
     * getDecoratorForType('string') // returns 'Text'
     * getDecoratorForType('number') // returns 'Integer'
     * getDecoratorForType('boolean') // returns undefined
     * ```
     */
    private getDecoratorForType(tsType: string): string | undefined {
    const lowerTsType = tsType.toLowerCase();
    for (const decoratorName in fieldTypeConfig) {
        const config = fieldTypeConfig[decoratorName];
        if (config.mapsFromTsTypes?.includes(lowerTsType)) {
            return decoratorName;
        }
    }
    return undefined;
}

    /**
     * Determines the required TypeScript type for a given decorator.
     */
    /**
     * Determines the required TypeScript type for a given decorator name.
     * 
     * @param decoratorName - The name of the decorator to get the type for
     * @returns The TypeScript type as a string, or undefined if the decorator is not recognized
     * 
     * @example
     * ```typescript
     * getRequiredTypeForDecorator('Text') // returns 'string'
     * getRequiredTypeForDecorator('Integer') // returns 'number'
     * getRequiredTypeForDecorator('Unknown') // returns undefined
     * ```
     */
    private getRequiredTypeForDecorator(decoratorName: string): string | undefined {
    return fieldTypeConfig[decoratorName]?.requiredTsType;
}


    /**
     * Determines if the given type is a primitive JavaScript/TypeScript type.
     * 
     * @param type - The type string to check (case-insensitive)
     * @returns True if the type is 'string', 'number', or 'boolean'; false otherwise
     */
    private isPrimitiveType(type: string): boolean {
        return ['string', 'number', 'boolean'].includes(type.toLowerCase());
    }

    /**
     * Converts a string from camelCase or PascalCase to Title Case.
     */
    private toTitleCase(str: string): string {
        return str.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }
}
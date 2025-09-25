import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AddFieldTool } from '../commands/fields/addField';
import { MetadataCache } from '../cache/cache';
import { FIELD_TYPE_OPTIONS } from '../commands/interfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('AddField Tool Tests', () => {
        let testWorkspaceDir: string;
        let testModelFile: string;
        let mockCache: MetadataCache;
        let addFieldTool: AddFieldTool;
        const modelName = 'TestModel';

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-addfield-test-'));
            const testDataDir = path.join(testWorkspaceDir, 'src', 'data');
            
            // Create the src/data directory structure
            fs.mkdirSync(testDataDir, { recursive: true });
            
            // Create a sample model file for testing
            testModelFile = path.join(testDataDir, 'testModel.ts');
            const modelContent = `import { BaseModel, Field, Text, Model } from 'slingr-framework';

@Model()
export class TestModel extends BaseModel {
    @Field()
    @Text()
    existingField!: string;
}
`;
            fs.writeFileSync(testModelFile, modelContent);
            
            // Create mock cache
            mockCache = {
                getMetadataForFile: (filePath: string) => {
                    if (filePath === testModelFile) {
                        return {
                            classes: {
                                TestModel: {
                                    name: 'TestModel',
                                    decorators: [{ name: 'Model', arguments: [] }],
                                    properties: {
                                        existingField: {
                                            name: 'existingField',
                                            type: 'string',
                                            decorators: [
                                                { name: 'Field', arguments: [] },
                                                { name: 'Text', arguments: [] }
                                            ]
                                        }
                                    },
                                    declaration: {
                                        uri: vscode.Uri.file(testModelFile)
                                    }
                                }
                            }
                        };
                    }
                    return null;
                },
                getDataModelClasses: () => [
                    {
                        name: 'TestModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {
                            existingField: {
                                name: 'existingField',
                                type: 'string',
                                decorators: [
                                    { name: 'Field', arguments: [] },
                                    { name: 'Text', arguments: [] }
                                ]
                            }
                        },
                        declaration: { uri: vscode.Uri.file(testModelFile) }
                    },
                    {
                        name: 'RelatedModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {},
                        declaration: { uri: vscode.Uri.file(path.join(testDataDir, 'relatedModel.ts')) }
                    }
                ],
                getModelByName: (name: string) => {
                    if (name === 'TestModel') {
                        return {
                            name: 'TestModel',
                            decorators: [{ name: 'Model', arguments: [] }],
                            properties: {
                                existingField: {
                                    name: 'existingField',
                                    type: 'string',
                                    decorators: [
                                        { name: 'Field', arguments: [] },
                                        { name: 'Text', arguments: [] }
                                    ]
                                }
                            },
                            declaration: { uri: vscode.Uri.file(testModelFile) }
                        };
                    }
                    if (name === 'RelatedModel') {
                        return {
                            name: 'RelatedModel',
                            decorators: [{ name: 'Model', arguments: [] }],
                            properties: {},
                            declaration: { uri: vscode.Uri.file(path.join(testDataDir, 'relatedModel.ts')) }
                        };
                    }
                    return null;
                }
            } as any;
            
            addFieldTool = new AddFieldTool();
        });

        teardown(() => {
            // Clean up the test workspace
            if (testWorkspaceDir && fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        });
        
        test('AddField command should be registered', async () => {
            const commands = await vscode.commands.getCommands();
            assert.ok(
                commands.includes('slingr-vscode-extension.addField'),
                'AddField command should be registered'
            );
        });

        test('AddFieldTool should create instance successfully', () => {
            const tool = new AddFieldTool();
            assert.ok(tool, 'AddFieldTool should be instantiated');
            assert.ok(typeof tool.addField === 'function', 'addField method should exist');
        });

        test('Should validate field type options are correctly defined', () => {
            // Test that all core field types are available
            const expectedTypes = ['Text', 'LongText', 'Email', 'Integer', 'Boolean', 'Choice', 'Relationship'];
            
            expectedTypes.forEach(typeName => {
                const foundType = FIELD_TYPE_OPTIONS.find(option => option.decorator === typeName);
                assert.ok(foundType, `Field type ${typeName} should be available`);
                assert.ok(foundType.label, `Field type ${typeName} should have a label`);
                assert.ok(foundType.description, `Field type ${typeName} should have a description`);
                assert.ok(foundType.tsType, `Field type ${typeName} should have a TypeScript type`);
            });
        });

        test('Should create simple text field programmatically', async () => {
            // Mock the workspace folders
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowQuickPick = vscode.window.showQuickPick;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                let inputCallCount = 0;
                vscode.window.showInputBox = async (options: any) => {
                    inputCallCount++;
                    if (options?.prompt?.includes('field name')) {
                        return 'newTextField';
                    }
                    if (options?.prompt?.includes('AI enhancement')) {
                        return ''; // No AI enhancement
                    }
                    return undefined;
                };

                let quickPickCallCount = 0;
                (vscode.window.showQuickPick as any) = async (items: any[], options: any) => {
                    quickPickCallCount++;
                    if (options?.placeHolder?.includes('field type')) {
                        // Return Text field type
                        return items.find((item: any) => item.option?.decorator === 'Text');
                    }
                    if (options?.placeHolder?.includes('required')) {
                        // Return required = false
                        return { label: "Optional", value: false };
                    }
                    return undefined;
                };

                // Test field creation
                const modelUri = vscode.Uri.file(testModelFile);
                await addFieldTool.addField(modelUri,modelName, mockCache);
                
                // Verify the mock functions were called
                assert.ok(inputCallCount >= 1, 'Input box should be called for field name');
                assert.ok(quickPickCallCount >= 2, 'Quick pick should be called for field type and required status');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('Should handle relationship field creation', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowQuickPick = vscode.window.showQuickPick;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                vscode.window.showInputBox = async (options: any) => {
                    if (options?.prompt?.includes('field name')) {
                        return 'relatedItem';
                    }
                    if (options?.prompt?.includes('AI enhancement')) {
                        return ''; // No AI enhancement
                    }
                    return undefined;
                };

                let quickPickCalls: any[] = [];
                (vscode.window.showQuickPick as any) = async (items: any[], options: any) => {
                    quickPickCalls.push({ items, options });
                    
                    if (options?.placeHolder?.includes('field type')) {
                        // Return Relationship field type
                        return items.find((item: any) => item.option?.decorator === 'Relationship');
                    }
                    if (options?.placeHolder?.includes('required')) {
                        return { label: "Required", value: true };
                    }
                    if (options?.placeHolder?.includes('target model')) {
                        // Return RelatedModel
                        return { label: 'RelatedModel', description: 'Reference to RelatedModel model' };
                    }
                    if (options?.placeHolder?.includes('relationship type')) {
                        // Return reference relationship
                        return { label: "Reference", value: "reference" };
                    }
                    return undefined;
                };

                const modelUri = vscode.Uri.file(testModelFile);
                await addFieldTool.addField(modelUri,modelName, mockCache);
                
                // Verify relationship-specific interactions
                const relationshipTypeCall = quickPickCalls.find(call => 
                    call.options?.placeHolder?.includes('relationship type')
                );
                assert.ok(relationshipTypeCall, 'Should prompt for relationship type');
                
                const targetModelCall = quickPickCalls.find(call => 
                    call.options?.placeHolder?.includes('target model')
                );
                assert.ok(targetModelCall, 'Should prompt for target model');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('Should handle choice field creation with enum generation', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowQuickPick = vscode.window.showQuickPick;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                let inputBoxCalls: any[] = [];
                vscode.window.showInputBox = async (options: any) => {
                    inputBoxCalls.push(options);
                    
                    if (options?.prompt?.includes('field name')) {
                        return 'status';
                    }
                    if (options?.prompt?.includes('AI enhancement')) {
                        return ''; // No AI enhancement
                    }
                    if (options?.prompt?.includes('enum values')) {
                        return 'draft, in-progress, completed, cancelled';
                    }
                    return undefined;
                };

                (vscode.window.showQuickPick as any) = async (items: any[], options: any) => {
                    if (options?.placeHolder?.includes('field type')) {
                        // Return Choice field type
                        return items.find((item: any) => item.option?.decorator === 'Choice');
                    }
                    if (options?.placeHolder?.includes('required')) {
                        return { label: "Required", value: true };
                    }
                    return undefined;
                };

                const modelUri = vscode.Uri.file(testModelFile);
                await addFieldTool.addField(modelUri,modelName, mockCache);
                
                // Verify enum values were requested
                const enumValuesCall = inputBoxCalls.find(call => 
                    call?.prompt?.includes('enum values')
                );
                assert.ok(enumValuesCall, 'Should prompt for enum values when creating Choice field');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('Should create AI enhancement prompt when description is provided', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowQuickPick = vscode.window.showQuickPick;
            
            // Mock the defineFields tool to capture AI prompt
            let capturedPrompt: string = '';
            const mockDefineFieldsTool = {
                processFieldDescriptions: async (prompt: string, uri: vscode.Uri, cache: any, modelName: string) => {
                    capturedPrompt = prompt;
                }
            };
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                vscode.window.showInputBox = async (options: any) => {
                    if (options?.prompt?.includes('field name')) {
                        return 'userEmail';
                    }
                    if (options?.prompt?.includes('AI enhancement')) {
                        return 'email field with domain validation and uniqueness constraint';
                    }
                    return undefined;
                };

                (vscode.window.showQuickPick as any) = async (items: any[], options: any) => {
                    if (options?.placeHolder?.includes('field type')) {
                        return items.find((item: any) => item.option?.decorator === 'Email');
                    }
                    if (options?.placeHolder?.includes('required')) {
                        return { label: "Required", value: true };
                    }
                    return undefined;
                };

                // Replace the defineFieldsTool with our mock
                (addFieldTool as any).defineFieldsTool = mockDefineFieldsTool;

                const modelUri = vscode.Uri.file(testModelFile);
                await addFieldTool.addField(modelUri,modelName, mockCache);
                
                // Verify AI prompt was created correctly
                assert.ok(capturedPrompt, 'AI enhancement prompt should be created');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('Should handle error cases gracefully', async () => {
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            let errorMessages: string[] = [];
            
            try {
                vscode.window.showErrorMessage = async (message: string) => {
                    errorMessages.push(message);
                    return undefined;
                };

                // Test with invalid file (non-TypeScript)
                const invalidUri = vscode.Uri.file(path.join(testWorkspaceDir, 'invalid.txt'));
                fs.writeFileSync(invalidUri.fsPath, 'not a typescript file');
                
                await addFieldTool.addField(invalidUri,modelName, mockCache);
                
                assert.ok(errorMessages.length > 0, 'Should show error message for invalid file');
                assert.ok(errorMessages.some(msg => msg.includes('Failed to add field')), 'Should show appropriate error message');
                
            } finally {
                vscode.window.showErrorMessage = originalShowErrorMessage;
            }
        });

        test('Should handle user cancellation at different steps', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowQuickPick = vscode.window.showQuickPick;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                // Test cancellation at field name step
                vscode.window.showInputBox = async () => undefined; // User cancels
                vscode.window.showQuickPick = async () => undefined; // User cancels

                const modelUri = vscode.Uri.file(testModelFile);
                
                // Should handle cancellation gracefully without throwing errors
                await assert.doesNotReject(async () => {
                    await addFieldTool.addField(modelUri,modelName, mockCache);
                }, 'Should handle user cancellation gracefully');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showQuickPick = originalShowQuickPick;
            }
        });

        test('should create WorkspaceEdit for Text field addition without applying', async () => {
            const fieldInfo = {
                name: 'newTextField',
                type: FIELD_TYPE_OPTIONS.find(t => t.decorator === 'Text')!,
                required: true
            };

            const targetUri = vscode.Uri.file(testModelFile);
            const edit = await addFieldTool.createAddFieldWorkspaceEdit(targetUri, fieldInfo, modelName, mockCache);

            // Verify the edit contains the expected changes
            assert.ok(edit, 'WorkspaceEdit should be created');
            
            const fileEdits = edit.get(targetUri);
            assert.ok(fileEdits && fileEdits.length > 0, 'WorkspaceEdit should contain file edits');

            // Convert edits to string to verify content
            const originalContent = fs.readFileSync(testModelFile, 'utf8');
            let modifiedContent = originalContent;
            
            // Apply edits manually to verify content
            const sortedEdits = fileEdits.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
            for (let i = sortedEdits.length - 1; i >= 0; i--) {
                const edit = sortedEdits[i];
                const lines = modifiedContent.split('\n');
                
                if (edit.range.isEmpty) {
                    // Insert operation
                    lines.splice(edit.range.start.line, 0, edit.newText);
                } else {
                    // Replace operation
                    lines.splice(edit.range.start.line, edit.range.end.line - edit.range.start.line + 1, edit.newText);
                }
                
                modifiedContent = lines.join('\n');
            }

            // Verify the field was added
            assert.ok(modifiedContent.includes('newTextField'), 'Field name should be in the modified content');
            assert.ok(modifiedContent.includes('@Field({'), 'Field decorator should be present');
            assert.ok(modifiedContent.includes('required: true'), 'Required property should be set');
            assert.ok(modifiedContent.includes('@Text()'), 'Text decorator should be present');

            // Verify original file is unchanged (since we didn't apply the edit)
            const currentContent = fs.readFileSync(testModelFile, 'utf8');
            assert.strictEqual(currentContent, originalContent, 'Original file should remain unchanged');
        });

        test('should create WorkspaceEdit for Choice field with enum', async () => {
            const fieldInfo = {
                name: 'statusField',
                type: FIELD_TYPE_OPTIONS.find(t => t.decorator === 'Choice')!,
                required: false
            };

            const enumValues = ['Active', 'Inactive', 'Pending'];
            const targetUri = vscode.Uri.file(testModelFile);
            const edit = await addFieldTool.createAddFieldWorkspaceEdit(targetUri, fieldInfo, modelName, mockCache, enumValues);

            // Verify the edit contains the expected changes
            assert.ok(edit, 'WorkspaceEdit should be created');
            
            const fileEdits = edit.get(targetUri);
            assert.ok(fileEdits && fileEdits.length > 0, 'WorkspaceEdit should contain file edits');

            // Apply edits manually to verify content
            const originalContent = fs.readFileSync(testModelFile, 'utf8');
            let modifiedContent = originalContent;
            
            const sortedEdits = fileEdits.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
            for (let i = sortedEdits.length - 1; i >= 0; i--) {
                const edit = sortedEdits[i];
                const lines = modifiedContent.split('\n');
                
                if (edit.range.isEmpty) {
                    lines.splice(edit.range.start.line, 0, edit.newText);
                } else {
                    lines.splice(edit.range.start.line, edit.range.end.line - edit.range.start.line + 1, edit.newText);
                }
                
                modifiedContent = lines.join('\n');
            }

            // Verify the field was added
            assert.ok(modifiedContent.includes('statusField'), 'Field name should be in the modified content');
            assert.ok(modifiedContent.includes('@Choice()'), 'Choice decorator should be present');
            
            // Verify enum was created - statusField should generate StatusField enum name
            assert.ok(modifiedContent.includes('export enum StatusField {'), 'Enum should be created');
            assert.ok(modifiedContent.includes("Active = 'active'"), 'Enum values should be present');
            assert.ok(modifiedContent.includes("Inactive = 'inactive'"), 'Enum values should be present');
            assert.ok(modifiedContent.includes("Pending = 'pending'"), 'Enum values should be present');

            // Verify original file is unchanged
            const currentContent = fs.readFileSync(testModelFile, 'utf8');
            assert.strictEqual(currentContent, originalContent, 'Original file should remain unchanged');
        });

        test('should throw error when field already exists', async () => {
            const fieldInfo = {
                name: 'existingField', // This field already exists in the test model
                type: FIELD_TYPE_OPTIONS.find(t => t.decorator === 'Text')!,
                required: false
            };

            const targetUri = vscode.Uri.file(testModelFile);
            
            try {
                await addFieldTool.createAddFieldWorkspaceEdit(targetUri, fieldInfo, modelName, mockCache);
                assert.fail('Should have thrown an error for existing field');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an Error');
                assert.ok(error.message.includes('already exists'), 'Error message should mention field already exists');
            }
        });
    });
}

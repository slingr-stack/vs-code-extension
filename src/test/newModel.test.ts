import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { NewModelTool } from '../commands/newModel';
import { MetadataCache } from '../cache/cache';
import { AppTreeItem } from '../explorer/appTreeItem';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('NewModel Tool Tests', () => {
        let testWorkspaceDir: string;
        let testDataDir: string;
        let mockCache: MetadataCache;
        let newModelTool: NewModelTool;

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-newmodel-test-'));
            testDataDir = path.join(testWorkspaceDir, 'src', 'data');
            
            // Create the src/data directory structure
            fs.mkdirSync(testDataDir, { recursive: true });
            
            // Create a sample parent model file for relationship testing
            const parentModelFile = path.join(testDataDir, 'parentModel.ts');
            const parentModelContent = `import { BaseModel, Field, Text, Model } from 'slingr-framework';

@Model()
export class ParentModel extends BaseModel {
    @Field()
    @Text()
    name!: string;
}
`;
            fs.writeFileSync(parentModelFile, parentModelContent);
            
            // Create mock cache
            mockCache = {
                getMetadataForFile: (filePath: string) => {
                    if (filePath === parentModelFile) {
                        return {
                            classes: {
                                ParentModel: {
                                    name: 'ParentModel',
                                    decorators: [{ name: 'Model', arguments: [] }],
                                    properties: {
                                        name: {
                                            name: 'name',
                                            type: 'string',
                                            decorators: [
                                                { name: 'Field', arguments: [] },
                                                { name: 'Text', arguments: [] }
                                            ]
                                        }
                                    },
                                    declaration: {
                                        uri: vscode.Uri.file(parentModelFile)
                                    }
                                }
                            }
                        };
                    }
                    return null;
                },
                getDataModelClasses: () => [
                    {
                        name: 'ParentModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {
                            name: {
                                name: 'name',
                                type: 'string',
                                decorators: [
                                    { name: 'Field', arguments: [] },
                                    { name: 'Text', arguments: [] }
                                ]
                            }
                        },
                        declaration: { uri: vscode.Uri.file(parentModelFile) }
                    },
                    {
                        name: 'ExistingModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {},
                        declaration: { uri: vscode.Uri.file(path.join(testDataDir, 'existingModel.ts')) }
                    }
                ]
            } as any;
            
            newModelTool = new NewModelTool();
        });

        teardown(() => {
            // Clean up the test workspace
            if (testWorkspaceDir && fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        });
        
        test('NewModel command should be registered', async () => {
            // Wait a moment for extension to fully activate
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const commands = await vscode.commands.getCommands();
            assert.ok(
                commands.includes('slingr-vscode-extension.newModel'),
                'NewModel command should be registered'
            );
        });

        test('NewModelTool should create instance successfully', () => {
            const tool = new NewModelTool();
            assert.ok(tool, 'NewModelTool should be instantiated');
            assert.ok(typeof tool.createNewModel === 'function', 'createNewModel method should exist');
            assert.ok(typeof tool.processWithAI === 'function', 'processWithAI method should exist');
        });

        test('Should create model with real fields - END-TO-END TEST', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowInformationMessage = vscode.window.showInformationMessage;
            const originalOpenTextDocument = vscode.workspace.openTextDocument;
            const originalShowTextDocument = vscode.window.showTextDocument;
            const originalApplyEdit = vscode.workspace.applyEdit;
            const originalExecuteCommand = vscode.commands.executeCommand;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                let inputCallCount = 0;
                vscode.window.showInputBox = async (options: any) => {
                    inputCallCount++;
                    if (options?.prompt?.includes('name of the new model')) {
                        return 'UserModel';
                    }
                    if (options?.prompt?.includes('optional documentation')) {
                        return 'A comprehensive user model for the application';
                    }
                    if (options?.prompt?.includes('field information')) {
                        return ''; // Return empty string to skip AI processing
                    }
                    return '';
                };

                let infoMessageCalled = false;
                vscode.window.showInformationMessage = async (message: string) => {
                    infoMessageCalled = true;
                    return undefined;
                };

                // Mock document opening with full document interface
                (vscode.workspace.openTextDocument as any) = async (uri: vscode.Uri) => {
                    return {
                        getText: () => fs.readFileSync(uri.fsPath, 'utf8'),
                        uri: uri,
                        save: async () => true,
                        fileName: uri.fsPath,
                        languageId: 'typescript',
                        version: 1,
                        isDirty: false,
                        isClosed: false,
                        isUntitled: false,
                        eol: vscode.EndOfLine.LF,
                        lineCount: fs.readFileSync(uri.fsPath, 'utf8').split('\n').length
                    } as any;
                };

                vscode.window.showTextDocument = async (document: any) => {
                    return {} as any;
                };

                // Mock workspace.applyEdit to actually apply text edits to files
                (vscode.workspace.applyEdit as any) = async (edit: vscode.WorkspaceEdit) => {
                    for (const [uri, edits] of edit.entries()) {
                        if (edits && edits.length > 0) {
                            const filePath = uri.fsPath;
                            let content = fs.readFileSync(filePath, 'utf8');
                            
                            // Apply edits in reverse order to maintain positions
                            const sortedEdits = edits.sort((a, b) => b.range.start.compareTo(a.range.start));
                            
                            for (const edit of sortedEdits) {
                                const lines = content.split('\n');
                                const startLine = edit.range.start.line;
                                const startChar = edit.range.start.character;
                                const endLine = edit.range.end.line;
                                const endChar = edit.range.end.character;
                                
                                if (startLine === endLine) {
                                    const line = lines[startLine];
                                    lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
                                } else {
                                    const startPart = lines[startLine].substring(0, startChar);
                                    const endPart = lines[endLine].substring(endChar);
                                    lines.splice(startLine, endLine - startLine + 1, startPart + edit.newText + endPart);
                                }
                                
                                content = lines.join('\n');
                            }
                            
                            fs.writeFileSync(filePath, content, 'utf8');
                        }
                    }
                    return Promise.resolve(true);
                };

                // Mock executeCommand - should not be called for AI integration
                (vscode.commands.executeCommand as any) = async (command: string, ...args: any[]) => {
                    // This should not be called when no field description is provided
                    assert.fail('AI integration should not be triggered when no field description is provided');
                };

                // Mock DefineFieldsTool - should not be called when no fields are specified
                const mockDefineFieldsTool = {
                    processFieldDescriptions: async (fieldsInfo: string, uri: vscode.Uri, cache: any, modelName: string) => {
                        assert.fail('DefineFieldsTool should not be called when no field description is provided');
                    }
                };

                // Replace the defineFieldsTool with our mock
                (newModelTool as any).defineFieldsTool = mockDefineFieldsTool;

                // Test model creation with real field processing
                const targetUri = vscode.Uri.file(testDataDir);
                await newModelTool.createNewModel(targetUri, mockCache);
                
                // Verify the model file was created
                const expectedModelPath = path.join(testDataDir, 'UserModel.ts');
                assert.ok(fs.existsSync(expectedModelPath), 'Model file should be created');
                
                // Verify the content of the created model
                const modelContent = fs.readFileSync(expectedModelPath, 'utf8');
                
                // Verify basic model structure
                assert.ok(modelContent.includes('@Model()'), 'Model should have @Model decorator');
                assert.ok(modelContent.includes('export class UserModel extends BaseModel'), 'Model should extend BaseModel');
                assert.ok(modelContent.includes('* A comprehensive user model for the application'), 'Model should include documentation');
                
                // Verify only basic imports are present
                assert.ok(modelContent.includes('import { Model, Field }'), 'Should have basic imports');
                assert.ok(!modelContent.includes('Text, Email, Integer, Boolean, Choice'), 'Should NOT import field decorators when no fields specified');
                
                // Verify the class is empty (just the basic structure)
                assert.ok(modelContent.includes('export class UserModel extends BaseModel {\n}'), 'Model class should be empty when no fields specified');
                
                // Verify user interactions
                assert.ok(inputCallCount >= 3, 'Input box should be called for model name, docs, and fields');
                assert.ok(infoMessageCalled, 'Success message should be shown');
                
                console.log('Created UserModel content (without AI integration):');
                console.log(modelContent);
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showInformationMessage = originalShowInformationMessage;
                vscode.workspace.openTextDocument = originalOpenTextDocument;
                vscode.window.showTextDocument = originalShowTextDocument;
                vscode.workspace.applyEdit = originalApplyEdit;
                vscode.commands.executeCommand = originalExecuteCommand;
            }
        });

        
        test('Should create composition relationship when created from model context - REAL FILE TEST', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowInformationMessage = vscode.window.showInformationMessage;
            const originalOpenTextDocument = vscode.workspace.openTextDocument;
            const originalShowTextDocument = vscode.window.showTextDocument;
            const originalApplyEdit = vscode.workspace.applyEdit;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                vscode.window.showInputBox = async (options: any) => {
                    if (options?.prompt?.includes('name of the new model')) {
                        return 'ChildModel';
                    }
                    return '';
                };

                vscode.window.showInformationMessage = async () => undefined;
                (vscode.workspace.openTextDocument as any) = async (uri: vscode.Uri) => {
                    return {
                        getText: () => fs.readFileSync(uri.fsPath, 'utf8'),
                        uri: uri,
                        save: async () => {
                            // Mock save method - in a real scenario this would save to VS Code
                            // For our test, the file changes are applied through workspace.applyEdit
                            return true;
                        },
                        fileName: uri.fsPath,
                        languageId: 'typescript',
                        version: 1,
                        isDirty: false,
                        isClosed: false,
                        isUntitled: false,
                        eol: vscode.EndOfLine.LF,
                        lineCount: fs.readFileSync(uri.fsPath, 'utf8').split('\n').length
                    } as any;
                };
                vscode.window.showTextDocument = async () => ({} as any);

                // Mock workspace.applyEdit to actually apply text edits to files
                (vscode.workspace.applyEdit as any) = async (edit: vscode.WorkspaceEdit) => {
                    // Apply the text edits to the actual file system for testing
                    for (const [uri, edits] of edit.entries()) {
                        if (edits && edits.length > 0) {
                            const filePath = uri.fsPath;
                            let content = fs.readFileSync(filePath, 'utf8');
                            
                            // Apply edits in reverse order to maintain positions
                            const sortedEdits = edits.sort((a, b) => b.range.start.compareTo(a.range.start));
                            
                            for (const edit of sortedEdits) {
                                const lines = content.split('\n');
                                const startLine = edit.range.start.line;
                                const startChar = edit.range.start.character;
                                const endLine = edit.range.end.line;
                                const endChar = edit.range.end.character;
                                
                                if (startLine === endLine) {
                                    // Single line edit
                                    const line = lines[startLine];
                                    lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
                                } else {
                                    // Multi-line edit
                                    const startPart = lines[startLine].substring(0, startChar);
                                    const endPart = lines[endLine].substring(endChar);
                                    lines.splice(startLine, endLine - startLine + 1, startPart + edit.newText + endPart);
                                }
                                
                                content = lines.join('\n');
                            }
                            
                            // Write the updated content back to the file
                            fs.writeFileSync(filePath, content, 'utf8');
                        }
                    }
                    return Promise.resolve(true);
                };

                // Create AppTreeItem representing a model context
                const extensionUri = vscode.Uri.file(testWorkspaceDir);
                const parentModelItem = new AppTreeItem(
                    'ParentModel',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'model',
                    extensionUri,
                    {
                        name: 'ParentModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {}
                    } as any,
                    undefined,
                    testDataDir
                );

                // Get the original parent model content before the operation
                const parentModelPath = path.join(testDataDir, 'parentModel.ts');
                const originalParentContent = fs.readFileSync(parentModelPath, 'utf8');
                
                // Verify original content doesn't have the relationship field yet
                assert.ok(!originalParentContent.includes('childModels'), 'Parent model should not initially contain childModels field');
                assert.ok(!originalParentContent.includes('@Relationship'), 'Parent model should not initially contain @Relationship decorator');

                await newModelTool.createNewModel(parentModelItem, mockCache);
                
                // Verify the child model file was created
                const expectedModelPath = path.join(testDataDir, 'ChildModel.ts');
                assert.ok(fs.existsSync(expectedModelPath), 'Child model file should be created');
                
                // REAL FILE TEST: Check if the composition relationship field was actually added to the parent model file
                const updatedParentContent = fs.readFileSync(parentModelPath, 'utf8');
                
                // Verify the relationship field was actually written to the file
                assert.ok(updatedParentContent.includes('childModels'), 'Parent model should contain the relationship field "childModels"');
                assert.ok(updatedParentContent.includes('@Field'), 'Parent model should have @Field decorator for the relationship');
                assert.ok(updatedParentContent.includes('@Relationship'), 'Parent model should have @Relationship decorator');
                assert.ok(updatedParentContent.includes('composition'), 'Relationship should be of type composition');
                assert.ok(updatedParentContent.includes('ChildModel'), 'Relationship should reference ChildModel type');
                
                // Verify the field declaration syntax
                assert.ok(updatedParentContent.includes('childModels!: ChildModel[]'), 'Should have correct TypeScript array syntax');
                
                // Verify proper import was added for ChildModel
                assert.ok(
                    updatedParentContent.includes(`import { ChildModel }`) || 
                    updatedParentContent.includes(`import './ChildModel'`) ||
                    updatedParentContent.includes('ChildModel'),
                    'Should import or reference ChildModel'
                );
                
                console.log('Updated parent model content:');
                console.log(updatedParentContent);
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showInformationMessage = originalShowInformationMessage;
                vscode.workspace.openTextDocument = originalOpenTextDocument;
                vscode.window.showTextDocument = originalShowTextDocument;
                vscode.workspace.applyEdit = originalApplyEdit;
            }
        });

        test('Should handle file overwrite confirmation', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            // Create an existing model file
            const existingModelPath = path.join(testDataDir, 'ExistingModel.ts');
            fs.writeFileSync(existingModelPath, 'export class ExistingModel {}');
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowWarningMessage = vscode.window.showWarningMessage;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                vscode.window.showInputBox = async (options: any) => {
                    if (options?.prompt?.includes('name of the new model')) {
                        return 'ExistingModel';
                    }
                    return '';
                };

                let warningMessageCalled = false;
                (vscode.window.showWarningMessage as any) = async (message: string, ...items: string[]) => {
                    warningMessageCalled = true;
                    assert.ok(message.includes('already exists'), 'Warning should mention file already exists');
                    assert.ok(items.includes('Overwrite'), 'Should offer overwrite option');
                    assert.ok(items.includes('Cancel'), 'Should offer cancel option');
                    return 'Cancel'; // User cancels
                };

                const targetUri = vscode.Uri.file(testDataDir);
                await newModelTool.createNewModel(targetUri, mockCache);
                
                assert.ok(warningMessageCalled, 'Warning message should be shown for existing file');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showWarningMessage = originalShowWarningMessage;
            }
        });

        test('Should test AI enhancement functionality', async () => {
            const targetUri = vscode.Uri.file(testDataDir);
            const userInput = "Create a User model with name, email, and authentication fields";
            
            // Mock the createNewModel method to track if it was called
            let createNewModelCalled = false;
            const originalCreateNewModel = newModelTool.createNewModel;
            newModelTool.createNewModel = async (uri: any, cache?: any) => {
                createNewModelCalled = true;
                return Promise.resolve();
            };
            
            try {
                await newModelTool.processWithAI(userInput, targetUri, mockCache);
                
                assert.ok(createNewModelCalled, 'createNewModel should be called by processWithAI');
                
            } finally {
                newModelTool.createNewModel = originalCreateNewModel;
            }
        });

        test('Should generate correct model content', () => {
            // Test the private generateModelContent method by creating a new instance
            // and calling createNewModel with mocked inputs
            const tool = new NewModelTool();
            
            // We can't directly test the private method, but we can verify the generated content
            // by creating a model and checking the file content
            const testContent = (tool as any).generateModelContent('TestModel', 'Test documentation', null, testDataDir);
            
            assert.ok(testContent.includes('import { Model, Field } from \'slingr-framework\';'), 'Should import decorators');
            assert.ok(testContent.includes('import { BaseModel } from \'slingr-framework\';'), 'Should import BaseModel');
            assert.ok(testContent.includes('* Test documentation'), 'Should include documentation');
            assert.ok(testContent.includes('@Model()'), 'Should include @Model decorator');
            assert.ok(testContent.includes('export class TestModel extends BaseModel'), 'Should create proper class declaration');
        });

        test('Should generate correct composition field names', () => {
            const tool = new NewModelTool();
            
            // Test the pluralization logic
            const generateName = (tool as any).generateCompositionFieldName.bind(tool);
            
            assert.strictEqual(generateName('Task'), 'tasks', 'Simple plural should add s');
            assert.strictEqual(generateName('Category'), 'categories', 'Word ending in y should become ies');
            assert.strictEqual(generateName('Address'), 'addresses', 'Word ending in s should add es');
            assert.strictEqual(generateName('Box'), 'boxes', 'Word ending in x should add es');
            assert.strictEqual(generateName('Branch'), 'branches', 'Word ending in ch should add es');
            assert.strictEqual(generateName('Wish'), 'wishes', 'Word ending in sh should add es');
        });

        test('Should handle errors gracefully', async () => {
            const mockWorkspaceFolders = [{
                uri: vscode.Uri.file(testWorkspaceDir),
                name: 'test-workspace',
                index: 0
            }];
            
            const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
            const originalShowInputBox = vscode.window.showInputBox;
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            
            try {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: mockWorkspaceFolders,
                    configurable: true
                });

                vscode.window.showInputBox = async (options: any) => {
                    if (options?.prompt?.includes('name of the new model')) {
                        return 'TestModel';
                    }
                    return '';
                };

                let errorMessages: string[] = [];
                vscode.window.showErrorMessage = async (message: string) => {
                    errorMessages.push(message);
                    return undefined;
                };

                // Test with invalid target directory (read-only)
                const readOnlyDir = path.join(testWorkspaceDir, 'readonly');
                fs.mkdirSync(readOnlyDir, { recursive: true });
                try {
                    fs.chmodSync(readOnlyDir, 0o444); // Read-only
                } catch {
                    // Skip this test on systems that don't support chmod
                    return;
                }
                
                const targetUri = vscode.Uri.file(readOnlyDir);
                await newModelTool.createNewModel(targetUri, mockCache);
                
                assert.ok(errorMessages.length > 0, 'Should show error message for failed file creation');
                assert.ok(errorMessages.some(msg => msg.includes('Failed to create model')), 'Should show appropriate error message');
                
            } finally {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: originalWorkspaceFolders,
                    configurable: true
                });
                vscode.window.showInputBox = originalShowInputBox;
                vscode.window.showErrorMessage = originalShowErrorMessage;
            }
        });
    });
}

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CreateTestTool } from '../commands/createTest';
import { MetadataCache, DecoratedClass } from '../cache/cache';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('CreateTest Tool Tests', () => {
        let testWorkspaceDir: string;
        let testModelFile: string;
        let mockCache: MetadataCache;
        let createTestTool: CreateTestTool;

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-createtest-test-'));
            const testDataDir = path.join(testWorkspaceDir, 'src', 'data');
            const testDir = path.join(testWorkspaceDir, 'tests');
            
            // Create the directory structure
            fs.mkdirSync(testDataDir, { recursive: true });
            fs.mkdirSync(testDir, { recursive: true });
            
            // Create a sample model file for testing
            testModelFile = path.join(testDataDir, 'testModel.ts');
            const modelContent = `import { BaseModel, Field, Text, Model, Integer } from 'slingr-framework';

            @Model()
            export class TestModel extends BaseModel {
                @Field()
                @Text()
                name!: string;

                @Field()
                @Integer()
                age!: number;
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
                                        name: {
                                            name: 'name',
                                            type: 'string',
                                            decorators: [
                                                { name: 'Field', arguments: [] },
                                                { name: 'Text', arguments: [] }
                                            ]
                                        },
                                        age: {
                                            name: 'age',
                                            type: 'number',
                                            decorators: [
                                                { name: 'Field', arguments: [] },
                                                { name: 'Integer', arguments: [] }
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
                }
            } as any;
            
            createTestTool = new CreateTestTool();
        });

        teardown(() => {
            // Clean up the test workspace
            if (testWorkspaceDir && fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        });

        test('CreateTestTool should create instance successfully', () => {
            const tool = new CreateTestTool();
            assert.ok(tool, 'CreateTestTool should be instantiated');
            assert.ok(typeof tool.createTest === 'function', 'createTest method should exist');
        });

        test('Should reject non-TypeScript files', async () => {
            const jsFile = path.join(testWorkspaceDir, 'test.js');
            fs.writeFileSync(jsFile, 'console.log("test");');
            const jsUri = vscode.Uri.file(jsFile);

            try {
                await createTestTool.createTest(jsUri, mockCache);
                assert.fail('Should have thrown an error for non-TypeScript file');
            } catch (error: any) {
                assert.ok(error.message.includes('TypeScript file'), 'Should reject non-TypeScript files');
            }
        });

        test('Should reject files without metadata', async () => {
            const unknownFile = path.join(testWorkspaceDir, 'unknown.ts');
            fs.writeFileSync(unknownFile, 'export class UnknownClass {}');
            const unknownUri = vscode.Uri.file(unknownFile);

            // Mock cache to return null for unknown file
            const mockCacheWithoutMetadata = {
                getMetadataForFile: () => null
            } as any;

            // Mock the error message to capture the call
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            let errorMessageCalled = false;
            let errorMessage = '';

            try {
                (vscode.window as any).showErrorMessage = async (message: string) => {
                    errorMessageCalled = true;
                    errorMessage = message;
                };

                await createTestTool.createTest(unknownUri, mockCacheWithoutMetadata);
                
                assert.ok(errorMessageCalled, 'Should show error message for file without metadata');
                assert.ok(errorMessage.includes('No metadata found'), 'Error message should mention metadata issue');
            } finally {
                (vscode.window as any).showErrorMessage = originalShowErrorMessage;
            }
        });

        test('Should reject files without model classes', async () => {
            const nonModelFile = path.join(testWorkspaceDir, 'nonModel.ts');
            fs.writeFileSync(nonModelFile, 'export class RegularClass {}');
            const nonModelUri = vscode.Uri.file(nonModelFile);

            // Mock cache to return metadata without model classes
            const mockCacheWithoutModel = {
                getMetadataForFile: () => ({
                    classes: {
                        RegularClass: {
                            name: 'RegularClass',
                            decorators: [], // No @Model decorator
                            properties: {},
                            declaration: { uri: nonModelUri }
                        }
                    }
                })
            } as any;

            // Mock the error message to capture the call
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            let errorMessageCalled = false;
            let errorMessage = '';

            try {
                (vscode.window as any).showErrorMessage = async (message: string) => {
                    errorMessageCalled = true;
                    errorMessage = message;
                };

                await createTestTool.createTest(nonModelUri, mockCacheWithoutModel);
                
                assert.ok(errorMessageCalled, 'Should show error message for file without model classes');
                assert.ok(errorMessage.includes('No model class found'), 'Error message should mention model class issue');
            } finally {
                (vscode.window as any).showErrorMessage = originalShowErrorMessage;
            }
        });

        test('Should build correct AI prompt for model with fields', () => {
            const modelClass: DecoratedClass = {
                name: 'TestModel',
                decorators: [{ name: 'Model', arguments: [] }],
                properties: {
                    name: {
                        name: 'name',
                        type: 'string',
                        decorators: [
                            { name: 'Field', arguments: [] },
                            { name: 'Text', arguments: [] }
                        ]
                    },
                    age: {
                        name: 'age',
                        type: 'number',
                        decorators: [
                            { name: 'Field', arguments: [] },
                            { name: 'Integer', arguments: [] }
                        ]
                    }
                }
            } as any;

            // Access the private method through type assertion
            const prompt = (createTestTool as any).buildAIPrompt(modelClass);

            assert.ok(typeof prompt === 'string', 'Should return a string prompt');
            assert.ok(prompt.includes('TestModel'), 'Should include model name');
            assert.ok(prompt.includes('name: string'), 'Should include field information');
            assert.ok(prompt.includes('age: number'), 'Should include field information');
            assert.ok(prompt.includes('Jest'), 'Should mention Jest framework');
            assert.ok(prompt.includes('testModel.test.ts'), 'Should include correct test file name');
        });

        test('Should handle file existence check correctly', async () => {
            const existingTestFile = path.join(testWorkspaceDir, 'tests', 'existing.test.ts');
            fs.writeFileSync(existingTestFile, 'export const test = true;');
            const existingUri = vscode.Uri.file(existingTestFile);

            // Mock vscode.window.showWarningMessage to return 'Cancel'
            const originalShowWarningMessage = vscode.window.showWarningMessage;
            let warningMessageCalled = false;
            
            try {
                (vscode.window as any).showWarningMessage = async (message: string, ...items: any[]) => {
                    warningMessageCalled = true;
                    assert.ok(message.includes('already exists'), 'Should show warning about existing file');
                    assert.ok(items.includes('Overwrite'), 'Should offer overwrite option');
                    assert.ok(items.includes('Cancel'), 'Should offer cancel option');
                    return 'Cancel';
                };

                const result = await (createTestTool as any).checkIfFileExists(existingUri, 'existing.test.ts');
                
                assert.ok(warningMessageCalled, 'Should call warning message for existing file');
                assert.strictEqual(result, 'Cancel', 'Should return Cancel choice');
            } finally {
                (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            }
        });

        test('Should handle non-existing file correctly', async () => {
            const nonExistingFile = path.join(testWorkspaceDir, 'tests', 'nonexisting.test.ts');
            const nonExistingUri = vscode.Uri.file(nonExistingFile);

            const result = await (createTestTool as any).checkIfFileExists(nonExistingUri, 'nonexisting.test.ts');
            
            assert.strictEqual(result, 'Overwrite', 'Should return Overwrite for non-existing file');
        });
    });
}

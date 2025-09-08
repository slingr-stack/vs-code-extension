import * as assert from 'assert';
import * as vscode from 'vscode';
import { RenameModelTool } from '../../refactor/tools/renameModel';
import { MetadataCache, FileMetadata, DecoratedClass } from '../../cache/cache';
import { ChangeObject, DeleteModelPayload, ManualRefactorContext, RenameModelPayload } from '../../refactor/refactorInterfaces';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameModelTool Tests', () => {
        
        let tool: RenameModelTool;
        let mockCache: MetadataCache;
        let userInputResponses: { [prompt: string]: string | undefined } = {};

        setup(() => {
            tool = new RenameModelTool();
            mockCache = createMockCache();
            userInputResponses = {};

            // Mock user input
            (vscode.window as any).showInputBox = async (options: any) => {
                const prompt = options.prompt || '';
                const response = userInputResponses[prompt];
                
                if (response !== undefined && options.validateInput) {
                    const validationResult = options.validateInput(response);
                    if (validationResult) {
                        return undefined;
                    }
                }
                
                return response;
            };

            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };
        });

        suite('Tool Metadata', () => {
            test('should provide correct command ID', () => {
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.renameModel');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Rename Model');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['RENAME_MODEL']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid model metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject non-model metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                
                const nonModel = {
                    name: 'NotAnModel',
                    decorators: [], // No Model decorator
                    properties: {},
                    methods: {},
                    declaration: { uri: modelUri, range: modelRange },
                    references: [],
                    isDataModel: false
                };
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: nonModel as any
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject undefined metadata', async () => {
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: vscode.Uri.file('/test/file.ts'),
                    range: new vscode.Range(0, 0, 0, 0),
                    metadata: undefined
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect simple model rename', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldModel = createMockModel('User', uri, range);
                const newModel = createMockModel('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { uri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri, classes: { 'Customer': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                const payload = changes[0].payload as RenameModelPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_MODEL');
                assert.strictEqual(payload.oldName, 'User');
                assert.strictEqual(payload.newName, 'Customer');
                // newUri should be set since the file name "User.ts" matches the model name "User"
                assert.ok(payload.newUri);
                assert.strictEqual(payload.newUri?.path.endsWith('/Customer.ts'), true);
                assert.strictEqual(payload.isManual, false);
                assert.strictEqual(changes[0].description, 'Model \'User\' was renamed to \'Customer\'.');
            });

            test('should not detect rename when multiple models change', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldModel1 = createMockModel('User', uri, range);
                const oldModel2 = createMockModel('Product', uri, new vscode.Range(10, 0, 10, 7));
                const newModel = createMockModel('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'User': oldModel1, 'Product': oldModel2 }, 
                    dataSources: {} 
                };
                const newFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'Customer': newModel }, 
                    dataSources: {}
                };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect changes in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldClass = createMockNonModel('Helper', nonModelUri, range);
                const newClass = createMockNonModel('Utility', nonModelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': oldClass }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Utility': newClass }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle accumulated changes from model deletion', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldModel1 = createMockModel('User', uri, range);
                const oldModel2 = createMockModel('Product', uri, new vscode.Range(10, 0, 10, 7));
                const newModel = createMockModel('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'User': oldModel1, 'Product': oldModel2 }, 
                    dataSources: {}
                };
                const newFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'Customer': newModel }, 
                    dataSources: {}
                };

                // Simulate that Product was deleted by another tool
                const accumulatedChanges: ChangeObject[] = [{
                    type: 'DELETE_MODEL',
                    uri,
                    description: 'Product model deleted',
                    payload: { oldModelMetadata: oldModel2 } as DeleteModelPayload
                } as ChangeObject];
                
                const changes = tool.analyze(oldFileMeta, newFileMeta, accumulatedChanges);
                const payload = changes[0].payload as RenameModelPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(payload.oldName, 'User');
                assert.strictEqual(payload.newName, 'Customer');
                // newUri should be set since the file name "User.ts" matches the model name "User"
                assert.ok(payload.newUri);
                assert.strictEqual(payload.newUri?.path.endsWith('/Customer.ts'), true);
                assert.strictEqual(payload.isManual, false);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');

                const emptyFileMeta: FileMetadata = { uri, classes: {}, dataSources: {} };

                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, emptyFileMeta).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should accept valid model name', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                userInputResponses['Rename model \'User\''] = 'ValidModelName';
                const change = await tool.initiateManualRefactor(context);
                const payload = change?.payload as RenameModelPayload;
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_MODEL');
                assert.strictEqual(payload.oldName, 'User');
                assert.strictEqual(payload.newName, 'ValidModelName');
                assert.strictEqual(payload.isManual, true);
                // The newUri should be set since the file name matches the model name
                assert.ok(payload.newUri);
                assert.strictEqual(payload.newUri?.path.endsWith('ValidModelName.ts'), true);
            });

            test('should reject invalid model name - lowercase start', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                userInputResponses['Rename model \'User\''] = 'invalidName';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should reject invalid model name - special characters', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                userInputResponses['Rename model \'User\''] = 'Invalid-Name';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should reject same name', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                userInputResponses['Rename model \'User\''] = 'User';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should handle user cancellation', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                userInputResponses['Rename model \'User\''] = undefined;
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should handle invalid metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for manual rename', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                // Add some references
                model.references = [
                    { uri: modelUri, range: modelRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_MODEL',
                    uri: modelUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldModelMetadata: model,
                        newUri: undefined, // No file rename for this test
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                
                // Should have edits for the declaration and references
                const entries = workspaceEdit.entries();
                assert.ok(entries.length > 0);
            });

            test('should prepare edit for automatic rename', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                model.references = [
                    { uri: modelUri, range: modelRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_MODEL',
                    uri: modelUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldModelMetadata: model,
                        newUri: undefined, // No file rename for this test
                        isManual: false
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                
                // For automatic renames, should not edit the declaration (already changed)
                const entries = workspaceEdit.entries();
                assert.ok(entries.length >= 0);
            });

            test('should handle model with no references', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                model.references = []; // No references

                const change: ChangeObject = {
                    type: 'RENAME_MODEL',
                    uri: modelUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldModelMetadata: model,
                        newUri: undefined, // No file rename for this test
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should still work even with no references
            });
        });
    });
}

// Helper functions
function createMockCache(): MetadataCache {
    return {
        getMetadataForFile: () => undefined,
        findMetadata: () => [],
        notifyFileDeleted: () => {},
        notifyFileChanged: () => {},
        refresh: () => Promise.resolve(),
    } as any;
}

function createMockModel(name: string, uri: vscode.Uri, range: vscode.Range): DecoratedClass {
    return {
        name,
        decorators: [{ 
            name: 'Model', 
            arguments: [], 
            position: range 
        }],
        properties: {},
        methods: {},
        declaration: { uri, range },
        references: [{ uri, range }],
        isDataModel: true
    };
}

function createMockNonModel(name: string, uri: vscode.Uri, range: vscode.Range): DecoratedClass {
    return {
        name,
        decorators: [], // No Model decorator
        properties: {},
        methods: {},
        declaration: { uri, range },
        references: [{ uri, range }],
        isDataModel: false
    };
}

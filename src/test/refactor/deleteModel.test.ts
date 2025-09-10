import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeleteModelTool } from '../../refactor/tools/deleteModel';
import { MetadataCache, FileMetadata, DecoratedClass } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, DeleteModelPayload } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('DeleteModelTool Tests', () => {
        
        let tool: DeleteModelTool;
        let mockCache: MetadataCache;
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new DeleteModelTool();
            mockCache = createMockCache();
            confirmationResponses = {};

            // Mock confirmation dialogs
            (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                const response = confirmationResponses[message];
                return response || items[0];
            };

            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };

            // Mock workspace operations
            (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
                return {
                    lineAt: (line: number) => ({
                        text: '    @Field() name: string;',
                        isEmptyOrWhitespace: false,
                        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0)
                    }),
                    getText: () => '@Field() name: string;'
                };
            };

            (vscode.workspace as any).getWorkspaceFolder = (uri: vscode.Uri) => {
                return {
                    uri: vscode.Uri.file('/test'),
                    name: 'test',
                    index: 0
                };
            };
        });

        suite('Tool Metadata', () => {
            test('should provide correct command ID', () => {
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.deleteModel');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Delete Model');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['DELETE_MODEL']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid model in model file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/User.ts');
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

            test('should search model files only in src/data', async () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('Helper', nonModelUri, range);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonModelUri,
                    range: range,
                    metadata: model
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject non-model metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const nonModel = {
                    name: 'NotAnModel',
                    decorators: [],
                    properties: {},
                    methods: {},
                    declaration: { uri: modelUri, range },
                    references: [],
                    isDataModel: false
                };
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: range,
                    metadata: nonModel
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });


        });

        suite('Automatic Change Detection', () => {
            test('should detect model deletion when file is deleted', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': model }, dataSources: {} };
                
                // newFileMeta is undefined (file deleted)
                const changes = tool.analyze(oldFileMeta, undefined);
                const payload = changes[0].payload as DeleteModelPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_MODEL');
                assert.strictEqual(payload.oldModelMetadata.name, 'User');
                assert.ok(Array.isArray(payload.urisToDelete));
                assert.ok(payload.urisToDelete.length > 0);
            });

            test('should detect model deletion when model class is removed', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': model }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: {}, dataSources: {} }; // Model removed from file

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                const payload = changes[0].payload as DeleteModelPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_MODEL');
                assert.strictEqual(payload.oldModelMetadata.name, 'User');
            });

            test('should not detect deletion in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const nonModel = createMockNonModel('Helper', nonModelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': nonModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, undefined);
                assert.strictEqual(changes.length, 0);
            });

            test('should include related directories in deletion list', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': model }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, undefined);
                
                const payload = changes[0].payload as DeleteModelPayload;
                assert.strictEqual(changes.length, 1);
                const urisToDelete = payload.urisToDelete as vscode.Uri[];

                // Should include related directories
                const actionsDirIncluded = urisToDelete.some(uri => 
                    uri.path.includes('src/data/actions/user')
                );
                const uiDirIncluded = urisToDelete.some(uri => 
                    uri.path.includes('src/ui/user')
                );
                
                assert.ok(actionsDirIncluded || uiDirIncluded, 'Should include related directories');
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {}, dataSources: {} };

                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                
                // Test with non-model files
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const nonModelMeta: FileMetadata = { uri: nonModelUri, classes: {}, dataSources: {} };
                assert.strictEqual(tool.analyze(nonModelMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with user confirmation', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                // Mock user confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the model')) {
                        return 'Yes, Delete All';
                    }
                    return items[0];
                };

                const change = await tool.initiateManualRefactor(context);
                const payload = change?.payload as DeleteModelPayload;
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_MODEL');
                assert.strictEqual(payload.oldModelMetadata.name, 'User');
                assert.strictEqual(payload.isManual, true);
                assert.ok(Array.isArray(payload.urisToDelete));
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

                // Mock user cancellation
                (vscode.window as any).showWarningMessage = async () => undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle non-confirmation response', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                // Mock different response
                (vscode.window as any).showWarningMessage = async () => 'Cancel';

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
            test('should prepare edit for model deletion', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                // Add some external references
                model.references = [
                    { uri: modelUri, range: modelRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                ];

                const change: ChangeObject = {
                    type: 'DELETE_MODEL',
                    uri: modelUri,
                    description: 'Delete User model',
                    payload: {
                        oldModelMetadata: model,
                        urisToDelete: [modelUri],
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle model with relationship cleanup', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);

                // Setup mock cache with other models that might reference this one
                const otherModel = createMockModel('Order', vscode.Uri.file('/test/src/data/models/Order.ts'), new vscode.Range(5, 0, 5, 5));
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(otherModel)) {
                        results.push(otherModel);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_MODEL',
                    uri: modelUri,
                    description: 'Delete User model',
                    payload: {
                        oldModelMetadata: model,
                        urisToDelete: [modelUri],
                        isManual: true
                    } as DeleteModelPayload
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle model with no external references', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                // Only self-reference
                model.references = [{ uri: modelUri, range: modelRange }];

                const change: ChangeObject = {
                    type: 'DELETE_MODEL',
                    uri: modelUri,
                    description: 'Delete User model',
                    payload: {
                        oldModelMetadata: model,
                        urisToDelete: [modelUri],
                        isManual: true
                    } as DeleteModelPayload
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Relationship Field Cleanup', () => {
            test('should identify and clean relationship fields', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);

                // Create an model with a relationship field pointing to User
                const orderModel = createMockModel('Order', vscode.Uri.file('/test/src/data/models/Order.ts'), new vscode.Range(5, 0, 5, 5));
                orderModel.properties = {
                    'user': {
                        name: 'user',
                        type: 'User',
                        decorators: [
                            { 
                                name: 'Relationship', 
                                arguments: [], 
                                position: new vscode.Range(8, 4, 8, 16) 
                            },
                            { 
                                name: 'Field', 
                                arguments: [{ label: 'User' }], 
                                position: new vscode.Range(9, 4, 9, 17) 
                            }
                        ],
                        declaration: { uri: orderModel.declaration.uri, range: new vscode.Range(10, 4, 10, 8) },
                        references: []
                    }
                };

                // Setup mock cache to return the order model
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderModel)) {
                        results.push(orderModel);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_MODEL',
                    uri: modelUri,
                    description: 'Delete User model',
                    payload: {
                        oldModelMetadata: model,
                        urisToDelete: [modelUri],
                        isManual: true
                    } as DeleteModelPayload
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // The workspace edit should include removal of relationship decorators
            });
        });

        suite('Multiple Models in File', () => {
            test('should handle deletion of one model from multi-model file', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/MultiModel.ts');
                
                // Create mock metadata for two models in the same file
                const userModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 15, 1));
                const orderModel = createMockModel('Order', modelUri, new vscode.Range(20, 0, 30, 1));
                
                const oldFileMeta: FileMetadata = {
                    uri: modelUri,
                    classes: {
                        'User': userModel,
                        'Order': orderModel
                    },
                    dataSources: {}
                };

                const newFileMeta: FileMetadata = {
                    uri: modelUri,
                    classes: {
                        'Order': orderModel  // User model was deleted
                    },
                    dataSources: {}
                };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_MODEL');
                assert.strictEqual((changes[0].payload as DeleteModelPayload).oldModelMetadata.name, 'User');
                
                // Should not include the file itself in urisToDelete since other models remain
                const urisToDelete = (changes[0].payload as DeleteModelPayload).urisToDelete;
                const fileIsInDeleteList = urisToDelete.some(uri => uri.fsPath === modelUri.fsPath);
                assert.strictEqual(fileIsInDeleteList, false);
            });

            test('should handle deletion of last model from file', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/SingleModel.ts');
                
                // Create mock metadata for single model in file
                const userModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 15, 1));
                
                const oldFileMeta: FileMetadata = {
                    uri: modelUri,
                    classes: {
                        'User': userModel
                    },
                    dataSources: {}
                };

                const newFileMeta: FileMetadata = {
                    uri: modelUri,
                    classes: {}, // No models left
                    dataSources: {}
                };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_MODEL');
                assert.strictEqual((changes[0].payload as DeleteModelPayload).oldModelMetadata.name, 'User');
                
                // Should include the file itself in urisToDelete since no models remain
                const urisToDelete = (changes[0].payload as DeleteModelPayload).urisToDelete;
                const fileIsInDeleteList = urisToDelete.some(uri => uri.fsPath === modelUri.fsPath);
                assert.strictEqual(fileIsInDeleteList, true);
            });

            test('should show appropriate confirmation message for multiple models', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/MultiModel.ts');
                const userModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 15, 1));
                const orderModel = createMockModel('Order', modelUri, new vscode.Range(20, 0, 30, 1));
                
                // Mock cache to return multiple models for the file
                (mockCache as any).getMetadataForFile = (filePath: string) => ({
                    uri: modelUri,
                    classes: {
                        'User': userModel,
                        'Order': orderModel
                    },
                    dataSources: {}
                });

                let capturedMessage = '';
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    capturedMessage = message;
                    return "Yes, Delete All";
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: userModel.declaration.range,
                    metadata: userModel
                };

                await tool.initiateManualRefactor(context);
                
                // Should mention that other models will remain
                assert.ok(capturedMessage.includes('other models in the same file will remain'));
            });

            test('should show appropriate confirmation message for single model', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/SingleModel.ts');
                const userModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 15, 1));
                
                // Mock cache to return single model for the file
                (mockCache as any).getMetadataForFile = (filePath: string) => ({
                    uri: modelUri,
                    classes: {
                        'User': userModel
                    },
                    dataSources: {}
                });

                let capturedMessage = '';
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    capturedMessage = message;
                    return "Yes, Delete All";
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: userModel.declaration.range,
                    metadata: userModel
                };

                await tool.initiateManualRefactor(context);
                
                // Should NOT mention other models since there's only one
                assert.ok(!capturedMessage.includes('other models in the same file will remain'));
                assert.ok(capturedMessage.includes('its related files'));
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

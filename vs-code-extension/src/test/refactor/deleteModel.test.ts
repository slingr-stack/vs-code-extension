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

            test('should create change object when initiated manually', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                const change = await tool.initiateManualRefactor(context);
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_MODEL');
                assert.strictEqual(change?.description, "Delete model 'User'.");
            });

            test('should create change object for confirmed deletion', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const model = createMockModel('User', modelUri, modelRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                const change = await tool.initiateManualRefactor(context);
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_MODEL');
                assert.strictEqual(change?.description, "Delete model 'User'.");
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
                    }
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
                    }
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
                    }
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

            test('should handle multiple models in same file', async () => {
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

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: userModel.declaration.range,
                    metadata: userModel
                };

                const change = await tool.initiateManualRefactor(context);
                
                // Should create a change object without asking for confirmation
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_MODEL');
                
                // Should not include the entire file for deletion since other models remain
                const payload = change?.payload as DeleteModelPayload;
                const fileIsInDeleteList = payload.urisToDelete.some(uri => uri.fsPath === modelUri.fsPath);
                assert.strictEqual(fileIsInDeleteList, false);
            });

            test('should handle single model in file', async () => {
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

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: userModel.declaration.range,
                    metadata: userModel
                };

                const change = await tool.initiateManualRefactor(context);
                
                // Should create a change object without asking for confirmation
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_MODEL');
                
                // Should include the entire file for deletion since it's the only model
                const payload = change?.payload as DeleteModelPayload;
                const fileIsInDeleteList = payload.urisToDelete.some(uri => uri.fsPath === modelUri.fsPath);
                assert.strictEqual(fileIsInDeleteList, true);
            });

            test('should not create duplicate edits when deleting model from multi-model file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/MultiModel.ts');
                const userModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 15, 1));
                const orderModel = createMockModel('Order', modelUri, new vscode.Range(20, 0, 30, 1));
                
                // Add a self-reference within the same file (e.g., the class declaration itself)
                userModel.references = [
                    { uri: modelUri, range: new vscode.Range(5, 13, 5, 17) }, // class declaration
                    { uri: modelUri, range: new vscode.Range(8, 4, 8, 8) }   // some property or usage
                ];

                // Mock workspace operations with realistic file content
                (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
                    const mockFileContent = `import { Model, Field } from '@slingr/platform';

@Model()
export class User extends PersistentModel {
    @Field()
    name: string;
    
    @Field()
    email: string;
}

@Model()
export class Order extends PersistentModel {
    @Field()
    orderNumber: string;
}`;
                    return {
                        getText: () => mockFileContent,
                        lineAt: (line: number) => {
                            const lines = mockFileContent.split('\n');
                            return {
                                text: lines[line] || '',
                                isEmptyOrWhitespace: (lines[line] || '').trim() === '',
                                rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0)
                            };
                        }
                    };
                };
                
                const change: ChangeObject = {
                    type: 'DELETE_MODEL',
                    uri: modelUri,
                    description: 'Delete User model',
                    payload: {
                        oldModelMetadata: userModel,
                        urisToDelete: [], // No file deletion since there are multiple models
                        isManual: true
                    } as DeleteModelPayload
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                // Get all the edits for this file
                const fileEdits = workspaceEdit.get(modelUri) || [];
                
                // Should have only ONE edit for this file (the class deletion), not multiple
                // The class declaration reference should NOT be processed separately
                assert.strictEqual(fileEdits.length, 1, 
                    `Expected only 1 edit for the file, but got ${fileEdits.length}. ` +
                    `This suggests duplicate edits are being created.`);
                
                // The single edit should be a delete operation (either proper deletion or fallback comment)
                assert.ok(fileEdits[0].range, 'Edit should have a range');
                // Accept either proper deletion or fallback comment replacement
                const isProperDeletion = fileEdits[0].newText === '';
                const isFallbackComment = fileEdits[0].newText.includes('/* DELETED_MODEL:');
                assert.ok(isProperDeletion || isFallbackComment, 
                    'Edit should be either a deletion or fallback comment replacement');
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

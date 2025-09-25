import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeleteFieldTool } from '../../refactor/tools/deleteField';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, DeleteFieldPayload } from '../../refactor/refactorInterfaces';
import { TestMetadataFactory } from '../testHelpers';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('DeleteFieldTool Tests', () => {
        
        let tool: DeleteFieldTool;
        let mockCache: MetadataCache;
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new DeleteFieldTool();
            mockCache = TestMetadataFactory.createMockCache();
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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.deleteField');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Delete Field');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['DELETE_FIELD']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid field in model file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject field in non-model files', async () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: nonModelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonModelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject non-field metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: range } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: range,
                    metadata: model as any
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject field without Field decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect field deletion when property is removed', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'name': field, 'email': TestMetadataFactory.createField({ name: 'email', type: 'string', declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 9) } }) };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'email': TestMetadataFactory.createField({ name: 'email', type: 'string', declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 9) } }) };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_FIELD');
                const payload = changes[0].payload as DeleteFieldPayload;
                assert.strictEqual(payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(payload.modelName, 'User');
            });

            test('should detect multiple field deletions', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                const nameField = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: new vscode.Range(8, 4, 8, 8) } });
                const emailField = TestMetadataFactory.createField({ name: 'email', type: 'string', declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 9) } });
                const ageField = TestMetadataFactory.createField({ name: 'age', type: 'number', declaration: { uri: modelUri, range: new vscode.Range(10, 4, 10, 7) } });
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'name': nameField, 'email': emailField, 'age': ageField };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'email': emailField }; // Only email remains
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                const nameChange = changes.find(c => (c.payload as DeleteFieldPayload).oldFieldMetadata.name === 'name');
                const ageChange = changes.find(c => (c.payload as DeleteFieldPayload).oldFieldMetadata.name === 'age');
                
                assert.ok(nameChange);
                assert.ok(ageChange);
                const namePayload: DeleteFieldPayload = nameChange?.payload as DeleteFieldPayload;
                const agePayload: DeleteFieldPayload = ageChange?.payload as DeleteFieldPayload;
                assert.strictEqual(namePayload.modelName, 'User');
                assert.strictEqual(agePayload.modelName, 'User');
            });

            test('should not detect deletions in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = TestMetadataFactory.createNonField('name', 'string', nonModelUri, fieldRange);
                
                const oldNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                oldNonModel.properties = { 'name': field };
                
                const newNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                newNonModel.properties = {}; // Field removed
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': oldNonModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': newNonModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect deletion when only decorators are removed', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                const newField = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange); // Same field but no @Field decorator
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'name': oldField };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'name': newField };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0); // Property still exists, just not a field anymore
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
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock user confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the field')) {
                        return 'Yes, Delete';
                    }
                    return items[0];
                };

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_FIELD');
                const payload = change.payload as DeleteFieldPayload;
                assert.strictEqual(payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(payload.isManual, true);
            });

            test('should create change object when initiated manually', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const change = await tool.initiateManualRefactor(context);
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_FIELD');
                assert.strictEqual(change?.description, "Delete field 'name'.");
            });

            test('should create change object for confirmed deletion', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const change = await tool.initiateManualRefactor(context);
                assert.notStrictEqual(change, undefined);
                assert.strictEqual(change?.type, 'DELETE_FIELD');
                assert.strictEqual(change?.description, "Delete field 'name'.");
            });

            test('should handle invalid metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for field deletion', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                // Add some external references
                field.references = [
                    { uri: modelUri, range: fieldRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                ];

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: modelUri,
                    description: 'Delete field name from User model',
                    payload: {
                        oldFieldMetadata: field,
                        modelName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with relationship decorators', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const relationshipField = TestMetadataFactory.createRelationshipField('order', 'Order', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: modelUri,
                    description: 'Delete relationship field order from User model',
                    payload: {
                        oldFieldMetadata: relationshipField,
                        modelName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with no external references', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                // Only self-reference
                field.references = [{ uri: modelUri, range: fieldRange }];

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: modelUri,
                    description: 'Delete field name from User model',
                    payload: {
                        oldFieldMetadata: field,
                        modelName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Related Field Cleanup', () => {
            test('should clean up related fields in other models', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });

                // Create another model with a field that might reference this one
                const orderModel = TestMetadataFactory.createModel({ name: 'Order', declaration: { uri: vscode.Uri.file('/test/src/data/models/Order.ts'), range: new vscode.Range(5, 0, 5, 5) } });
                orderModel.properties = {
                    'userRef': TestMetadataFactory.createRelationshipField('userRef', 'User', orderModel.declaration.uri, new vscode.Range(8, 4, 8, 11))
                };

                // Setup mock cache to return related models
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderModel)) {
                        results.push(orderModel);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: modelUri,
                    description: 'Delete field name from User model',
                    payload: {
                        oldFieldMetadata: field,
                        modelName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field deletion with reverse relationship cleanup', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                // Create a relationship field being deleted
                const relationshipField = TestMetadataFactory.createRelationshipField('orders', 'Order', modelUri, fieldRange);
                relationshipField.decorators.push({
                    name: 'ReverseRelationship',
                    arguments: [{ value: 'user' }],
                    position: new vscode.Range(7, 4, 7, 21)
                });

                // Create the reverse model
                const orderModel = TestMetadataFactory.createModel({ name: 'Order', declaration: { uri: vscode.Uri.file('/test/src/data/models/Order.ts'), range: new vscode.Range(5, 0, 5, 5) } });
                orderModel.properties = {
                    'user': TestMetadataFactory.createRelationshipField('user', 'User', orderModel.declaration.uri, new vscode.Range(8, 4, 8, 8))
                };

                // Setup mock cache
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderModel)) {
                        results.push(orderModel);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: modelUri,
                    description: 'Delete relationship field orders from User model',
                    payload: {
                        oldFieldMetadata: relationshipField,
                        modelName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });
    });
}

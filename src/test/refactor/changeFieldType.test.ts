import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChangeFieldTypeTool } from '../../refactor/tools/changeFieldType';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, ChangeFieldTypePayload } from '../../refactor/refactorInterfaces';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('ChangeFieldTypeTool Tests', () => {
        
        let tool: ChangeFieldTypeTool;
        let mockCache: MetadataCache;
        let inputResponses: { [prompt: string]: string | undefined } = {};
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new ChangeFieldTypeTool();
            mockCache = TestMetadataFactory.createMockCache();
            inputResponses = {};
            confirmationResponses = {};

            // Mock user input dialogs
            (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                const response = inputResponses[options.prompt || 'default'];
                return response;
            };

            // Mock quick pick (used by initiateManualRefactor)
            (vscode.window as any).showQuickPick = async (items: any[], options: any) => {
                const prompt = options && options.placeHolder ? options.placeHolder : 'default';
                const response = inputResponses[prompt] ?? inputResponses['Enter new field type:'];
                if (response === undefined) {
                    return Promise.resolve(undefined);
                }
                return Promise.resolve(response);
            };

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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.changeFieldType');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Change Field Type');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['CHANGE_FIELD_TYPE']);
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

            test('should reject non-field metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: range } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: range,
                    metadata: model
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
            test('should detect field type change when type changes', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createField({ 
                    name: 'age', 
                    type: 'string', 
                    declaration: { uri: modelUri, range: fieldRange },
                    decorators: [{ name: 'Text', arguments: [], position: new vscode.Range(7, 4, 7, 10) }]
                });
                const newField = TestMetadataFactory.createField({ 
                    name: 'age', 
                    type: 'number', 
                    declaration: { uri: modelUri, range: fieldRange },
                    decorators: [{ name: 'Integer', arguments: [], position: new vscode.Range(7, 4, 7, 13) }]
                });
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'age': oldField };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'age': newField };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'CHANGE_FIELD_TYPE');
                const payload = changes[0].payload;
                assert.strictEqual(payload.newType, 'Integer');
                assert.strictEqual(payload.field.name, 'age');
            });

            test('should detect multiple field type changes', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                const oldAgeField = TestMetadataFactory.createField({ 
                    name: 'age', 
                    type: 'string', 
                    declaration: { uri: modelUri, range: new vscode.Range(8, 4, 8, 8) },
                    decorators: [{ name: 'Text', arguments: [], position: new vscode.Range(7, 4, 7, 10) }]
                });
                const oldStatusField = TestMetadataFactory.createField({ 
                    name: 'status', 
                    type: 'string', 
                    declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 10) },
                    decorators: [{ name: 'Text', arguments: [], position: new vscode.Range(8, 4, 8, 10) }]
                });
                
                const newAgeField = TestMetadataFactory.createField({ 
                    name: 'age', 
                    type: 'Integer', 
                    declaration: { uri: modelUri, range: new vscode.Range(8, 4, 8, 8) },
                    decorators: [{ name: 'Integer', arguments: [], position: new vscode.Range(7, 4, 7, 13) }]
                });
                const newStatusField = TestMetadataFactory.createField({ 
                    name: 'status', 
                    type: 'Boolean', 
                    declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 10) },
                    decorators: [{ name: 'Boolean', arguments: [], position: new vscode.Range(8, 4, 8, 13) }]
                });
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'age': oldAgeField, 'status': oldStatusField };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'age': newAgeField, 'status': newStatusField };

                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                const ageChange = changes.find(c => {
                    if (c.type === 'CHANGE_FIELD_TYPE') {
                        return (c.payload).field.name === 'age';
                    }
                    return false;
                });
                const statusChange = changes.find(c => {
                    if (c.type === 'CHANGE_FIELD_TYPE') {
                        return (c.payload).field.name === 'status';
                    }
                    return false;
                });
                
                assert.ok(ageChange);
                assert.ok(statusChange);
                const agePayload = ageChange.payload as ChangeFieldTypePayload;
                const statusPayload = statusChange.payload as ChangeFieldTypePayload;
                assert.strictEqual(agePayload.newType, 'Integer');
                assert.strictEqual(statusPayload.newType, 'Boolean');
            });

            test('should not detect change when only decorators change', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                const newField = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                // Same type, just different decorator arguments
                newField.decorators = [{ 
                    name: 'Field', 
                    arguments: [{ label: 'Full Name' }], 
                    position: new vscode.Range(7, 4, 7, 17) 
                }];
                
                const oldModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                oldModel.properties = { 'name': oldField };
                
                const newModel = TestMetadataFactory.createModel({ name: 'User', declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) } });
                newModel.properties = { 'name': newField };

                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect changes in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createNonField('value', 'string', nonModelUri, fieldRange);
                const newField = TestMetadataFactory.createNonField('value', 'number', nonModelUri, fieldRange);
                
                const oldNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                oldNonModel.properties = { 'value': oldField };
                
                const newNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                newNonModel.properties = { 'value': newField };

                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': oldNonModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': newNonModel }, dataSources: {} };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
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
            test('should proceed with valid new field type', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'age', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock valid user input
                inputResponses[`Select a new type for 'age'`] = 'Integer';

                const change = await tool.initiateManualRefactor(context);

                assert.ok(change, 'Expected a change object to be returned');
                assert.strictEqual(change.type, 'CHANGE_FIELD_TYPE');
                const payload = change.payload;
                assert.strictEqual(payload.isManual, true);
                assert.strictEqual(payload.newType, 'Integer');
                assert.ok(payload.field, 'Payload should include the field metadata');
                assert.strictEqual(payload.field.name, 'age');
                assert.strictEqual(payload.field.type, 'string');
                assert.strictEqual(change.uri?.toString(), modelUri.toString());
            });

            test('should handle user cancellation', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'age', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock user cancellation
                inputResponses[`Select a new type for 'age'`] = undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject empty field types', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'age', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock empty input
                inputResponses[`Select a new type for 'age'`] = '';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
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
            test('should prepare edit for field type change', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({ name: 'age', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                const newField = TestMetadataFactory.createField({ name: 'age', type: 'number', declaration: { uri: modelUri, range: fieldRange } });
                
                // Add some references
                oldField.references = [
                    { uri: modelUri, range: fieldRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 8) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 3) }
                ];

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to number',
                    payload: {
                        field: oldField,
                        newType: 'number',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle type change with decorator updates', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({ name: 'name', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                // Add type-specific decorators that might need updating
                oldField.decorators.push({
                    name: 'StringConstraint',
                    arguments: [{ maxLength: 50 }],
                    position: new vscode.Range(6, 4, 6, 18)
                });

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to boolean',
                    payload: {
                        field: oldField,
                        newType: 'boolean',
                        isManual: false,
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle complex type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({ name: 'data', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to UserData',
                    payload: {
                        field: oldField,
                        newType: 'UserData',
                        isManual: false,
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Type-Specific Decorator Handling', () => {
            test('should update type-specific decorators for string to number', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({ name: 'score', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                // Add string-specific decorators
                oldField.decorators.push({
                    name: 'StringConstraint',
                    arguments: [{ maxLength: 10 }],
                    position: new vscode.Range(6, 4, 6, 18)
                });


                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to number',
                    payload: {
                        field: oldField,
                        newType: 'number',
                        isManual: false,
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should remove string-specific decorators and potentially add number-specific ones
            });

            test('should handle date type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({ name: 'createdDate', type: 'string', declaration: { uri: modelUri, range: fieldRange } });

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to Date',
                    payload: {
                        field: oldField,
                        newType: 'Date',
                        isManual: false,
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle relationship field type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createRelationshipField('order', 'Order', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change relationship field type from Order to Purchase',
                    payload: {
                        field: oldField,
                        newType: 'Purchase',
                        isManual: false,
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Type Validation', () => {
            test('should accept valid TypeScript types', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'field', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const validTypes = ['number', 'boolean', 'Date', 'string[]', 'CustomType', 'User', 'number | null'];
                
                for (const type of validTypes) {
                    inputResponses[`Select a new type for 'field'`] = type;
                    const change = await tool.initiateManualRefactor(context);
                    assert.ok(change, `Should accept valid type: ${type}`);
                    const payload = change.payload as ChangeFieldTypePayload;
                    assert.strictEqual(payload.newType, type);
                }
            });

            test('should handle array and union types', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({ name: 'tags', type: 'string', declaration: { uri: modelUri, range: fieldRange } });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Test array type
                inputResponses[`Select a new type for 'tags'`] = 'string[]';
                let change = await tool.initiateManualRefactor(context);
                assert.ok(change);
                let payload = change.payload as ChangeFieldTypePayload;
                assert.strictEqual(payload.newType, 'string[]');

                // Test union type
                inputResponses[`Select a new type for 'tags'`] = 'string | number';
                change = await tool.initiateManualRefactor(context);
                assert.ok(change);
                payload = change.payload as ChangeFieldTypePayload;
                assert.strictEqual(payload.newType, 'string | number');
            });
        });
    });
}

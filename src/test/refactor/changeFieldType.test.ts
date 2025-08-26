import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChangeFieldTypeTool } from '../../refactor/tools/changeFieldType';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('ChangeFieldTypeTool Tests', () => {
        
        let tool: ChangeFieldTypeTool;
        let mockCache: MetadataCache;
        let inputResponses: { [prompt: string]: string | undefined } = {};
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new ChangeFieldTypeTool();
            mockCache = createMockCache();
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
                const fieldMeta = createMockField('name', 'string', modelUri, fieldRange);
                
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
                const model = createMockModel('User', modelUri, range);
                
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
                const fieldMeta = createMockNonField('name', 'string', modelUri, fieldRange);
                
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
                
                const oldField = createMockField('age', 'string', modelUri, fieldRange);
                const newField = createMockField('age', 'number', modelUri, fieldRange);
                
                const oldModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                oldModel.properties = { 'age': oldField };
                
                const newModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                newModel.properties = { 'age': newField };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'CHANGE_FIELD_TYPE');
                assert.strictEqual(changes[0].payload.newType, 'Integer');
                assert.strictEqual(changes[0].payload.field.name, 'age');
            });

            test('should detect multiple field type changes', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                const oldAgeField = createMockField('age', 'string', modelUri, new vscode.Range(8, 4, 8, 7));
                const oldStatusField = createMockField('status', 'string', modelUri, new vscode.Range(9, 4, 9, 10));
                
                const newAgeField = createMockField('age', 'number', modelUri, new vscode.Range(8, 4, 8, 7));
                const newStatusField = createMockField('status', 'boolean', modelUri, new vscode.Range(9, 4, 9, 10));
                
                const oldModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                oldModel.properties = { 'age': oldAgeField, 'status': oldStatusField };
                
                const newModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                newModel.properties = { 'age': newAgeField, 'status': newStatusField };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                const ageChange = changes.find(c => c.payload.field.name === 'age');
                const statusChange = changes.find(c => c.payload.field.name === 'status');
                
                assert.ok(ageChange);
                assert.ok(statusChange);
                assert.strictEqual(ageChange.payload.newType, 'Integer');
                assert.strictEqual(statusChange.payload.newType, 'Boolean');
            });

            test('should not detect change when only decorators change', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('name', 'string', modelUri, fieldRange);
                const newField = createMockField('name', 'string', modelUri, fieldRange);
                // Same type, just different decorator arguments
                newField.decorators = [{ 
                    name: 'Field', 
                    arguments: [{ label: 'Full Name' }], 
                    position: new vscode.Range(7, 4, 7, 17) 
                }];
                
                const oldModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                oldModel.properties = { 'name': oldField };
                
                const newModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                newModel.properties = { 'name': newField };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect changes in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockNonField('value', 'string', nonModelUri, fieldRange);
                const newField = createMockNonField('value', 'number', nonModelUri, fieldRange);
                
                const oldNonModel = createMockNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                oldNonModel.properties = { 'value': oldField };
                
                const newNonModel = createMockNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                newNonModel.properties = { 'value': newField };
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': oldNonModel } };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': newNonModel } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {} };
                
                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                
                // Test with non-model files
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const nonModelMeta: FileMetadata = { uri: nonModelUri, classes: {} };
                assert.strictEqual(tool.analyze(nonModelMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with valid new field type', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('age', 'string', modelUri, fieldRange);
                
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
                assert.strictEqual(change.payload.isManual, true);
                assert.strictEqual(change.payload.newType, 'Integer');
                assert.ok(change.payload.field, 'Payload should include the field metadata');
                assert.strictEqual(change.payload.field.name, 'age');
                assert.strictEqual(change.payload.field.type, 'string');
                assert.strictEqual(change.uri?.toString(), modelUri.toString());
            });

            test('should handle user cancellation', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('age', 'string', modelUri, fieldRange);
                
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
                const fieldMeta = createMockField('age', 'string', modelUri, fieldRange);
                
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
                const oldField = createMockField('age', 'string', modelUri, fieldRange);
                const newField = createMockField('age', 'number', modelUri, fieldRange);
                
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
                const oldField = createMockField('isActive', 'string', modelUri, fieldRange);
                
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
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle complex type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('data', 'string', modelUri, fieldRange);
                
                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to UserData',
                    payload: {
                        field: oldField,
                        newType: 'UserData',
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
                const oldField = createMockField('score', 'string', modelUri, fieldRange);
                
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
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should remove string-specific decorators and potentially add number-specific ones
            });

            test('should handle date type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('createdAt', 'string', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change field type from string to Date',
                    payload: {
                        field: oldField,
                        newType: 'Date',
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle relationship field type changes', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockRelationshipField('order', 'Order', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: modelUri,
                    description: 'Change relationship field type from Order to Purchase',
                    payload: {
                        field: oldField,
                        newType: 'Purchase',
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
                const fieldMeta = createMockField('field', 'string', modelUri, fieldRange);
                
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
                    assert.strictEqual(change.payload.newType, type);
                }
            });

            test('should handle array and union types', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('tags', 'string', modelUri, fieldRange);
                
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
                assert.strictEqual(change.payload.newType, 'string[]');

                // Test union type
                inputResponses[`Select a new type for 'tags'`] = 'string | number';
                change = await tool.initiateManualRefactor(context);
                assert.ok(change);
                assert.strictEqual(change.payload.newType, 'string | number');
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

function createMockField(name: string, type: string, uri: vscode.Uri, range: vscode.Range): PropertyMetadata {
    return {
        name,
        type,
        decorators: [{ 
            name: 'Field', 
            arguments: [], 
            position: new vscode.Range(range.start.line - 1, range.start.character, range.start.line - 1, range.start.character + 7) 
        }],
        declaration: { uri, range },
        references: [{ uri, range }]
    };
}

function createMockNonField(name: string, type: string, uri: vscode.Uri, range: vscode.Range): PropertyMetadata {
    return {
        name,
        type,
        decorators: [], // No Field decorator
        declaration: { uri, range },
        references: [{ uri, range }]
    };
}

function createMockRelationshipField(name: string, type: string, uri: vscode.Uri, range: vscode.Range): PropertyMetadata {
    return {
        name,
        type,
        decorators: [
            { 
                name: 'Relationship', 
                arguments: [], 
                position: new vscode.Range(range.start.line - 2, range.start.character, range.start.line - 2, range.start.character + 12) 
            },
            { 
                name: 'Field', 
                arguments: [], 
                position: new vscode.Range(range.start.line - 1, range.start.character, range.start.line - 1, range.start.character + 7) 
            }
        ],
        declaration: { uri, range },
        references: [{ uri, range }]
    };
}

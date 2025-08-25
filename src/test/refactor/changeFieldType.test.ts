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
            test('should handle valid field in entity file', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject non-field metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, range);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: range,
                    metadata: entity
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject field without Field decorator', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockNonField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect field type change when type changes', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('age', 'string', entityUri, fieldRange);
                const newField = createMockField('age', 'number', entityUri, fieldRange);
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'age': oldField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'age': newField };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'CHANGE_FIELD_TYPE');
                assert.strictEqual(changes[0].payload.newType, 'Integer');
                assert.strictEqual(changes[0].payload.field.name, 'age');
            });

            test('should detect multiple field type changes', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                
                const oldAgeField = createMockField('age', 'string', entityUri, new vscode.Range(8, 4, 8, 7));
                const oldStatusField = createMockField('status', 'string', entityUri, new vscode.Range(9, 4, 9, 10));
                
                const newAgeField = createMockField('age', 'number', entityUri, new vscode.Range(8, 4, 8, 7));
                const newStatusField = createMockField('status', 'boolean', entityUri, new vscode.Range(9, 4, 9, 10));
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'age': oldAgeField, 'status': oldStatusField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'age': newAgeField, 'status': newStatusField };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockField('name', 'string', entityUri, fieldRange);
                // Same type, just different decorator arguments
                newField.decorators = [{ 
                    name: 'Field', 
                    arguments: [{ label: 'Full Name' }], 
                    position: new vscode.Range(7, 4, 7, 17) 
                }];
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'name': oldField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'name': newField };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect changes in non-entity files', () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockNonField('value', 'string', nonEntityUri, fieldRange);
                const newField = createMockNonField('value', 'number', nonEntityUri, fieldRange);
                
                const oldNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                oldNonEntity.properties = { 'value': oldField };
                
                const newNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                newNonEntity.properties = { 'value': newField };
                
                const oldFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': oldNonEntity } };
                const newFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': newNonEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {} };
                
                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                
                // Test with non-entity files
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const nonEntityMeta: FileMetadata = { uri: nonEntityUri, classes: {} };
                assert.strictEqual(tool.analyze(nonEntityMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with valid new field type', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('age', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
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
                assert.strictEqual(change.uri?.toString(), entityUri.toString());
            });

            test('should handle user cancellation', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('age', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock user cancellation
                inputResponses[`Select a new type for 'age'`] = undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject empty field types', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('age', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock empty input
                inputResponses[`Select a new type for 'age'`] = '';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle invalid metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for field type change', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('age', 'string', entityUri, fieldRange);
                const newField = createMockField('age', 'number', entityUri, fieldRange);
                
                // Add some references
                oldField.references = [
                    { uri: entityUri, range: fieldRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 8) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 3) }
                ];

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('isActive', 'string', entityUri, fieldRange);
                
                // Add type-specific decorators that might need updating
                oldField.decorators.push({
                    name: 'StringConstraint',
                    arguments: [{ maxLength: 50 }],
                    position: new vscode.Range(6, 4, 6, 18)
                });

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('data', 'string', entityUri, fieldRange);
                
                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('score', 'string', entityUri, fieldRange);
                
                // Add string-specific decorators
                oldField.decorators.push({
                    name: 'StringConstraint',
                    arguments: [{ maxLength: 10 }],
                    position: new vscode.Range(6, 4, 6, 18)
                });


                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('createdAt', 'string', entityUri, fieldRange);

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockRelationshipField('order', 'Order', entityUri, fieldRange);

                const change: ChangeObject = {
                    type: 'CHANGE_FIELD_TYPE',
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('field', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('tags', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
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

function createMockEntity(name: string, uri: vscode.Uri, range: vscode.Range): DecoratedClass {
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
        isDataEntity: true
    };
}

function createMockNonEntity(name: string, uri: vscode.Uri, range: vscode.Range): DecoratedClass {
    return {
        name,
        decorators: [], // No Model decorator
        properties: {},
        methods: {},
        declaration: { uri, range },
        references: [{ uri, range }],
        isDataEntity: false
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

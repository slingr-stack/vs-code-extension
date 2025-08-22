import * as assert from 'assert';
import * as vscode from 'vscode';
import { RenameFieldTool } from '../../refactor/tools/renameField';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameFieldTool Tests', () => {
        
        let tool: RenameFieldTool;
        let mockCache: MetadataCache;
        let inputResponses: { [prompt: string]: string | undefined } = {};

        setup(() => {
            tool = new RenameFieldTool();
            mockCache = createMockCache();
            inputResponses = {};

            // Mock user input dialogs
            (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                const response = inputResponses[options.prompt || 'default'];
                return response;
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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.renameField');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Rename Field');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['RENAME_FIELD']);
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

            test('should reject field in non-entity files', async () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', nonEntityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonEntityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject non-field metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, range);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: range,
                    metadata: entity as any
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
            test('should detect field rename when property name changes', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const oldFieldRange = new vscode.Range(8, 4, 8, 8);
                const newFieldRange = new vscode.Range(8, 4, 8, 12);
                
                const oldField = createMockField('name', 'string', entityUri, oldFieldRange);
                const newField = createMockField('fullName', 'string', entityUri, newFieldRange);
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'name': oldField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'fullName': newField };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_FIELD');
                assert.strictEqual(changes[0].payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(changes[0].payload.newFieldMetadata.name, 'fullName');
                assert.strictEqual(changes[0].payload.entityName, 'User');
            });

            test('should not detect rename when only decorators change', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockField('name', 'string', entityUri, fieldRange);
                // Same name, just different decorator arguments
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

            test('should match fields by position for renames', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                // Multiple fields - should match by position
                const oldField1 = createMockField('firstName', 'string', entityUri, new vscode.Range(8, 4, 8, 13));
                const oldField2 = createMockField('lastName', 'string', entityUri, new vscode.Range(9, 4, 9, 12));
                
                const newField1 = createMockField('first', 'string', entityUri, new vscode.Range(8, 4, 8, 9));
                const newField2 = createMockField('last', 'string', entityUri, new vscode.Range(9, 4, 9, 8));
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'firstName': oldField1, 'lastName': oldField2 };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'first': newField1, 'last': newField2 };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                // Should match by position
                const firstNameChange = changes.find(c => c.payload.oldFieldMetadata.name === 'firstName');
                const lastNameChange = changes.find(c => c.payload.oldFieldMetadata.name === 'lastName');
                
                assert.ok(firstNameChange);
                assert.ok(lastNameChange);
                assert.strictEqual(firstNameChange.payload.newFieldMetadata.name, 'first');
                assert.strictEqual(lastNameChange.payload.newFieldMetadata.name, 'last');
            });

            test('should not detect changes in non-entity files', () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockNonField('name', 'string', nonEntityUri, fieldRange);
                const newField = createMockNonField('fullName', 'string', nonEntityUri, fieldRange);
                
                const oldNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                oldNonEntity.properties = { 'name': oldField };
                
                const newNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                newNonEntity.properties = { 'fullName': newField };
                
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
            test('should proceed with valid new field name', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock valid user input
                inputResponses['Enter new field name:'] = 'fullName';

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_FIELD');
                assert.strictEqual(change.payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(change.payload.newFieldName, 'fullName');
                assert.strictEqual(change.payload.entityName, 'User');
                assert.strictEqual(change.payload.isManual, true);
            });

            test('should handle user cancellation', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock user cancellation
                inputResponses['Enter new field name:'] = undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject invalid field names', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock invalid input (PascalCase, should be camelCase)
                inputResponses['Enter new field name:'] = 'FullName';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject empty field names', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock empty input
                inputResponses['Enter new field name:'] = '';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject same field name', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock same field name
                inputResponses['Enter new field name:'] = 'name';

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
            test('should prepare edit for field rename', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockField('fullName', 'string', entityUri, fieldRange);
                
                // Add some references
                oldField.references = [
                    { uri: entityUri, range: fieldRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: entityUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldFieldMetadata: oldField,
                        newFieldMetadata: newField,
                        newFieldName: 'fullName',
                        entityName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with no external references', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockField('fullName', 'string', entityUri, fieldRange);
                
                // Only self-reference
                oldField.references = [{ uri: entityUri, range: fieldRange }];

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: entityUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldFieldMetadata: oldField,
                        newFieldMetadata: newField,
                        newFieldName: 'fullName',
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should update decorator arguments with field name', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockField('fullName', 'string', entityUri, fieldRange);
                
                // Add decorator with field name reference
                oldField.decorators = [
                    { 
                        name: 'Field', 
                        arguments: [{ label: 'name' }], 
                        position: new vscode.Range(7, 4, 7, 17) 
                    }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: entityUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldFieldMetadata: oldField,
                        newFieldMetadata: newField,
                        newFieldName: 'fullName',
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Field Name Validation', () => {
            test('should accept valid camelCase field names', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const validNames = ['fullName', 'firstName', 'emailAddress', 'isActive', 'userId'];
                
                for (const name of validNames) {
                    inputResponses['Enter new field name:'] = name;
                    const change = await tool.initiateManualRefactor(context);
                    assert.ok(change, `Should accept valid field name: ${name}`);
                    assert.strictEqual(change.payload.newFieldName, name);
                }
            });

            test('should reject invalid field names', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const invalidNames = ['FullName', 'FULL_NAME', 'full-name', 'full name', '123name', 'class'];
                
                for (const name of invalidNames) {
                    inputResponses['Enter new field name:'] = name;
                    const change = await tool.initiateManualRefactor(context);
                    assert.strictEqual(change, undefined, `Should reject invalid field name: ${name}`);
                }
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

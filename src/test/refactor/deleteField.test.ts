import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeleteFieldTool } from '../../refactor/tools/deleteField';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('DeleteFieldTool Tests', () => {
        
        let tool: DeleteFieldTool;
        let mockCache: MetadataCache;
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new DeleteFieldTool();
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
            test('should detect field deletion when property is removed', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = createMockField('name', 'string', entityUri, fieldRange);
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'name': field, 'email': createMockField('email', 'string', entityUri, new vscode.Range(9, 4, 9, 9)) };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'email': createMockField('email', 'string', entityUri, new vscode.Range(9, 4, 9, 9)) };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_FIELD');
                assert.strictEqual(changes[0].payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(changes[0].payload.entityName, 'User');
            });

            test('should detect multiple field deletions', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                
                const nameField = createMockField('name', 'string', entityUri, new vscode.Range(8, 4, 8, 8));
                const emailField = createMockField('email', 'string', entityUri, new vscode.Range(9, 4, 9, 9));
                const ageField = createMockField('age', 'number', entityUri, new vscode.Range(10, 4, 10, 7));
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'name': nameField, 'email': emailField, 'age': ageField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'email': emailField }; // Only email remains
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                const nameChange = changes.find(c => c.payload.oldFieldMetadata.name === 'name');
                const ageChange = changes.find(c => c.payload.oldFieldMetadata.name === 'age');
                
                assert.ok(nameChange);
                assert.ok(ageChange);
                assert.strictEqual(nameChange?.payload.entityName, 'User');
                assert.strictEqual(ageChange?.payload.entityName, 'User');
            });

            test('should not detect deletions in non-entity files', () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = createMockNonField('name', 'string', nonEntityUri, fieldRange);
                
                const oldNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                oldNonEntity.properties = { 'name': field };
                
                const newNonEntity = createMockNonEntity('Helper', nonEntityUri, new vscode.Range(5, 0, 5, 6));
                newNonEntity.properties = {}; // Field removed
                
                const oldFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': oldNonEntity } };
                const newFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': newNonEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect deletion when only decorators are removed', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('name', 'string', entityUri, fieldRange);
                const newField = createMockNonField('name', 'string', entityUri, fieldRange); // Same field but no @Field decorator
                
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                oldEntity.properties = { 'name': oldField };
                
                const newEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                newEntity.properties = { 'name': newField };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0); // Property still exists, just not a field anymore
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
            test('should proceed with user confirmation', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
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
                assert.strictEqual(change.payload.oldFieldMetadata.name, 'name');
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
                (vscode.window as any).showWarningMessage = async () => undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle non-confirmation response', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = createMockField('name', 'string', entityUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock different response
                (vscode.window as any).showWarningMessage = async () => 'Cancel';

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
            test('should prepare edit for field deletion', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = createMockField('name', 'string', entityUri, fieldRange);
                
                // Add some external references
                field.references = [
                    { uri: entityUri, range: fieldRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                ];

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: entityUri,
                    description: 'Delete field name from User entity',
                    payload: {
                        oldFieldMetadata: field,
                        entityName: 'User',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with relationship decorators', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const relationshipField = createMockRelationshipField('order', 'Order', entityUri, fieldRange);

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: entityUri,
                    description: 'Delete relationship field order from User entity',
                    payload: {
                        oldFieldMetadata: relationshipField,
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with no external references', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = createMockField('name', 'string', entityUri, fieldRange);
                
                // Only self-reference
                field.references = [{ uri: entityUri, range: fieldRange }];

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: entityUri,
                    description: 'Delete field name from User entity',
                    payload: {
                        oldFieldMetadata: field,
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Related Field Cleanup', () => {
            test('should clean up related fields in other entities', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const field = createMockField('name', 'string', entityUri, fieldRange);

                // Create another entity with a field that might reference this one
                const orderEntity = createMockEntity('Order', vscode.Uri.file('/test/src/data/entities/Order.ts'), new vscode.Range(5, 0, 5, 5));
                orderEntity.properties = {
                    'userRef': createMockRelationshipField('userRef', 'User', orderEntity.declaration.uri, new vscode.Range(8, 4, 8, 11))
                };

                // Setup mock cache to return related entities
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderEntity)) {
                        results.push(orderEntity);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: entityUri,
                    description: 'Delete field name from User entity',
                    payload: {
                        oldFieldMetadata: field,
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field deletion with reverse relationship cleanup', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                // Create a relationship field being deleted
                const relationshipField = createMockRelationshipField('orders', 'Order', entityUri, fieldRange);
                relationshipField.decorators.push({
                    name: 'ReverseRelationship',
                    arguments: [{ value: 'user' }],
                    position: new vscode.Range(7, 4, 7, 21)
                });

                // Create the reverse entity
                const orderEntity = createMockEntity('Order', vscode.Uri.file('/test/src/data/entities/Order.ts'), new vscode.Range(5, 0, 5, 5));
                orderEntity.properties = {
                    'user': createMockRelationshipField('user', 'User', orderEntity.declaration.uri, new vscode.Range(8, 4, 8, 8))
                };

                // Setup mock cache
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderEntity)) {
                        results.push(orderEntity);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_FIELD',
                    uri: entityUri,
                    description: 'Delete relationship field orders from User entity',
                    payload: {
                        oldFieldMetadata: relationshipField,
                        entityName: 'User'
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
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

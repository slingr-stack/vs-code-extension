import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeleteEntityTool } from '../../refactor/tools/deleteEntity';
import { MetadataCache, FileMetadata, DecoratedClass } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('DeleteEntityTool Tests', () => {
        
        let tool: DeleteEntityTool;
        let mockCache: MetadataCache;
        let confirmationResponses: { [message: string]: string | undefined } = {};

        setup(() => {
            tool = new DeleteEntityTool();
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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.deleteEntity');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Delete Entity');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['DELETE_ENTITY']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid entity in entity file', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject non-entity files', async () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('Helper', nonEntityUri, range);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonEntityUri,
                    range: range,
                    metadata: entity
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject non-entity metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const nonEntity = {
                    name: 'NotAnEntity',
                    decorators: [],
                    properties: {},
                    methods: {},
                    declaration: { uri: entityUri, range },
                    references: [],
                    isDataEntity: false
                };
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: range,
                    metadata: nonEntity as any
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect entity deletion when file is deleted', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': entity } };
                
                // newFileMeta is undefined (file deleted)
                const changes = tool.analyze(oldFileMeta, undefined);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_ENTITY');
                assert.strictEqual(changes[0].payload.oldEntityMetadata.name, 'User');
                assert.ok(Array.isArray(changes[0].payload.urisToDelete));
                assert.ok(changes[0].payload.urisToDelete.length > 0);
            });

            test('should detect entity deletion when entity class is removed', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': entity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: {} }; // Entity removed from file
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_ENTITY');
                assert.strictEqual(changes[0].payload.oldEntityMetadata.name, 'User');
            });

            test('should not detect deletion in non-entity files', () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const nonEntity = createMockNonEntity('Helper', nonEntityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': nonEntity } };
                
                const changes = tool.analyze(oldFileMeta, undefined);
                assert.strictEqual(changes.length, 0);
            });

            test('should include related directories in deletion list', () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': entity } };
                
                const changes = tool.analyze(oldFileMeta, undefined);
                
                assert.strictEqual(changes.length, 1);
                const urisToDelete = changes[0].payload.urisToDelete as vscode.Uri[];
                
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
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock user confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the entity')) {
                        return 'Yes, Delete All';
                    }
                    return items[0];
                };

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_ENTITY');
                assert.strictEqual(change.payload.oldEntityMetadata.name, 'User');
                assert.strictEqual(change.payload.isManual, true);
                assert.ok(Array.isArray(change.payload.urisToDelete));
            });

            test('should handle user cancellation', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock user cancellation
                (vscode.window as any).showWarningMessage = async () => undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle non-confirmation response', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock different response
                (vscode.window as any).showWarningMessage = async () => 'Cancel';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle invalid metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for entity deletion', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                // Add some external references
                entity.references = [
                    { uri: entityUri, range: entityRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                ];

                const change: ChangeObject = {
                    type: 'DELETE_ENTITY',
                    uri: entityUri,
                    description: 'Delete User entity',
                    payload: {
                        oldEntityMetadata: entity,
                        urisToDelete: [entityUri],
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle entity with relationship cleanup', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);

                // Setup mock cache with other entities that might reference this one
                const otherEntity = createMockEntity('Order', vscode.Uri.file('/test/src/data/entities/Order.ts'), new vscode.Range(5, 0, 5, 5));
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(otherEntity)) {
                        results.push(otherEntity);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_ENTITY',
                    uri: entityUri,
                    description: 'Delete User entity',
                    payload: {
                        oldEntityMetadata: entity,
                        urisToDelete: [entityUri]
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle entity with no external references', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                // Only self-reference
                entity.references = [{ uri: entityUri, range: entityRange }];

                const change: ChangeObject = {
                    type: 'DELETE_ENTITY',
                    uri: entityUri,
                    description: 'Delete User entity',
                    payload: {
                        oldEntityMetadata: entity,
                        urisToDelete: [entityUri]
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Relationship Field Cleanup', () => {
            test('should identify and clean relationship fields', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);

                // Create an entity with a relationship field pointing to User
                const orderEntity = createMockEntity('Order', vscode.Uri.file('/test/src/data/entities/Order.ts'), new vscode.Range(5, 0, 5, 5));
                orderEntity.properties = {
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
                        declaration: { uri: orderEntity.declaration.uri, range: new vscode.Range(10, 4, 10, 8) },
                        references: []
                    }
                };

                // Setup mock cache to return the order entity
                (mockCache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderEntity)) {
                        results.push(orderEntity);
                    }
                    return results;
                };

                const change: ChangeObject = {
                    type: 'DELETE_ENTITY',
                    uri: entityUri,
                    description: 'Delete User entity',
                    payload: {
                        oldEntityMetadata: entity,
                        urisToDelete: [entityUri]
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // The workspace edit should include removal of relationship decorators
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

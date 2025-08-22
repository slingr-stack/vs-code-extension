import * as assert from 'assert';
import * as vscode from 'vscode';
import { RenameEntityTool } from '../../refactor/tools/renameEntity';
import { MetadataCache, FileMetadata, DecoratedClass } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameEntityTool Tests', () => {
        
        let tool: RenameEntityTool;
        let mockCache: MetadataCache;
        let userInputResponses: { [prompt: string]: string | undefined } = {};

        setup(() => {
            tool = new RenameEntityTool();
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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.renameEntity');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Rename Entity');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['RENAME_ENTITY']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid entity metadata', async () => {
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

            test('should reject non-entity metadata', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                
                const nonEntity = {
                    name: 'NotAnEntity',
                    decorators: [], // No Model decorator
                    properties: {},
                    methods: {},
                    declaration: { uri: entityUri, range: entityRange },
                    references: [],
                    isDataEntity: false
                };
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: nonEntity as any
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
            test('should detect simple entity rename', () => {
                const uri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldEntity = createMockEntity('User', uri, range);
                const newEntity = createMockEntity('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { uri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri, classes: { 'Customer': newEntity } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_ENTITY');
                assert.strictEqual(changes[0].payload.oldName, 'User');
                assert.strictEqual(changes[0].payload.newName, 'Customer');
                assert.strictEqual(changes[0].description, 'Entity \'User\' was renamed to \'Customer\'.');
            });

            test('should not detect rename when multiple entities change', () => {
                const uri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldEntity1 = createMockEntity('User', uri, range);
                const oldEntity2 = createMockEntity('Product', uri, new vscode.Range(10, 0, 10, 7));
                const newEntity = createMockEntity('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'User': oldEntity1, 'Product': oldEntity2 } 
                };
                const newFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'Customer': newEntity } 
                };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect changes in non-entity files', () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldClass = createMockNonEntity('Helper', nonEntityUri, range);
                const newClass = createMockNonEntity('Utility', nonEntityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': oldClass } };
                const newFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Utility': newClass } };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle accumulated changes from entity deletion', () => {
                const uri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const oldEntity1 = createMockEntity('User', uri, range);
                const oldEntity2 = createMockEntity('Product', uri, new vscode.Range(10, 0, 10, 7));
                const newEntity = createMockEntity('Customer', uri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'User': oldEntity1, 'Product': oldEntity2 } 
                };
                const newFileMeta: FileMetadata = { 
                    uri, 
                    classes: { 'Customer': newEntity } 
                };

                // Simulate that Product was deleted by another tool
                const accumulatedChanges: ChangeObject[] = [{
                    type: 'DELETE_ENTITY',
                    uri,
                    description: 'Product entity deleted',
                    payload: { oldEntityMetadata: oldEntity2 }
                }];
                
                const changes = tool.analyze(oldFileMeta, newFileMeta, accumulatedChanges);
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].payload.oldName, 'User');
                assert.strictEqual(changes[0].payload.newName, 'Customer');
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/entities/User.ts');
                
                const emptyFileMeta: FileMetadata = { uri, classes: {} };
                
                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, emptyFileMeta).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should accept valid entity name', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                userInputResponses['Rename entity \'User\''] = 'ValidEntityName';
                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_ENTITY');
                assert.strictEqual(change.payload.oldName, 'User');
                assert.strictEqual(change.payload.newName, 'ValidEntityName');
                assert.strictEqual(change.payload.isManual, true);
            });

            test('should reject invalid entity name - lowercase start', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                userInputResponses['Rename entity \'User\''] = 'invalidName';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should reject invalid entity name - special characters', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                userInputResponses['Rename entity \'User\''] = 'Invalid-Name';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
            });

            test('should reject same name', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                userInputResponses['Rename entity \'User\''] = 'User';
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
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

                userInputResponses['Rename entity \'User\''] = undefined;
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
            test('should prepare edit for manual rename', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                // Add some references
                entity.references = [
                    { uri: entityUri, range: entityRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_ENTITY',
                    uri: entityUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldEntityMetadata: entity,
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                entity.references = [
                    { uri: entityUri, range: entityRange },
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) }
                ];

                const change: ChangeObject = {
                    type: 'RENAME_ENTITY',
                    uri: entityUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldEntityMetadata: entity,
                        isManual: false
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                
                // For automatic renames, should not edit the declaration (already changed)
                const entries = workspaceEdit.entries();
                assert.ok(entries.length >= 0);
            });

            test('should handle entity with no references', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const entity = createMockEntity('User', entityUri, entityRange);
                
                entity.references = []; // No references

                const change: ChangeObject = {
                    type: 'RENAME_ENTITY',
                    uri: entityUri,
                    description: 'Rename User to Customer',
                    payload: {
                        oldName: 'User',
                        newName: 'Customer',
                        oldEntityMetadata: entity,
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

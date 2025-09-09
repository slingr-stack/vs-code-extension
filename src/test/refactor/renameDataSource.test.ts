import * as assert from 'assert';
import * as vscode from 'vscode';
import { RenameDataSourceTool } from '../../refactor/tools/renameDataSource';
import { MetadataCache, FileMetadata, DataSourceMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, RenameDataSourcePayload } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameDataSourceTool Tests', () => {
        
        let tool: RenameDataSourceTool;
        let mockCache: MetadataCache;

        setup(() => {
            tool = new RenameDataSourceTool();
            mockCache = createMockCache();

            // Mock input dialogs
            (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                // Default behavior for tests - can be overridden per test
                if (options.value) {
                    return options.value + 'New';
                }
                return 'newDataSource';
            };

            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };
        });

        suite('Tool Metadata', () => {
            test('should provide correct command ID', () => {
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.renameDataSource');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Rename Data Source');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['RENAME_DATA_SOURCE']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid data source file', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Mock the cache to return file metadata with data source
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: dataSourceUri,
                    range: dataSourceRange,
                    metadata: dataSource
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject file without data sources', async () => {
                const nonDataSourceUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                // Mock the cache to return file metadata without data sources
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === nonDataSourceUri.fsPath) {
                        return { uri: nonDataSourceUri, classes: {}, dataSources: {} };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonDataSourceUri,
                    range: range,
                    metadata: undefined
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject file not in cache', async () => {
                const unknownUri = vscode.Uri.file('/test/src/unknown.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                // Mock the cache to return undefined for unknown files
                (mockCache as any).getMetadataForFile = () => undefined;

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: unknownUri,
                    range: range,
                    metadata: undefined
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect data source rename', () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const range = new vscode.Range(3, 0, 3, 6);
                const oldDataSource = createMockDataSource('userDb', dataSourceUri, range);
                const newDataSource = createMockDataSource('userDatabase', dataSourceUri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: { 'userDb': oldDataSource } 
                };
                
                const newFileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: { 'userDatabase': newDataSource } 
                };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_DATA_SOURCE');
                
                const payload = changes[0].payload as RenameDataSourcePayload;
                assert.strictEqual(payload.oldName, 'userDb');
                assert.strictEqual(payload.newName, 'userDatabase');
                assert.strictEqual(payload.isManual, false);
                assert.ok(payload.newUri);
            });

            test('should not detect rename when no changes occur', () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const range = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, range);
                
                const fileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: { 'userDb': dataSource } 
                };

                const changes = tool.analyze(fileMeta, fileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {}, dataSources: {} };

                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, emptyFileMeta).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with valid new name', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Mock the cache to return file metadata with data source
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: dataSourceUri,
                    range: dataSourceRange,
                    metadata: dataSource
                };

                // Mock user input
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    return 'userDatabase';
                };

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_DATA_SOURCE');
                
                const payload = change.payload as RenameDataSourcePayload;
                assert.strictEqual(payload.oldName, 'userDb');
                assert.strictEqual(payload.newName, 'userDatabase');
                assert.strictEqual(payload.isManual, true);
                assert.ok(payload.newUri);
            });

            test('should handle user cancellation', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Mock the cache to return file metadata with data source
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: dataSourceUri,
                    range: dataSourceRange,
                    metadata: dataSource
                };

                // Mock user cancellation
                (vscode.window as any).showInputBox = async () => undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle same name input', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Mock the cache to return file metadata with data source
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: dataSourceUri,
                    range: dataSourceRange,
                    metadata: dataSource
                };

                // Mock user input with same name
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    return 'userDb'; // Same as original name
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should validate input name', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Mock the cache to return file metadata with data source
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: dataSourceUri,
                    range: dataSourceRange,
                    metadata: dataSource
                };

                // Test the validation function by calling it directly
                let capturedValidation: any;
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    capturedValidation = options.validateInput;
                    return 'validNewName';
                };

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.ok(capturedValidation, 'Validation function should be captured');

                // Test various invalid inputs
                assert.strictEqual(capturedValidation(''), 'Data source name cannot be empty');
                assert.strictEqual(capturedValidation('invalid-name'), 'Invalid data source name. Only alphanumeric characters and underscores are allowed.');
                assert.strictEqual(capturedValidation('invalid name'), 'Invalid data source name. Only alphanumeric characters and underscores are allowed.');
                assert.strictEqual(capturedValidation('invalid.name'), 'Invalid data source name. Only alphanumeric characters and underscores are allowed.');

                // Test valid names
                assert.strictEqual(capturedValidation('validName'), null);
                assert.strictEqual(capturedValidation('valid_name'), null);
                assert.strictEqual(capturedValidation('validName123'), null);
                
                const payload = change.payload as RenameDataSourcePayload;
                assert.strictEqual(payload.newName, 'validNewName');
            });

            test('should handle file without data sources', async () => {
                const nonDataSourceUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                // Mock the cache to return file metadata without data sources
                (mockCache as any).getMetadataForFile = () => undefined;

                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonDataSourceUri,
                    range: range,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for data source rename', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Add some references
                dataSource.references = [
                    { uri: dataSourceUri, range: dataSourceRange }, // Declaration
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 11) },
                    { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 6) }
                ];

                // Mock the cache to return file metadata
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const change: ChangeObject = {
                    type: 'RENAME_DATA_SOURCE',
                    uri: dataSourceUri,
                    description: "Rename data source 'userDb' to 'userDatabase'",
                    payload: {
                        oldName: 'userDb',
                        newName: 'userDatabase',
                        newUri: vscode.Uri.joinPath(dataSourceUri, '..', 'userDatabase.ts'),
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle automatic rename (no declaration change)', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);
                
                // Add some references
                dataSource.references = [
                    { uri: dataSourceUri, range: dataSourceRange }, // Declaration
                    { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 11) }
                ];

                // Mock the cache to return file metadata
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const change: ChangeObject = {
                    type: 'RENAME_DATA_SOURCE',
                    uri: dataSourceUri,
                    description: "Rename data source 'userDb' to 'userDatabase'",
                    payload: {
                        oldName: 'userDb',
                        newName: 'userDatabase',
                        newUri: vscode.Uri.joinPath(dataSourceUri, '..', 'userDatabase.ts'),
                        isManual: false // Automatic rename
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should update references but not the declaration itself
            });

            test('should rename file when data source name changes', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, dataSourceRange);

                // Mock the cache to return file metadata
                (mockCache as any).getMetadataForFile = (path: string) => {
                    if (path === dataSourceUri.fsPath) {
                        return { uri: dataSourceUri, classes: {}, dataSources: { 'userDb': dataSource } };
                    }
                    return undefined;
                };

                const change: ChangeObject = {
                    type: 'RENAME_DATA_SOURCE',
                    uri: dataSourceUri,
                    description: "Rename data source 'userDb' to 'userDatabase'",
                    payload: {
                        oldName: 'userDb',
                        newName: 'userDatabase',
                        newUri: vscode.Uri.joinPath(dataSourceUri, '..', 'userDatabase.ts'),
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should include file rename operation
            });

            test('should handle missing data source metadata', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');

                // Mock the cache to return no metadata
                (mockCache as any).getMetadataForFile = () => undefined;

                const change: ChangeObject = {
                    type: 'RENAME_DATA_SOURCE',
                    uri: dataSourceUri,
                    description: "Rename data source 'userDb' to 'userDatabase'",
                    payload: {
                        oldName: 'userDb',
                        newName: 'userDatabase',
                        newUri: vscode.Uri.joinPath(dataSourceUri, '..', 'userDatabase.ts'),
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should return empty workspace edit
            });

            test('should handle wrong change type', async () => {
                const change: ChangeObject = {
                    type: 'RENAME_MODEL' as any,
                    uri: vscode.Uri.file('/test/file.ts'),
                    description: 'Wrong type',
                    payload: {} as any
                };

                try {
                    await tool.prepareEdit(change, mockCache);
                    assert.fail('Should have thrown an error');
                } catch (error) {
                    assert.ok(error instanceof Error);
                    assert.ok(error.message.includes('can only handle RENAME_DATA_SOURCE'));
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

function createMockDataSource(name: string, uri: vscode.Uri, range: vscode.Range): DataSourceMetadata {
    return {
        name,
        type: 'TypeOrmSqlDataSource',
        declaration: { uri, range },
        references: [{ uri, range }]
    };
}

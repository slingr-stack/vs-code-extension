import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeleteDataSourceTool } from '../../refactor/tools/deleteDataSource';
import { MetadataCache, FileMetadata, DataSourceMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, DeleteDataSourcePayload } from '../../refactor/refactorInterfaces';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('DeleteDataSourceTool Tests', () => {
        
        let tool: DeleteDataSourceTool;
        let mockCache: MetadataCache;

        setup(() => {
            tool = new DeleteDataSourceTool();
            mockCache = createMockCache();

            // Mock confirmation dialogs
            (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                return items[0]; // Default to first option
            };

            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };
        });

        suite('Tool Metadata', () => {
            test('should provide correct command ID', () => {
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.deleteDataSource');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Delete Data Source');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['DELETE_DATA_SOURCE']);
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
            test('should detect data source deletion when file is deleted', () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const range = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: { 'userDb': dataSource } 
                };
                
                // newFileMeta is undefined (file deleted)
                const changes = tool.analyze(oldFileMeta, undefined);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_DATA_SOURCE');
                
                const payload = changes[0].payload as DeleteDataSourcePayload;
                assert.strictEqual(payload.dataSourceName, 'userDb');
                assert.strictEqual(payload.isManual, false);
                assert.ok(Array.isArray(payload.urisToDelete));
                assert.strictEqual(payload.urisToDelete.length, 1);
                assert.strictEqual(payload.urisToDelete[0].fsPath, dataSourceUri.fsPath);
            });

            test('should not detect deletion when file still exists', () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const range = new vscode.Range(3, 0, 3, 6);
                const dataSource = createMockDataSource('userDb', dataSourceUri, range);
                
                const oldFileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: { 'userDb': dataSource } 
                };
                
                const newFileMeta: FileMetadata = { 
                    uri: dataSourceUri, 
                    classes: {}, 
                    dataSources: {} // Data source removed from file but file exists
                };

                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should not detect deletion in files without data sources', () => {
                const regularUri = vscode.Uri.file('/test/src/utils/helper.ts');
                
                const oldFileMeta: FileMetadata = { 
                    uri: regularUri, 
                    classes: {}, 
                    dataSources: {} 
                };
                
                const changes = tool.analyze(oldFileMeta, undefined);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {}, dataSources: {} };

                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with user confirmation', async () => {
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

                // Mock user confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the data source')) {
                        return 'Yes, Delete';
                    }
                    return items[0];
                };

                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_DATA_SOURCE');
                
                const payload = change.payload as DeleteDataSourcePayload;
                assert.strictEqual(payload.dataSourceName, 'userDb');
                assert.strictEqual(payload.isManual, true);
                assert.ok(Array.isArray(payload.urisToDelete));
                assert.strictEqual(payload.urisToDelete.length, 1);
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

            test('should handle different confirmation response', async () => {
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

                // Mock different response (not the confirmation)
                (vscode.window as any).showWarningMessage = async () => 'Cancel';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for data source deletion', async () => {
                const dataSourceUri = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceRange = new vscode.Range(3, 0, 3, 6);
                
                const change: ChangeObject = {
                    type: 'DELETE_DATA_SOURCE',
                    uri: dataSourceUri,
                    description: 'Delete userDb data source',
                    payload: {
                        dataSourceName: 'userDb',
                        urisToDelete: [dataSourceUri],
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // The workspace edit should delete the file
            });

            test('should prepare edit for multiple files deletion', async () => {
                const dataSourceUri1 = vscode.Uri.file('/test/src/dataSources/userDb.ts');
                const dataSourceUri2 = vscode.Uri.file('/test/src/dataSources/logDb.ts');
                
                const change: ChangeObject = {
                    type: 'DELETE_DATA_SOURCE',
                    uri: dataSourceUri1,
                    description: 'Delete data sources',
                    payload: {
                        dataSourceName: 'userDb',
                        urisToDelete: [dataSourceUri1, dataSourceUri2],
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
                // Should have entries for file deletions
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
        references: [{ uri, range }],
        options: {}
    };
}

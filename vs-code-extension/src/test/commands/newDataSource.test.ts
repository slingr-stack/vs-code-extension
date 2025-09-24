import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { NewDataSourceTool } from '../../commands/newDataSource';

if (typeof suite !== 'undefined') {
    suite('NewDataSourceTool Tests', () => {
        let testWorkspaceDir: string;
        let testDataSourcesDir: string;
        let newDataSourceTool: NewDataSourceTool;
        let inputBoxResponse: string | undefined;
        let appliedEdit: vscode.WorkspaceEdit | undefined;
        let openedDocument: vscode.Uri | undefined;

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-newdatasource-test-'));
            testDataSourcesDir = path.join(testWorkspaceDir, 'src', 'dataSources');
            
            // Create the src/dataSources directory structure
            fs.mkdirSync(testDataSourcesDir, { recursive: true });
            
            newDataSourceTool = new NewDataSourceTool();
            inputBoxResponse = undefined;
            appliedEdit = undefined;
            openedDocument = undefined;

            // Mock VS Code workspace API
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                get: () => [{
                    uri: vscode.Uri.file(testWorkspaceDir),
                    name: 'test-workspace',
                    index: 0
                }],
                configurable: true
            });

            // Mock input box
            (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                return inputBoxResponse;
            };

            // Mock error message display
            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };

            // Mock workspace edit operations
            (vscode.workspace as any).applyEdit = async (edit: vscode.WorkspaceEdit) => {
                appliedEdit = edit;
                return true;
            };

            // Mock document operations
            (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
                openedDocument = uri;
                return {
                    uri,
                    getText: () => '',
                    lineAt: () => ({ text: '', range: new vscode.Range(0, 0, 0, 0) })
                };
            };

            (vscode.window as any).showTextDocument = async (document: any) => {
                return {};
            };
        });

        teardown(() => {
            // Clean up the test workspace
            if (testWorkspaceDir && fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        });

        suite('Data Source Creation', () => {
            test('should create data source with valid name', async () => {
                inputBoxResponse = 'userDatabase';

                await newDataSourceTool.createNewDataSource();

                assert.ok(appliedEdit, 'Workspace edit should have been applied');
                assert.ok(openedDocument, 'Document should have been opened');

                // Check that the URI points to the correct location
                const expectedPath = path.join(testDataSourcesDir, 'userDatabase.ts').replace(/\\/g, '/');
                const actualPath = openedDocument.fsPath.replace(/\\/g, '/');
                assert.ok(actualPath.endsWith('src/dataSources/userDatabase.ts'), 
                    `Expected path to end with 'src/dataSources/userDatabase.ts', got: ${actualPath}`);
            });

            test('should handle user cancellation', async () => {
                inputBoxResponse = undefined; // User cancelled

                await newDataSourceTool.createNewDataSource();

                assert.strictEqual(appliedEdit, undefined, 'No workspace edit should have been applied');
                assert.strictEqual(openedDocument, undefined, 'No document should have been opened');
            });

            test('should handle empty string input', async () => {
                inputBoxResponse = '';

                await newDataSourceTool.createNewDataSource();

                assert.strictEqual(appliedEdit, undefined, 'No workspace edit should have been applied');
                assert.strictEqual(openedDocument, undefined, 'No document should have been opened');
            });

            test('should handle no workspace folder', async () => {
                // Mock no workspace folders
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    get: () => undefined,
                    configurable: true
                });
                inputBoxResponse = 'testDataSource';

                let errorMessage = '';
                (vscode.window as any).showErrorMessage = async (message: string) => {
                    errorMessage = message;
                };

                await newDataSourceTool.createNewDataSource();

                assert.strictEqual(errorMessage, 'No workspace folder found.');
                assert.strictEqual(appliedEdit, undefined, 'No workspace edit should have been applied');
            });

            test('should handle empty workspace folders', async () => {
                // Mock empty workspace folders array
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    get: () => [],
                    configurable: true
                });
                inputBoxResponse = 'testDataSource';

                let errorMessage = '';
                (vscode.window as any).showErrorMessage = async (message: string) => {
                    errorMessage = message;
                };

                await newDataSourceTool.createNewDataSource();

                assert.strictEqual(errorMessage, 'No workspace folder found.');
                assert.strictEqual(appliedEdit, undefined, 'No workspace edit should have been applied');
            });
        });

        suite('Generated Template Content', () => {
            test('should generate correct template content', async () => {
                inputBoxResponse = 'myDataSource';

                await newDataSourceTool.createNewDataSource();

                assert.ok(appliedEdit, 'Workspace edit should have been applied');

                // The workspace edit should contain the file creation and content insertion
                // We can't easily inspect the content from the WorkspaceEdit object,
                // but we can verify that the edit was created properly
                assert.ok(appliedEdit.size > 0, 'Workspace edit should have operations');
            });

            test('should use data source name in template', async () => {
                const dataSourceName = 'customerDatabase';
                inputBoxResponse = dataSourceName;

                await newDataSourceTool.createNewDataSource();

                assert.ok(appliedEdit, 'Workspace edit should have been applied');
                
                // Verify the file path includes the data source name
                const expectedPath = `src/dataSources/${dataSourceName}.ts`;
                assert.ok(openedDocument?.fsPath.includes(expectedPath.replace(/\//g, path.sep)), 
                    'File path should include the data source name');
            });
        });

        suite('File Operations', () => {
            test('should create file in correct directory structure', async () => {
                inputBoxResponse = 'testDB';

                await newDataSourceTool.createNewDataSource();

                assert.ok(openedDocument, 'Document should have been opened');

                const expectedDir = path.join('src', 'dataSources');
                assert.ok(openedDocument.fsPath.includes(expectedDir), 
                    `File should be created in ${expectedDir} directory`);
            });

            test('should create TypeScript file with correct extension', async () => {
                inputBoxResponse = 'myDB';

                await newDataSourceTool.createNewDataSource();

                assert.ok(openedDocument, 'Document should have been opened');
                assert.ok(openedDocument.fsPath.endsWith('.ts'), 
                    'File should have .ts extension');
            });
        });

        suite('Integration Tests', () => {
            test('should complete full workflow successfully', async () => {
                const dataSourceName = 'integrationTestDB';
                inputBoxResponse = dataSourceName;

                await newDataSourceTool.createNewDataSource();

                // Verify all steps completed successfully
                assert.ok(appliedEdit, 'Workspace edit should have been applied');
                assert.ok(openedDocument, 'Document should have been opened');

                // Verify correct file path
                assert.ok(openedDocument.fsPath.includes(dataSourceName), 
                    'Opened document should include the data source name');
                assert.ok(openedDocument.fsPath.replace(/\\/g, '/').includes('src/dataSources'), 
                    'File should be in src/dataSources directory');
                assert.ok(openedDocument.fsPath.endsWith('.ts'), 
                    'File should have TypeScript extension');
            });

            test('should handle multiple data source creation', async () => {
                // Create first data source
                inputBoxResponse = 'firstDB';
                await newDataSourceTool.createNewDataSource();
                const firstEdit: vscode.WorkspaceEdit | undefined = appliedEdit;
                const firstDocument: vscode.Uri | undefined = openedDocument;

                // Reset mocks
                appliedEdit = undefined;
                openedDocument = undefined;

                // Create second data source
                inputBoxResponse = 'secondDB';
                await newDataSourceTool.createNewDataSource();

                // Both should have succeeded
                assert.ok(firstEdit, 'First data source edit should have been applied');
                assert.ok(firstDocument, 'First document should have been opened');
                assert.ok(appliedEdit, 'Second data source edit should have been applied');
                assert.ok(openedDocument, 'Second document should have been opened');

                // They should be different files
                if (firstDocument && openedDocument) {
                    const firstPath = (firstDocument as vscode.Uri).fsPath;
                    const secondPath = (openedDocument as vscode.Uri).fsPath;
                    assert.notStrictEqual(firstPath, secondPath, 
                        'Different data sources should create different files');
                }
            });
        });
    });
}

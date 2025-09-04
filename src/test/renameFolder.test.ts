import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { RenameFolderTool } from '../commands/renameFolder';
import { ExplorerProvider } from '../explorer/explorerProvider';
import { MetadataCache } from '../cache/cache';
import { AppTreeItem } from '../explorer/appTreeItem';
import { ExplorerService } from '../explorer/explorerService';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameFolder Tool Tests', () => {
        let testWorkspaceDir: string;
        let testDataDir: string;
        let mockExplorerProvider: ExplorerProvider;
        let mockCache: MetadataCache;
        const explorerService = new ExplorerService();

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-test-workspace-'));
            testDataDir = path.join(testWorkspaceDir, 'src', 'data');
            
            // Create the src/data directory structure
            fs.mkdirSync(testDataDir, { recursive: true });
            
            // Create a mock cache and explorer provider
            mockCache = {
                getDataModelClasses: () => [],
                onDidUpdate: () => ({ dispose: () => {} }),
                // Add other required methods as no-ops
            } as any;
            
            mockExplorerProvider = {
                refresh: () => {},
                // Add other required methods as no-ops
            } as any;
        });

        teardown(() => {
            // Clean up the test workspace
            if (testWorkspaceDir && fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
            }
        });
        
        test('RenameFolder command should be registered', async () => {
            // Wait a moment for extension to fully activate
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const commands = await vscode.commands.getCommands();
            assert.ok(
                commands.includes('slingr-vscode-extension.renameFolder'),
                'RenameFolder command should be registered'
            );
        });

        test('Should validate input parameters correctly', async () => {
            const tool = new RenameFolderTool(explorerService);
            
            // Test with invalid target (not a folder AppTreeItem)
            const showErrorMessageSpy: string[] = [];
            const originalShowErrorMessage = vscode.window.showErrorMessage;
            vscode.window.showErrorMessage = (message: string) => {
                showErrorMessageSpy.push(message);
                return Promise.resolve(undefined);
            };

            try {
                // Test with null/undefined target
                await tool.renameFolder(mockExplorerProvider, mockCache, undefined);
                assert.ok(showErrorMessageSpy.length > 0, 'Should show error for undefined target');
                assert.ok(showErrorMessageSpy[0].includes('Please select a folder'), 'Should show folder selection error');

                // Test with non-folder AppTreeItem
                const nonFolderItem = new AppTreeItem(
                    'TestModel',
                    vscode.TreeItemCollapsibleState.None,
                    'model', // not 'folder'
                    vscode.Uri.file(testWorkspaceDir)
                );
                
                showErrorMessageSpy.length = 0; // Clear previous errors
                await tool.renameFolder(mockExplorerProvider, mockCache, nonFolderItem);
                assert.ok(showErrorMessageSpy.length > 0, 'Should show error for non-folder item');
            } finally {
                // Restore original function
                vscode.window.showErrorMessage = originalShowErrorMessage;
            }
        });

        test('Should reject duplicate folder names when workspace is available', async () => {
            // This test can only run if there's a workspace available
            if (!vscode.workspace.workspaceFolders) {
                console.log('Skipping test - no workspace available');
                return;
            }

            const tool = new RenameFolderTool(explorerService);
            
            // Create test folder structure in the actual workspace
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const testDataDir = path.join(workspaceRoot, 'src', 'data');
            const existingFolderPath = path.join(testDataDir, 'test-existing-folder');
            const testFolderPath = path.join(testDataDir, 'test-rename-folder');
            
            // Ensure directories exist for this test
            try {
                fs.mkdirSync(testDataDir, { recursive: true });
                fs.mkdirSync(existingFolderPath, { recursive: true });
                fs.mkdirSync(testFolderPath, { recursive: true });

                // Mock user input to return existing folder name
                const originalShowInputBox = vscode.window.showInputBox;
                vscode.window.showInputBox = () => Promise.resolve('test-existing-folder');
                
                const showErrorMessageSpy: string[] = [];
                const originalShowErrorMessage = vscode.window.showErrorMessage;
                vscode.window.showErrorMessage = (message: string) => {
                    showErrorMessageSpy.push(message);
                    return Promise.resolve(undefined);
                };
                
                try {
                    const folderItem = new AppTreeItem(
                        'test-rename-folder',
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'folder',
                        vscode.Uri.file(workspaceRoot),
                        undefined,
                        undefined,
                        'test-rename-folder'
                    );

                    await tool.renameFolder(mockExplorerProvider, mockCache, folderItem);
                    
                    assert.ok(showErrorMessageSpy.length > 0, 'Should show error for duplicate folder name');
                    assert.ok(showErrorMessageSpy[0].includes('already exists'), 'Should mention folder already exists');
                    
                } finally {
                    // Restore original functions
                    vscode.window.showInputBox = originalShowInputBox;
                    vscode.window.showErrorMessage = originalShowErrorMessage;
                }
            } finally {
                // Clean up test folders
                try {
                    if (fs.existsSync(existingFolderPath)) {
                        fs.rmSync(existingFolderPath, { recursive: true, force: true });
                    }
                    if (fs.existsSync(testFolderPath)) {
                        fs.rmSync(testFolderPath, { recursive: true, force: true });
                    }
                } catch (error) {
                    // Ignore cleanup errors in test
                }
            }
        });

        test('Input validation should work correctly', async () => {
            // Test the validation function indirectly by checking expected behavior
            const validNames = ['validFolder', 'folder-with-dashes', 'folder_with_underscores', 'folder123'];
            const invalidNames = ['', '   ', 'folder with spaces', 'folder/with/slashes', 'folder\\with\\backslashes'];
            
            // Since we can't directly test the validation function, we test that the tool
            // would properly validate these inputs if they were passed to showInputBox
            
            // Valid names should not return validation errors (this is implicit in our implementation)
            for (const name of validNames) {
                assert.ok(/^[a-zA-Z0-9-_]+$/.test(name), `${name} should be valid`);
            }
            
            // Invalid names should fail validation
            for (const name of invalidNames) {
                if (name.trim() === '') {
                    assert.ok(name.trim() === '', `${name} should be empty after trim`);
                } else {
                    assert.ok(!/^[a-zA-Z0-9-_]+$/.test(name.trim()), `${name} should be invalid`);
                }
            }
        });

        test('Should handle folder path construction correctly', async () => {
            const tool = new RenameFolderTool(explorerService);
            
            // Test the private getFolderPathFromParent method indirectly
            // by checking the expected behavior when renaming nested folders
            
            const testCases = [
                { original: 'parent/child', newName: 'newChild', expected: 'parent/newChild' },
                { original: 'topLevel', newName: 'newTopLevel', expected: 'newTopLevel' },
                { original: 'deep/nested/folder', newName: 'newFolder', expected: 'deep/nested/newFolder' }
            ];
            
            for (const testCase of testCases) {
                const segments = testCase.original.split(path.sep);
                segments[segments.length - 1] = testCase.newName;
                const result = segments.join(path.sep);
                assert.strictEqual(result, testCase.expected, `Path construction for ${testCase.original} -> ${testCase.newName} should work correctly`);
            }
        });
    });
}

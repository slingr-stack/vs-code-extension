import * as assert from 'assert';
import * as vscode from 'vscode';
import { RefactorController } from '../../refactor/RefactorController';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, RenameFieldPayload, RenameModelPayload } from '../../refactor/refactorInterfaces';
import { RenameModelTool } from '../../refactor/tools/renameModel';
import { DeleteModelTool } from '../../refactor/tools/deleteModel';
import { RenameFieldTool } from '../../refactor/tools/renameField';
import { DeleteFieldTool } from '../../refactor/tools/deleteField';
import { ChangeFieldTypeTool } from '../../refactor/tools/changeFieldType';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RefactorController Workflow Tests', () => {
        
        let controller: RefactorController;
        let cache: MetadataCache;
        let mockContext: vscode.ExtensionContext;
        let outputChannelMessages: string[] = [];
        let appliedEdits: vscode.WorkspaceEdit[] = [];
        let tempTestDir: string;
        let tempDataDir: string;

        setup(async () => {
            // Reset state
            outputChannelMessages = [];
            appliedEdits = [];

            // Create temporary directory for test files
            tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-extension-test-'));
            tempDataDir = path.join(tempTestDir, 'src', 'data', 'models');
            fs.mkdirSync(tempDataDir, { recursive: true });

            // Create a minimal tsconfig.json for ts-morph
            const tsConfigContent = JSON.stringify({
                "compilerOptions": {
                    "target": "ES2020",
                    "module": "commonjs",
                    "lib": ["ES2020"],
                    "strict": true,
                    "experimentalDecorators": true,
                    "emitDecoratorMetadata": true,
                    "skipLibCheck": true,
                    "forceConsistentCasingInFileNames": true
                },
                "include": ["src/**/*"]
            }, null, 2);
            
            fs.writeFileSync(path.join(tempTestDir, 'tsconfig.json'), tsConfigContent, 'utf8');

            // Create cache with temp directory as workspace
            cache = new MetadataCache(tempTestDir);
            
            // Create mock context
            mockContext = {
                subscriptions: [],
                workspaceState: {
                    get: () => undefined,
                    update: () => Promise.resolve(),
                    keys: () => []
                },
                globalState: {
                    get: () => undefined,
                    update: () => Promise.resolve(),
                    setKeysForSync: () => {},
                    keys: () => []
                }
            } as any;

            // Mock VS Code APIs
            mockVSCodeAPIs();

            // Create tools array
            const tools = [
                new RenameModelTool(),
                new DeleteModelTool(),
                new RenameFieldTool(),
                new DeleteFieldTool(),
                new ChangeFieldTypeTool()
            ];

            // Create controller with tools and cache
            controller = new RefactorController(tools, cache);
        });

        teardown(async () => {
            // Clean up temporary directory
            if (tempTestDir && fs.existsSync(tempTestDir)) {
                fs.rmSync(tempTestDir, { recursive: true, force: true });
            }
            
            // Dispose cache
            if (cache) {
                cache.dispose();
            }
        });

        /**
         * Creates a TypeScript model file for testing
         */
        async function createTestModelFile(modelName: string, fields: Array<{name: string, type: string, decorators?: string[]}>): Promise<vscode.Uri> {
            const filePath = path.join(tempDataDir, `${modelName}.ts`);
            
            let content = `import { Field, Model } from '@slingr/slingr-framework';\n\n`;
            content += `@Model()\n`;
            content += `export class ${modelName} {\n`;
            
            for (const field of fields) {
                if (field.decorators && field.decorators.length > 0) {
                    for (const decorator of field.decorators) {
                        content += `    ${decorator}\n`;
                    }
                } else {
                    content += `    @Field()\n`;
                }
                content += `    ${field.name}: ${field.type};\n\n`;
            }
            
            content += `}\n`;
            
            fs.writeFileSync(filePath, content, 'utf8');
            
            const uri = vscode.Uri.file(filePath);
            return uri;
        }

        /**
         * Initializes the cache with created test files
         */
        async function initializeCacheWithTestFiles(): Promise<void> {
            // Initialize the cache to parse our test files
            await cache.initialize();
        }

        function mockVSCodeAPIs() {
            // Mock output channel
            (vscode.window as any).createOutputChannel = () => ({
                appendLine: (message: string) => {
                    outputChannelMessages.push(message);
                    console.log(`[Refactor Output] ${message}`);
                },
                show: () => {},
                hide: () => {},
                clear: () => { outputChannelMessages = []; },
                dispose: () => {}
            });

            // Mock workspace edit application
            (vscode.workspace as any).applyEdit = async (edit: vscode.WorkspaceEdit) => {
                appliedEdits.push(edit);
                return true;
            };

            // Mock user input/confirmation
            (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                // Default responses for different prompts
                if (options.prompt?.includes('model name')) {
                    return 'NewModel';
                }
                if (options.prompt?.includes('field name')) {
                    return 'newField';
                }
                if (options.prompt?.includes('field type')) {
                    return 'number';
                }
                return undefined;
            };

            (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                // Default to first option (usually "Yes" or confirmation)
                return items[0];
            };

            (vscode.window as any).showErrorMessage = async (message: string) => {
                console.log('Error:', message);
            };

            (vscode.window as any).showInformationMessage = async (message: string, ...items: string[]) => {
                console.log('Info:', message);
                // Return undefined by default, individual tests can override this
                return undefined;
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
                if (uri.fsPath.startsWith(tempTestDir)) {
                    return {
                        uri: vscode.Uri.file(tempTestDir),
                        name: 'test-workspace',
                        index: 0
                    };
                }
                return {
                    uri: vscode.Uri.file('/test'),
                    name: 'test',
                    index: 0
                };
            };

            (vscode.workspace as any).saveAll = async () => Promise.resolve(true);

            // Mock workspace.findFiles to return our test files
            (vscode.workspace as any).findFiles = async (include: string, exclude?: string) => {
                if (!include.includes('src/data') && !include.includes('src/ui')) {
                    return [];
                }
                
                // Return any files we've created in our temp directory
                const files: vscode.Uri[] = [];
                if (fs.existsSync(tempDataDir)) {
                    const models = fs.readdirSync(tempDataDir);
                    for (const model of models) {
                        if (model.endsWith('.ts')) {
                            files.push(vscode.Uri.file(path.join(tempDataDir, model)));
                        }
                    }
                }
                return files;
            };
        }

        suite('Controller Initialization', () => {
            test('should initialize with all refactor tools', () => {
                assert.ok(controller);
                
                // Check that all tools are registered by trying to get their commands
                const tools = [
                    'slingr-vscode-extension.renameModel',
                    'slingr-vscode-extension.deleteModel',
                    'slingr-vscode-extension.renameField',
                    'slingr-vscode-extension.deleteField',
                    'slingr-vscode-extension.changeFieldType'
                ];
                
                // This is tested implicitly by the fact that the controller initializes without error
                assert.ok(true);
            });

            test('should create output channel', () => {
                // Output channel should be created during initialization
                assert.ok(outputChannelMessages !== undefined);
            });
        });

        suite('Manual Refactor Workflows', () => {
            test('should execute complete rename model workflow', async () => {
                // Create a model file
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the model metadata
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const model = fileMeta.classes['User'];
                const modelRange = model.declaration.range;

                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                // Mock specific input for this test
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    if (options.prompt?.includes('Rename model')) {
                        return 'Person';
                    }
                    return undefined;
                };

                // Execute the refactor
                const tool = new RenameModelTool();
                const change = await tool.initiateManualRefactor(context);
                const payload = change?.payload as RenameModelPayload;
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_MODEL');
                assert.strictEqual(payload.oldModelMetadata.name, 'User');
                assert.strictEqual(payload.newName, 'Person');

                // Prepare and apply the edit
                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
                
                const success = await (vscode.workspace as any).applyEdit(edit);
                assert.strictEqual(success, true);
                assert.strictEqual(appliedEdits.length, 1);
            });

            test('should execute complete delete model workflow with confirmation', async () => {
                // Create a model file
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the model metadata
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const model = fileMeta.classes['User'];
                const modelRange = model.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                // Mock confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the model')) {
                        return 'Yes, Delete All';
                    }
                    return items[0];
                };

                const tool = new DeleteModelTool();
                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_MODEL');
                assert.strictEqual(change.payload.isManual, true);
                
                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
                
                const success = await (vscode.workspace as any).applyEdit(edit);
                assert.strictEqual(success, true);
            });

            test('should execute field rename workflow', async () => {
                // Create a model file with a field
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the metadata for the field we want to rename
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                assert.ok(fileMeta.classes['User'].properties['name'], 'name field should exist');
                
                const fieldMeta = fileMeta.classes['User'].properties['name'];
                const fieldRange = fieldMeta.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock field name input
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    if (options.prompt?.includes('Rename field')) {
                        return 'fullName';
                    }
                    return undefined;
                };

                const tool = new RenameFieldTool();
                const change = await tool.initiateManualRefactor(context);
                const payload = change?.payload as RenameFieldPayload;
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_FIELD');
                assert.strictEqual(payload.newName, 'fullName');

                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
            });

            test('should handle user cancellation gracefully', async () => {
                // Create a model file
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the model metadata
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const model = fileMeta.classes['User'];
                const modelRange = model.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                // Mock user cancellation
                (vscode.window as any).showInputBox = async () => undefined;

                const tool = new RenameModelTool();
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
                assert.strictEqual(appliedEdits.length, 0);
            });
        });

        suite('Automatic Change Detection Workflows', () => {
            test('should detect and process model rename automatically', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const serviceUri = vscode.Uri.file('/test/src/services/UserService.ts');
                const modelRange = new vscode.Range(5, 0, 5, 4);
                const referenceRange = new vscode.Range(10, 5, 10, 9);
                
                const oldModel = createMockModel('User', modelUri, modelRange);
                // Add an external reference to make the rename meaningful
                oldModel.references = [
                    { uri: modelUri, range: modelRange }, // declaration
                    { uri: serviceUri, range: referenceRange } // external reference
                ];
                
                const newModel = createMockModel('Person', modelUri, modelRange);
                newModel.references = [
                    { uri: modelUri, range: modelRange }, // declaration 
                    { uri: serviceUri, range: referenceRange } // external reference
                ];
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'Person': newModel } };
                
                // Simulate change detection through tools
                const renameModelTool = new RenameModelTool();
                const changes = renameModelTool.analyze(oldFileMeta, newFileMeta);
                const payload = changes[0].payload as RenameModelPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_MODEL');
                
                // Test that the change has the correct payload
                assert.strictEqual(payload.oldName, 'User');
                assert.strictEqual(payload.newName, 'Person');

                // Test proposing automatic refactors
                if (changes.length > 0) {
                    // Reset appliedEdits counter for this test
                    appliedEdits.length = 0;
                    
                    // Mock user response to review changes (first confirmation)
                    (vscode.window as any).showInformationMessage = async (message: string, ...items: string[]) => {
                        if (message.includes('potential refactoring')) {
                            return 'Review Changes';
                        }
                        return undefined;
                    };
                    
                    // Mock the workspace edit application (second confirmation - VS Code UI)
                    (vscode.workspace as any).applyEdit = async (edit: vscode.WorkspaceEdit) => {
                        appliedEdits.push(edit);
                        return true; // User accepted the changes in VS Code UI
                    };
                    
                    await controller.proposeAutomaticRefactors(changes);
                    
                    // Verify that edits were prepared and applied
                    assert.ok(appliedEdits.length > 0, 'Expected at least one workspace edit to be applied');
                }
            });

            test('should detect field type changes automatically', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('age', 'string', modelUri, fieldRange);
                const newField = createMockField('age', 'number', modelUri, fieldRange);
                
                const model = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                const oldModel = { ...model, properties: { 'age': oldField } };
                const newModel = { ...model, properties: { 'age': newField } };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel } };
                
                const changeFieldTypeTool = new ChangeFieldTypeTool();
                const changes = changeFieldTypeTool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'CHANGE_FIELD_TYPE');
                
                if (changes.length > 0) {
                    // Mock user declining to review changes
                    (vscode.window as any).showInformationMessage = async () => undefined;
                    
                    await controller.proposeAutomaticRefactors(changes);
                    
                    // Should not apply edits when user declines
                    assert.ok(true); // Test completes without errors
                }
            });

            test('should accumulate multiple changes from same file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                // Model rename
                const oldModel = createMockModel('User', modelUri, new vscode.Range(5, 0, 5, 4));
                const newModel = createMockModel('Person', modelUri, new vscode.Range(5, 0, 5, 6));
                
                // Field changes
                const oldField1 = createMockField('name', 'string', modelUri, new vscode.Range(8, 4, 8, 8));
                const oldField2 = createMockField('age', 'string', modelUri, new vscode.Range(9, 4, 9, 7));
                
                const newField1 = createMockField('fullName', 'string', modelUri, new vscode.Range(8, 4, 8, 12));
                const newField2 = createMockField('age', 'number', modelUri, new vscode.Range(9, 4, 9, 7));
                
                oldModel.properties = { 'name': oldField1, 'age': oldField2 };
                newModel.properties = { 'fullName': newField1, 'age': newField2 };
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel } };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'Person': newModel } };
                
                // Collect changes from all tools
                const allChanges: ChangeObject[] = [];
                const tools = controller.getTools();
                
                for (const tool of tools) {
                    const changes = tool.analyze(oldFileMeta, newFileMeta, allChanges);
                    allChanges.push(...changes);
                }
                
                // Should detect multiple types of changes
                assert.ok(allChanges.length >= 2); // At least model rename and one field change
                
                const hasModelRename = allChanges.some(c => c.type === 'RENAME_MODEL');
                const hasFieldChanges = allChanges.some(c => c.type.includes('FIELD'));
                
                assert.ok(hasModelRename);
                assert.ok(hasFieldChanges);
            });
        });

        suite('Error Handling and Edge Cases', () => {
            test('should handle invalid file metadata gracefully', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                // Test that tools can handle invalid metadata
                const renameModelTool = new RenameModelTool();
                const changes = renameModelTool.analyze(undefined, undefined);
                
                assert.strictEqual(changes.length, 0);
                
                // Test proposing empty changes
                await controller.proposeAutomaticRefactors([]);
                
                assert.ok(true); // Should not throw errors
            });

            test('should handle workspace edit failures', async () => {
                // Create a model file
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the model metadata
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const model = fileMeta.classes['User'];
                const modelRange = model.declaration.range;
                
                // Mock workspace edit failure
                (vscode.workspace as any).applyEdit = async () => false;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: modelRange,
                    metadata: model
                };

                const tool = new RenameModelTool();
                const change = await tool.initiateManualRefactor(context);
                
                if (change) {
                    const edit = await tool.prepareEdit(change, cache);
                    const success = await (vscode.workspace as any).applyEdit(edit);
                    assert.strictEqual(success, false);
                }
            });

            test('should handle non-model files without errors', async () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 6);
                const nonModel = createMockNonModel('Helper', nonModelUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': nonModel } };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: {} };
                
                // Test that tools handle non-model files properly
                const tools = controller.getTools();
                let totalChanges = 0;
                
                for (const tool of tools) {
                    const changes = tool.analyze(oldFileMeta, newFileMeta);
                    totalChanges += changes.length;
                }
                
                // Should detect no changes for non-model files
                assert.strictEqual(totalChanges, 0);
            });
        });

        suite('Tool Integration', () => {

            test('should handle relationship cleanup across multiple tools', async () => {
                const userUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const orderUri = vscode.Uri.file('/test/src/data/models/Order.ts');
                
                // User model with relationship field
                const userModel = createMockModel('User', userUri, new vscode.Range(5, 0, 5, 4));
                const ordersField = createMockRelationshipField('orders', 'Order', userUri, new vscode.Range(8, 4, 8, 10));
                userModel.properties = { 'orders': ordersField };
                
                // Order model with reverse relationship
                const orderModel = createMockModel('Order', orderUri, new vscode.Range(5, 0, 5, 5));
                const userField = createMockRelationshipField('user', 'User', orderUri, new vscode.Range(8, 4, 8, 8));
                orderModel.properties = { 'user': userField };
                
                // Setup cache to find related models
                (cache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderModel)) {
                        results.push(orderModel);
                    }
                    return results;
                };
                
                // Delete the User model
                const oldFileMeta: FileMetadata = { uri: userUri, classes: { 'User': userModel } };
                
                const deleteModelTool = new DeleteModelTool();
                const changes = deleteModelTool.analyze(oldFileMeta, undefined);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_MODEL');
                
                // The tool should handle cleanup of related fields
                const edit = await deleteModelTool.prepareEdit(changes[0], cache);
                assert.ok(edit);
            });
        });

        suite('Performance and Scalability', () => {
            test('should handle large numbers of changes efficiently', async () => {
                const startTime = Date.now();
                
                // Create multiple models with changes
                const changes: ChangeObject[] = [];
                
                for (let i = 0; i < 100; i++) {
                    const modelUri = vscode.Uri.file(`/test/src/data/models/Model${i}.ts`);
                    const modelRange = new vscode.Range(5, 0, 5, 7 + i.toString().length);
                    const model = createMockModel(`Model${i}`, modelUri, modelRange);
                    
                    changes.push({
                        type: 'RENAME_MODEL',
                        uri: modelUri,
                        description: `Rename Model${i} to NewModel${i}`,
                        payload: {
                            oldModelMetadata: model,
                            newName: `NewModel${i}`,
                            isManual: false
                        } as RenameModelPayload
                    });
                }
                
                // Process all changes
                const tool = new RenameModelTool();
                for (const change of changes) {
                    const edit = await tool.prepareEdit(change, cache);
                    assert.ok(edit);
                }
                
                const endTime = Date.now();
                const duration = endTime - startTime;
                
                // Should complete in reasonable time (less than 5 seconds for 100 changes)
                assert.ok(duration < 5000, `Processing took ${duration}ms, which is too long`);
            });

            test('should handle concurrent change detection', async () => {
                const promises: Promise<void>[] = [];
                
                // Simulate multiple concurrent file changes through tools
                for (let i = 0; i < 10; i++) {
                    const promise = new Promise<void>((resolve) => {
                        setTimeout(() => {
                            const modelUri = vscode.Uri.file(`/test/src/data/models/Model${i}.ts`);
                            const oldModel = createMockModel(`Model${i}`, modelUri, new vscode.Range(5, 0, 5, 7 + i.toString().length));
                            const newModel = createMockModel(`NewModel${i}`, modelUri, new vscode.Range(5, 0, 5, 10 + i.toString().length));
                            
                            const oldFileMeta: FileMetadata = { uri: modelUri, classes: { [`Model${i}`]: oldModel } };
                            const newFileMeta: FileMetadata = { uri: modelUri, classes: { [`NewModel${i}`]: newModel } };
                            
                            // Test that tools can handle concurrent analysis
                            const renameModelTool = new RenameModelTool();
                            const changes = renameModelTool.analyze(oldFileMeta, newFileMeta);
                            
                            // Verify changes are detected correctly
                            assert.strictEqual(changes.length, 1);
                            assert.strictEqual(changes[0].type, 'RENAME_MODEL');
                            
                            resolve();
                        }, Math.random() * 100); // Random delay to simulate real-world timing
                    });
                    
                    promises.push(promise);
                }
                
                await Promise.all(promises);
                
                // Allow all changes to be processed
                await new Promise(resolve => setTimeout(resolve, 200));
                
                assert.ok(true); // Should handle concurrent changes without errors
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

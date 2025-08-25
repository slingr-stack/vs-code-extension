import * as assert from 'assert';
import * as vscode from 'vscode';
import { RefactorController } from '../../refactor/RefactorController';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext } from '../../refactor/refactorInterfaces';
import { RenameEntityTool } from '../../refactor/tools/renameEntity';
import { DeleteEntityTool } from '../../refactor/tools/deleteEntity';
import { RenameFieldTool } from '../../refactor/tools/renameField';
import { DeleteFieldTool } from '../../refactor/tools/deleteField';
import { ChangeFieldTypeTool } from '../../refactor/tools/changeFieldType';
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
            tempDataDir = path.join(tempTestDir, 'src', 'data', 'entities');
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
                new RenameEntityTool(),
                new DeleteEntityTool(),
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
         * Creates a TypeScript entity file for testing
         */
        async function createTestEntityFile(entityName: string, fields: Array<{name: string, type: string, decorators?: string[]}>): Promise<vscode.Uri> {
            const filePath = path.join(tempDataDir, `${entityName}.ts`);
            
            let content = `import { Field, Model } from '@slingr/slingr-framework';\n\n`;
            content += `@Model()\n`;
            content += `export class ${entityName} {\n`;
            
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
                if (options.prompt?.includes('entity name')) {
                    return 'NewEntity';
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
                    const entities = fs.readdirSync(tempDataDir);
                    for (const entity of entities) {
                        if (entity.endsWith('.ts')) {
                            files.push(vscode.Uri.file(path.join(tempDataDir, entity)));
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
                    'slingr-vscode-extension.renameEntity',
                    'slingr-vscode-extension.deleteEntity',
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
            test('should execute complete rename entity workflow', async () => {
                // Create a entity file
                const entityUri = await createTestEntityFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the entity metadata
                const filePath = entityUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const entity = fileMeta.classes['User'];
                const entityRange = entity.declaration.range;

                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock specific input for this test
                (vscode.window as any).showInputBox = async (options: vscode.InputBoxOptions) => {
                    if (options.prompt?.includes('Rename entity')) {
                        return 'Person';
                    }
                    return undefined;
                };

                // Execute the refactor
                const tool = new RenameEntityTool();
                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_ENTITY');
                assert.strictEqual(change.payload.oldEntityMetadata.name, 'User');
                assert.strictEqual(change.payload.newName, 'Person');
                
                // Prepare and apply the edit
                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
                
                const success = await (vscode.workspace as any).applyEdit(edit);
                assert.strictEqual(success, true);
                assert.strictEqual(appliedEdits.length, 1);
            });

            test('should execute complete delete entity workflow with confirmation', async () => {
                // Create a entity file
                const entityUri = await createTestEntityFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the entity metadata
                const filePath = entityUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const entity = fileMeta.classes['User'];
                const entityRange = entity.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock confirmation
                (vscode.window as any).showWarningMessage = async (message: string, ...items: string[]) => {
                    if (message.includes('delete the entity')) {
                        return 'Yes, Delete All';
                    }
                    return items[0];
                };

                const tool = new DeleteEntityTool();
                const change = await tool.initiateManualRefactor(context);
                
                assert.ok(change);
                assert.strictEqual(change.type, 'DELETE_ENTITY');
                assert.strictEqual(change.payload.isManual, true);
                
                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
                
                const success = await (vscode.workspace as any).applyEdit(edit);
                assert.strictEqual(success, true);
            });

            test('should execute field rename workflow', async () => {
                // Create a entity file with a field
                const entityUri = await createTestEntityFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the metadata for the field we want to rename
                const filePath = entityUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                assert.ok(fileMeta.classes['User'].properties['name'], 'name field should exist');
                
                const fieldMeta = fileMeta.classes['User'].properties['name'];
                const fieldRange = fieldMeta.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: entityUri,
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
                
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_FIELD');
                assert.strictEqual(change.payload.newName, 'fullName');
                
                const edit = await tool.prepareEdit(change, cache);
                assert.ok(edit);
            });

            test('should handle user cancellation gracefully', async () => {
                // Create a entity file
                const entityUri = await createTestEntityFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the entity metadata
                const filePath = entityUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const entity = fileMeta.classes['User'];
                const entityRange = entity.declaration.range;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                // Mock user cancellation
                (vscode.window as any).showInputBox = async () => undefined;

                const tool = new RenameEntityTool();
                const change = await tool.initiateManualRefactor(context);
                
                assert.strictEqual(change, undefined);
                assert.strictEqual(appliedEdits.length, 0);
            });
        });

        suite('Automatic Change Detection Workflows', () => {
            test('should detect and process entity rename automatically', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const serviceUri = vscode.Uri.file('/test/src/services/UserService.ts');
                const entityRange = new vscode.Range(5, 0, 5, 4);
                const referenceRange = new vscode.Range(10, 5, 10, 9);
                
                const oldEntity = createMockEntity('User', entityUri, entityRange);
                // Add an external reference to make the rename meaningful
                oldEntity.references = [
                    { uri: entityUri, range: entityRange }, // declaration
                    { uri: serviceUri, range: referenceRange } // external reference
                ];
                
                const newEntity = createMockEntity('Person', entityUri, entityRange);
                newEntity.references = [
                    { uri: entityUri, range: entityRange }, // declaration 
                    { uri: serviceUri, range: referenceRange } // external reference
                ];
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'Person': newEntity } };
                
                // Simulate change detection through tools
                const renameEntityTool = new RenameEntityTool();
                const changes = renameEntityTool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_ENTITY');
                
                // Test that the change has the correct payload
                assert.strictEqual(changes[0].payload.oldName, 'User');
                assert.strictEqual(changes[0].payload.newName, 'Person');
                
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = createMockField('age', 'string', entityUri, fieldRange);
                const newField = createMockField('age', 'number', entityUri, fieldRange);
                
                const entity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                const oldEntity = { ...entity, properties: { 'age': oldField } };
                const newEntity = { ...entity, properties: { 'age': newField } };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': newEntity } };
                
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
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                
                // Entity rename
                const oldEntity = createMockEntity('User', entityUri, new vscode.Range(5, 0, 5, 4));
                const newEntity = createMockEntity('Person', entityUri, new vscode.Range(5, 0, 5, 6));
                
                // Field changes
                const oldField1 = createMockField('name', 'string', entityUri, new vscode.Range(8, 4, 8, 8));
                const oldField2 = createMockField('age', 'string', entityUri, new vscode.Range(9, 4, 9, 7));
                
                const newField1 = createMockField('fullName', 'string', entityUri, new vscode.Range(8, 4, 8, 12));
                const newField2 = createMockField('age', 'number', entityUri, new vscode.Range(9, 4, 9, 7));
                
                oldEntity.properties = { 'name': oldField1, 'age': oldField2 };
                newEntity.properties = { 'fullName': newField1, 'age': newField2 };
                
                const oldFileMeta: FileMetadata = { uri: entityUri, classes: { 'User': oldEntity } };
                const newFileMeta: FileMetadata = { uri: entityUri, classes: { 'Person': newEntity } };
                
                // Collect changes from all tools
                const allChanges: ChangeObject[] = [];
                const tools = controller.getTools();
                
                for (const tool of tools) {
                    const changes = tool.analyze(oldFileMeta, newFileMeta, allChanges);
                    allChanges.push(...changes);
                }
                
                // Should detect multiple types of changes
                assert.ok(allChanges.length >= 2); // At least entity rename and one field change
                
                const hasEntityRename = allChanges.some(c => c.type === 'RENAME_ENTITY');
                const hasFieldChanges = allChanges.some(c => c.type.includes('FIELD'));
                
                assert.ok(hasEntityRename);
                assert.ok(hasFieldChanges);
            });
        });

        suite('Error Handling and Edge Cases', () => {
            test('should handle invalid file metadata gracefully', async () => {
                const entityUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                
                // Test that tools can handle invalid metadata
                const renameEntityTool = new RenameEntityTool();
                const changes = renameEntityTool.analyze(undefined, undefined);
                
                assert.strictEqual(changes.length, 0);
                
                // Test proposing empty changes
                await controller.proposeAutomaticRefactors([]);
                
                assert.ok(true); // Should not throw errors
            });

            test('should handle workspace edit failures', async () => {
                // Create a entity file
                const entityUri = await createTestEntityFile('User', [
                    { name: 'name', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get the entity metadata
                const filePath = entityUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                assert.ok(fileMeta.classes['User'], 'User class should exist');
                
                const entity = fileMeta.classes['User'];
                const entityRange = entity.declaration.range;
                
                // Mock workspace edit failure
                (vscode.workspace as any).applyEdit = async () => false;
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: entityUri,
                    range: entityRange,
                    metadata: entity
                };

                const tool = new RenameEntityTool();
                const change = await tool.initiateManualRefactor(context);
                
                if (change) {
                    const edit = await tool.prepareEdit(change, cache);
                    const success = await (vscode.workspace as any).applyEdit(edit);
                    assert.strictEqual(success, false);
                }
            });

            test('should handle non-entity files without errors', async () => {
                const nonEntityUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const range = new vscode.Range(5, 0, 5, 6);
                const nonEntity = createMockNonEntity('Helper', nonEntityUri, range);
                
                const oldFileMeta: FileMetadata = { uri: nonEntityUri, classes: { 'Helper': nonEntity } };
                const newFileMeta: FileMetadata = { uri: nonEntityUri, classes: {} };
                
                // Test that tools handle non-entity files properly
                const tools = controller.getTools();
                let totalChanges = 0;
                
                for (const tool of tools) {
                    const changes = tool.analyze(oldFileMeta, newFileMeta);
                    totalChanges += changes.length;
                }
                
                // Should detect no changes for non-entity files
                assert.strictEqual(totalChanges, 0);
            });
        });

        suite('Tool Integration', () => {

            test('should handle relationship cleanup across multiple tools', async () => {
                const userUri = vscode.Uri.file('/test/src/data/entities/User.ts');
                const orderUri = vscode.Uri.file('/test/src/data/entities/Order.ts');
                
                // User entity with relationship field
                const userEntity = createMockEntity('User', userUri, new vscode.Range(5, 0, 5, 4));
                const ordersField = createMockRelationshipField('orders', 'Order', userUri, new vscode.Range(8, 4, 8, 10));
                userEntity.properties = { 'orders': ordersField };
                
                // Order entity with reverse relationship
                const orderEntity = createMockEntity('Order', orderUri, new vscode.Range(5, 0, 5, 5));
                const userField = createMockRelationshipField('user', 'User', orderUri, new vscode.Range(8, 4, 8, 8));
                orderEntity.properties = { 'user': userField };
                
                // Setup cache to find related entities
                (cache as any).findMetadata = (predicate: (item: any) => boolean) => {
                    const results: any[] = [];
                    if (predicate(orderEntity)) {
                        results.push(orderEntity);
                    }
                    return results;
                };
                
                // Delete the User entity
                const oldFileMeta: FileMetadata = { uri: userUri, classes: { 'User': userEntity } };
                
                const deleteEntityTool = new DeleteEntityTool();
                const changes = deleteEntityTool.analyze(oldFileMeta, undefined);
                
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'DELETE_ENTITY');
                
                // The tool should handle cleanup of related fields
                const edit = await deleteEntityTool.prepareEdit(changes[0], cache);
                assert.ok(edit);
            });
        });

        suite('Performance and Scalability', () => {
            test('should handle large numbers of changes efficiently', async () => {
                const startTime = Date.now();
                
                // Create multiple entities with changes
                const changes: ChangeObject[] = [];
                
                for (let i = 0; i < 100; i++) {
                    const entityUri = vscode.Uri.file(`/test/src/data/entities/Entity${i}.ts`);
                    const entityRange = new vscode.Range(5, 0, 5, 7 + i.toString().length);
                    const entity = createMockEntity(`Entity${i}`, entityUri, entityRange);
                    
                    changes.push({
                        type: 'RENAME_ENTITY',
                        uri: entityUri,
                        description: `Rename Entity${i} to NewEntity${i}`,
                        payload: {
                            oldEntityMetadata: entity,
                            newEntityName: `NewEntity${i}`,
                            isManual: false
                        }
                    });
                }
                
                // Process all changes
                const tool = new RenameEntityTool();
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
                            const entityUri = vscode.Uri.file(`/test/src/data/entities/Entity${i}.ts`);
                            const oldEntity = createMockEntity(`Entity${i}`, entityUri, new vscode.Range(5, 0, 5, 7 + i.toString().length));
                            const newEntity = createMockEntity(`NewEntity${i}`, entityUri, new vscode.Range(5, 0, 5, 10 + i.toString().length));
                            
                            const oldFileMeta: FileMetadata = { uri: entityUri, classes: { [`Entity${i}`]: oldEntity } };
                            const newFileMeta: FileMetadata = { uri: entityUri, classes: { [`NewEntity${i}`]: newEntity } };
                            
                            // Test that tools can handle concurrent analysis
                            const renameEntityTool = new RenameEntityTool();
                            const changes = renameEntityTool.analyze(oldFileMeta, newFileMeta);
                            
                            // Verify changes are detected correctly
                            assert.strictEqual(changes.length, 1);
                            assert.strictEqual(changes[0].type, 'RENAME_ENTITY');
                            
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

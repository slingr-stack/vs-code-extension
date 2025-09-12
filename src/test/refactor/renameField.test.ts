import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RenameFieldTool } from '../../refactor/tools/renameField';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, RenameFieldPayload } from '../../refactor/refactorInterfaces';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('RenameFieldTool Tests', () => {
        
        let tool: RenameFieldTool;
        let cache: MetadataCache;
        let mockCache: MetadataCache;
        let inputResponses: { [prompt: string]: string | undefined } = {};
        let tempTestDir: string;
        let tempDataDir: string;

        setup(() => {
            tool = new RenameFieldTool();
            mockCache = TestMetadataFactory.createMockCache();
            inputResponses = {};

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
            test('should handle valid field in model file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, true);
            });

            test('should reject field in non-model files', async () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: nonModelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: nonModelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject non-field metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                const model = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: range,
                    metadata: model as any
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });

            test('should reject field without Field decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Automatic Change Detection', () => {
            test('should detect field rename when property name changes', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const oldFieldRange = new vscode.Range(8, 4, 8, 8);
                const newFieldRange = new vscode.Range(8, 4, 8, 12);
                
                const oldField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: oldFieldRange }
                });
                const newField = TestMetadataFactory.createField({
                    name: 'fullName',
                    type: 'string',
                    declaration: { uri: modelUri, range: newFieldRange }
                });
                
                const oldModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'name': oldField }
                });
                
                const newModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'fullName': newField }
                });
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                const payload = changes[0]?.payload as RenameFieldPayload;
                assert.strictEqual(changes.length, 1);
                assert.strictEqual(changes[0].type, 'RENAME_FIELD');
                assert.strictEqual(payload.oldFieldMetadata.name, 'name');
                assert.strictEqual(payload.newName, 'fullName');
                assert.strictEqual(payload.modelName, 'User');
            });

            test('should not detect rename when only decorators change', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                const newField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange },
                    decorators: [
                        { 
                            name: 'Field', 
                            arguments: [{ label: 'Full Name' }], 
                            position: new vscode.Range(7, 4, 7, 17) 
                        }
                    ]
                });
                
                const oldModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'name': oldField }
                });
                
                const newModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'name': newField }
                });
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should match fields by position for renames', () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                
                // Multiple fields - should match by position
                const oldField1 = TestMetadataFactory.createField({
                    name: 'firstName',
                    type: 'string',
                    declaration: { uri: modelUri, range: new vscode.Range(8, 4, 8, 13) }
                });
                const oldField2 = TestMetadataFactory.createField({
                    name: 'lastName',
                    type: 'string',
                    declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 12) }
                });
                
                const newField1 = TestMetadataFactory.createField({
                    name: 'first',
                    type: 'string',
                    declaration: { uri: modelUri, range: new vscode.Range(8, 4, 8, 9) }
                });
                const newField2 = TestMetadataFactory.createField({
                    name: 'last',
                    type: 'string',
                    declaration: { uri: modelUri, range: new vscode.Range(9, 4, 9, 8) }
                });
                
                const oldModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'firstName': oldField1, 'lastName': oldField2 }
                });
                
                const newModel = TestMetadataFactory.createModel({
                    name: 'User',
                    declaration: { uri: modelUri, range: new vscode.Range(5, 0, 5, 4) },
                    properties: { 'first': newField1, 'last': newField2 }
                });
                
                const oldFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': oldModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: modelUri, classes: { 'User': newModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                
                assert.strictEqual(changes.length, 2);
                
                // Should match by position
                const firstNameChange = changes.find(c => (c.payload as RenameFieldPayload).oldFieldMetadata.name === 'firstName');
                const lastNameChange = changes.find(c => (c.payload as RenameFieldPayload).oldFieldMetadata.name === 'lastName');

                assert.ok(firstNameChange);
                assert.ok(lastNameChange);
                assert.strictEqual((firstNameChange.payload as RenameFieldPayload).newName, 'first');
                assert.strictEqual((lastNameChange.payload as RenameFieldPayload).newName, 'last');
            });

            test('should not detect changes in non-model files', () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const oldField = TestMetadataFactory.createNonField('name', 'string', nonModelUri, fieldRange);
                const newField = TestMetadataFactory.createNonField('fullName', 'string', nonModelUri, fieldRange);
                
                const oldNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                oldNonModel.properties = { 'name': oldField };
                
                const newNonModel = TestMetadataFactory.createNonModel('Helper', nonModelUri, new vscode.Range(5, 0, 5, 6));
                newNonModel.properties = { 'fullName': newField };
                
                const oldFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': oldNonModel }, dataSources: {} };
                const newFileMeta: FileMetadata = { uri: nonModelUri, classes: { 'Helper': newNonModel }, dataSources: {} };
                
                const changes = tool.analyze(oldFileMeta, newFileMeta);
                assert.strictEqual(changes.length, 0);
            });

            test('should handle empty or undefined metadata', () => {
                const uri = vscode.Uri.file('/test/src/data/models/User.ts');
                const emptyFileMeta: FileMetadata = { uri, classes: {}, dataSources: {} };
                
                // Test with empty files
                assert.strictEqual(tool.analyze(emptyFileMeta, undefined).length, 0);
                
                // Test with undefined
                assert.strictEqual(tool.analyze(undefined, emptyFileMeta).length, 0);
                
                // Test with non-model files
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const nonModelMeta: FileMetadata = { uri: nonModelUri, classes: {}, dataSources: {} };
                assert.strictEqual(tool.analyze(nonModelMeta, undefined).length, 0);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should proceed with valid new field name', async () => {
                // Create a model file with a field
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' },
                    { name: 'email', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get metadata from the cache - use the full normalized path
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                
                const userClass = fileMeta.classes['User'];
                assert.ok(userClass, 'User class should exist');
                
                const nameField = userClass.properties['name'];
                assert.ok(nameField, 'Name field should exist');
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: nameField.declaration.range,
                    metadata: nameField
                };

                // Mock valid user input - note the exact prompt format
                inputResponses[`Rename field 'name'`] = 'fullName';

                const change = await tool.initiateManualRefactor(context);
                const payload = change?.payload as RenameFieldPayload;
                assert.ok(change);
                assert.strictEqual(change.type, 'RENAME_FIELD');
                assert.strictEqual(payload.oldName, 'name');
                assert.strictEqual(payload.newName, 'fullName');
                assert.strictEqual(payload.modelName, 'User');
                assert.strictEqual(payload.isManual, true);
            });

            test('should handle user cancellation', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock user cancellation
                inputResponses['Enter new field name:'] = undefined;

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject invalid field names', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock invalid input (PascalCase, should be camelCase)
                inputResponses['Enter new field name:'] = 'FullName';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject empty field names', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock empty input
                inputResponses['Enter new field name:'] = '';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should reject same field name', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                // Mock same field name
                inputResponses['Enter new field name:'] = 'name';

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });

            test('should handle invalid metadata', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context);
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for field rename', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange },
                    references: [
                        { uri: modelUri, range: fieldRange },
                        { uri: vscode.Uri.file('/test/other.ts'), range: new vscode.Range(10, 5, 10, 9) },
                        { uri: vscode.Uri.file('/test/another.ts'), range: new vscode.Range(15, 0, 15, 4) }
                    ]
                });
                const newField = TestMetadataFactory.createField({
                    name: 'fullName',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: modelUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldName: oldField.name, 
                        newName: newField.name, 
                        modelName: 'User',
                        oldFieldMetadata: oldField,
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should handle field with no external references', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange },
                    references: [{ uri: modelUri, range: fieldRange }] // Only self-reference
                });
                const newField = TestMetadataFactory.createField({
                    name: 'fullName',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: modelUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldName: oldField.name,
                        newName: newField.name,
                        modelName: 'User',
                        oldFieldMetadata: oldField,
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });

            test('should update decorator arguments with field name', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const oldField = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange },
                    decorators: [
                        { 
                            name: 'Field', 
                            arguments: [{ label: 'name' }], 
                            position: new vscode.Range(7, 4, 7, 17) 
                        }
                    ]
                });
                const newField = TestMetadataFactory.createField({
                    name: 'fullName',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });

                const change: ChangeObject = {
                    type: 'RENAME_FIELD',
                    uri: modelUri,
                    description: 'Rename field from name to fullName',
                    payload: {
                        oldName: oldField.name,
                        newName: newField.name,
                        modelName: 'User',
                        oldFieldMetadata: oldField,
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change, mockCache);
                
                assert.ok(workspaceEdit);
            });
        });

        suite('Field Name Validation', () => {
            test('should accept valid camelCase field names', async () => {
                // Create a model file with a field
                const modelUri = await createTestModelFile('User', [
                    { name: 'name', type: 'string' }
                ]);
                
                // Initialize cache to parse the file
                await initializeCacheWithTestFiles();
                
                // Get metadata from the cache
                const filePath = modelUri.fsPath.replace(/\\/g, '/');
                const fileMeta = cache.getMetadataForFile(filePath);
                assert.ok(fileMeta, 'File metadata should exist');
                
                const userClass = fileMeta.classes['User'];
                assert.ok(userClass, 'User class should exist');
                
                const nameField = userClass.properties['name'];
                assert.ok(nameField, 'Name field should exist');
                
                const context: ManualRefactorContext = {
                    cache: cache,
                    uri: modelUri,
                    range: nameField.declaration.range,
                    metadata: nameField
                };

                const validNames = ['fullName', 'firstName', 'emailAddress', 'isActive', 'userId'];
                
                for (const name of validNames) {
                    // Use the correct prompt format
                    inputResponses[`Rename field 'name'`] = name;
                    const change = await tool.initiateManualRefactor(context);
                    assert.ok(change, `Should accept valid field name: ${name}`);
                    assert.strictEqual((change.payload as RenameFieldPayload).newName, name);
                }
            });

            test('should reject invalid field names', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
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



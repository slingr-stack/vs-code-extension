import * as assert from 'assert';
import * as vscode from 'vscode';
import { AddDecoratorTool } from '../../refactor/tools/addDecorator';
import { MetadataCache, FileMetadata, DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { ChangeObject, ManualRefactorContext, AddDecoratorPayload } from '../../refactor/refactorInterfaces';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('AddDecoratorTool Tests', () => {
        
        let tool: AddDecoratorTool;
        let mockCache: MetadataCache;

        setup(() => {
            tool = new AddDecoratorTool();
            mockCache = TestMetadataFactory.createMockCache();

            // Mock workspace operations
            (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
                return {
                    lineAt: (line: number) => ({
                        text: '    name: string;',
                        firstNonWhitespaceCharacterIndex: 4,
                        isEmptyOrWhitespace: false,
                        rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0)
                    }),
                    getText: () => 'name: string;'
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
                assert.strictEqual(tool.getCommandId(), 'slingr-vscode-extension.addDecorator');
            });

            test('should provide correct title', () => {
                assert.strictEqual(tool.getTitle(), 'Add Decorator');
            });

            test('should handle correct change types', () => {
                assert.deepStrictEqual(tool.getHandledChangeTypes(), ['ADD_DECORATOR']);
            });
        });

        suite('Manual Trigger Capability', () => {
            test('should handle valid property in model file', async () => {
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
                assert.strictEqual(canHandle, true);
            });

            test('should handle property with existing decorators in model file', async () => {
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

            test('should reject property in non-model files', async () => {
                const nonModelUri = vscode.Uri.file('/test/src/utils/helper.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', nonModelUri, fieldRange);
                
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

            test('should reject when no metadata is provided', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const range = new vscode.Range(5, 0, 5, 4);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: range,
                    metadata: undefined
                };

                const canHandle = await tool.canHandleManualTrigger(context);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Manual Refactor Initiation', () => {
            test('should create change object with Field decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const change = await tool.initiateManualRefactor(context, 'Field');
                
                assert.ok(change, 'Expected a change object to be returned');
                assert.strictEqual(change.type, 'ADD_DECORATOR');
                assert.strictEqual(change.uri.toString(), modelUri.toString());
                assert.strictEqual(change.description, "Add @Field decorator to 'name'.");
                
                const payload = change.payload;
                assert.strictEqual(payload.isManual, true);
                assert.strictEqual(payload.decoratorName, 'Field');
                assert.strictEqual(payload.fieldMetadata.name, 'name');
                assert.strictEqual(payload.fieldMetadata.type, 'string');
            });

            test('should create change object with Text decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'description',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const change = await tool.initiateManualRefactor(context, 'Text');
                
                assert.ok(change);
                assert.strictEqual(change.type, 'ADD_DECORATOR');
                const payload = change.payload;
                assert.strictEqual(payload.decoratorName, 'Text');
                assert.strictEqual(payload.fieldMetadata.name, 'description');
            });

            test('should create change object with Date decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('createdAt', 'Date', modelUri, fieldRange);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: fieldMeta
                };

                const change = await tool.initiateManualRefactor(context, 'Date');
                
                assert.ok(change);
                assert.strictEqual(change.type, 'ADD_DECORATOR');
                const payload = change.payload;
                assert.strictEqual(payload.decoratorName, 'Date');
                assert.strictEqual(payload.fieldMetadata.name, 'createdAt');
                assert.strictEqual(payload.fieldMetadata.type, 'Date');
            });

            test('should return undefined when metadata is missing', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                
                const context: ManualRefactorContext = {
                    cache: mockCache,
                    uri: modelUri,
                    range: fieldRange,
                    metadata: undefined
                };

                const change = await tool.initiateManualRefactor(context, 'Field');
                assert.strictEqual(change, undefined);
            });
        });

        suite('Workspace Edit Preparation', () => {
            test('should prepare edit for adding Field decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'ADD_DECORATOR',
                    uri: modelUri,
                    description: "Add @Field decorator to 'name'.",
                    payload: {
                        fieldMetadata: fieldMeta,
                        decoratorName: 'Field',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change);
                
                assert.ok(workspaceEdit);
                assert.strictEqual(workspaceEdit.size, 1);
                
                const entries = workspaceEdit.entries();
                const [editUri, textEdits] = entries[0];
                
                assert.strictEqual(editUri.toString(), modelUri.toString());
                assert.strictEqual(textEdits.length, 1);
                
                const textEdit = textEdits[0];
                assert.strictEqual(textEdit.range.start.line, fieldRange.start.line);
                assert.strictEqual(textEdit.range.start.character, fieldRange.start.character);
                assert.strictEqual(textEdit.newText, '@Field()\n    ');
            });

            test('should prepare edit for adding Integer decorator', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 7);
                const fieldMeta = TestMetadataFactory.createNonField('age', 'number', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'ADD_DECORATOR',
                    uri: modelUri,
                    description: "Add @Integer decorator to 'age'.",
                    payload: {
                        fieldMetadata: fieldMeta,
                        decoratorName: 'Integer',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change);
                
                assert.ok(workspaceEdit);
                
                const entries = workspaceEdit.entries();
                const [editUri, textEdits] = entries[0];
                
                assert.strictEqual(editUri.toString(), modelUri.toString());
                assert.strictEqual(textEdits.length, 1);
                
                const textEdit = textEdits[0];
                assert.strictEqual(textEdit.newText, '@Integer()\n    ');
            });

            test('should handle field at first line of file', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(0, 0, 0, 4); // First line
                const fieldMeta = TestMetadataFactory.createNonField('name', 'string', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'ADD_DECORATOR',
                    uri: modelUri,
                    description: "Add @Field decorator to 'name'.",
                    payload: {
                        fieldMetadata: fieldMeta,
                        decoratorName: 'Field',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change);
                
                assert.ok(workspaceEdit);
                
                const entries = workspaceEdit.entries();
                const [editUri, textEdits] = entries[0];
                
                assert.strictEqual(editUri.toString(), modelUri.toString());
                assert.strictEqual(textEdits.length, 1);
                
                const textEdit = textEdits[0];
                assert.strictEqual(textEdit.range.start.line, 0);
                assert.strictEqual(textEdit.range.start.character, 0);
                assert.strictEqual(textEdit.newText, '@Field()\n    ');
            });
        });

        suite('Edge Cases', () => {
            test('should handle field with existing decorators', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(8, 4, 8, 8);
                const fieldMeta = TestMetadataFactory.createField({
                    name: 'name',
                    type: 'string',
                    declaration: { uri: modelUri, range: fieldRange }
                });
                
                // Field already has @Field decorator, adding another one
                const change: ChangeObject = {
                    type: 'ADD_DECORATOR',
                    uri: modelUri,
                    description: "Add @Text decorator to 'name'.",
                    payload: {
                        fieldMetadata: fieldMeta,
                        decoratorName: 'Text',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change);
                
                assert.ok(workspaceEdit);
                
                const entries = workspaceEdit.entries();
                const [editUri, textEdits] = entries[0];
                
                assert.strictEqual(editUri.toString(), modelUri.toString());
                assert.strictEqual(textEdits.length, 1);
                
                const textEdit = textEdits[0];
                assert.strictEqual(textEdit.newText, '@Text()\n    ');
            });

            test('should preserve position information correctly', async () => {
                const modelUri = vscode.Uri.file('/test/src/data/models/User.ts');
                const fieldRange = new vscode.Range(15, 12, 15, 18); // Random line and column
                const fieldMeta = TestMetadataFactory.createNonField('status', 'string', modelUri, fieldRange);

                const change: ChangeObject = {
                    type: 'ADD_DECORATOR',
                    uri: modelUri,
                    description: "Add @Choice decorator to 'status'.",
                    payload: {
                        fieldMetadata: fieldMeta,
                        decoratorName: 'Choice',
                        isManual: true
                    }
                };

                const workspaceEdit = await tool.prepareEdit(change);
                
                assert.ok(workspaceEdit);
                
                const entries = workspaceEdit.entries();
                const [editUri, textEdits] = entries[0];
                
                assert.strictEqual(editUri.toString(), modelUri.toString());
                assert.strictEqual(textEdits.length, 1);
                
                const textEdit = textEdits[0];
                assert.strictEqual(textEdit.range.start.line, fieldRange.start.line);
                assert.strictEqual(textEdit.range.start.character, fieldRange.start.character);
                assert.strictEqual(textEdit.newText, '@Choice()\n    ');
            });
        });
    });
}



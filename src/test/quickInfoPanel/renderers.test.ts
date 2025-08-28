import * as assert from 'assert';
import * as vscode from 'vscode';
import { ModelRenderer } from '../../quickInfoPanel/renderers/modelRenderer';
import { FieldRenderer } from '../../quickInfoPanel/renderers/fieldRenderer';
import { BaseRenderer } from '../../quickInfoPanel/renderers/baseRenderer';
import { rendererRegistry } from '../../quickInfoPanel/renderers/rendererRegistry';
import { IRendererContext } from '../../quickInfoPanel/renderers/iMetadataRenderer';
import { DecoratedClass, PropertyMetadata } from '../../cache/cache';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';

suite('Renderer Tests', () => {
    let mockContext: IRendererContext;
    let mockWebview: vscode.Webview;

    setup(() => {
        mockContext = TestContextFactory.createMockContext();
        mockWebview = mockContext.webview;
    });

    suite('BaseRenderer', () => {
        test('should be extensible', () => {
            class TestRenderer extends BaseRenderer {
                public render(metadata: any, context: IRendererContext): string {
                    return '<div>Test</div>';
                }
            }

            const renderer = new TestRenderer();
            const result = renderer.render({}, mockContext);
            
            assert.strictEqual(result, '<div>Test</div>');
        });

        test('should provide helper methods for table rows', () => {
            class TestRenderer extends BaseRenderer {
                public render(metadata: any, context: IRendererContext): string {
                    return this._renderTableRow('Label', 'Value');
                }

                // Make the protected method public for testing
                public testRenderTableRow(label: string, value: any): string {
                    return this._renderTableRow(label, value);
                }
            }

            const renderer = new TestRenderer();
            const result = renderer.testRenderTableRow('Label', 'Value');
            
            assert.ok(result.includes('Label'), 'Should include label');
            assert.ok(result.includes('Value'), 'Should include value');
        });
    });

    suite('ModelRenderer', () => {
        let modelRenderer: ModelRenderer;

        setup(() => {
            modelRenderer = new ModelRenderer();
        });

        test('should render model metadata correctly', () => {
            const mockModelMetadata = TestMetadataFactory.createModelWithFields('TestModel', [
                { name: 'testField', type: 'string' }
            ]);

            const result = modelRenderer.render(mockModelMetadata, mockContext);

            assert.ok(result.includes('TestModel'), 'Should include model name');
            assert.ok(result.includes('Model'), 'Should include model tag');
            assert.ok(result.includes('testField'), 'Should include field name');
            assert.ok(result.includes('Fields'), 'Should include fields section');
        });

        test('should handle models without fields', () => {
            const mockModelMetadata = TestMetadataFactory.createEmptyModel('EmptyModel');

            const result = modelRenderer.render(mockModelMetadata, mockContext);

            assert.ok(result.includes('EmptyModel'), 'Should include model name');
            assert.ok(!result.includes('Fields'), 'Should not include fields section');
        });

        test('should create clickable field links', () => {
            const mockModelMetadata = TestMetadataFactory.createModelWithFields('TestModel', [
                { name: 'testField', type: 'string' }
            ]);

            const result = modelRenderer.render(mockModelMetadata, mockContext);

            assert.ok(result.includes('data-command'), 'Should include clickable command data');
            assert.ok(result.includes('itemClicked'), 'Should include itemClicked command');
        });

        test('should handle model type fields as clickable', () => {
            const mockModelMetadata = TestMetadataFactory.createModel({
                name: 'TestModel',
                properties: {
                    modelField: TestMetadataFactory.createField({
                        name: 'modelField',
                        type: 'TestModel'
                    })
                }
            });

            const result = modelRenderer.render(mockModelMetadata, mockContext);

            assert.ok(result.includes('clickable-type'), 'Should mark model types as clickable');
        });
    });

    suite('FieldRenderer', () => {
        let fieldRenderer: FieldRenderer;

        setup(() => {
            fieldRenderer = new FieldRenderer();
        });

        test('should render field metadata correctly', () => {
            const mockFieldMetadata = TestMetadataFactory.createField({
                name: 'testField',
                type: 'string'
            });

            const result = fieldRenderer.render(mockFieldMetadata, mockContext);

            assert.ok(result.includes('testField'), 'Should include field name');
            assert.ok(result.includes('Field'), 'Should include field tag');
            assert.ok(result.includes('string'), 'Should include field type');
        });

        test('should create clickable field title', () => {
            const mockFieldMetadata = TestMetadataFactory.createField({
                name: 'testField',
                type: 'string'
            });

            const result = fieldRenderer.render(mockFieldMetadata, mockContext);

            assert.ok(result.includes('data-command'), 'Should include clickable command data');
            assert.ok(result.includes('goToLocation'), 'Should include goToLocation command');
        });

        test('should display field decorators', () => {
            const mockFieldMetadata = TestMetadataFactory.createFieldWithType('testField', 'string', [
                { name: 'Field', arguments: [{ type: 'text' }] },
                { name: 'Required', arguments: ["true"] }
            ]);

            const result = fieldRenderer.render(mockFieldMetadata, mockContext);

            assert.ok(result.includes('Field'), 'Should include Field decorator');
            // The decorator rendering is handled by BaseRenderer
            assert.ok(result.includes('table'), 'Should include table structure');
        });
    });

    suite('RendererRegistry', () => {
        test('should contain model renderer', () => {
            const modelRenderer = rendererRegistry.get('model');
            assert.ok(modelRenderer, 'Should have model renderer');
            assert.ok(modelRenderer instanceof ModelRenderer, 'Should be instance of ModelRenderer');
        });

        test('should contain field renderer', () => {
            const fieldRenderer = rendererRegistry.get('field');
            assert.ok(fieldRenderer, 'Should have field renderer');
            assert.ok(fieldRenderer instanceof FieldRenderer, 'Should be instance of FieldRenderer');
        });

        test('should return undefined for unknown types', () => {
            const unknownRenderer = rendererRegistry.get('unknown');
            assert.strictEqual(unknownRenderer, undefined, 'Should return undefined for unknown types');
        });

        test('should be extensible for new renderer types', () => {
            class TestRenderer extends BaseRenderer {
                public render(metadata: any, context: IRendererContext): string {
                    return '<div>Test</div>';
                }
            }

            // Test that registry can be extended
            const testRegistry = new Map(rendererRegistry);
            testRegistry.set('test', new TestRenderer());

            const testRenderer = testRegistry.get('test');
            assert.ok(testRenderer, 'Should be able to add new renderer types');
        });
    });

    suite('Renderer Integration', () => {
        test('should handle context properly', () => {
            const modelRenderer = new ModelRenderer();
            const mockModelMetadata = TestMetadataFactory.createModel({
                name: 'TestModel'
            });

            // Should not throw when using context
            const result = modelRenderer.render(mockModelMetadata, mockContext);
            assert.ok(result, 'Should return rendered content');
        });

        test('should use webview URI conversion', () => {
            const fieldRenderer = new FieldRenderer();
            const mockFieldMetadata = TestMetadataFactory.createField({
                name: 'testField',
                type: 'string'
            });

            // Should not throw when using webview context
            const result = fieldRenderer.render(mockFieldMetadata, mockContext);
            assert.ok(result, 'Should return rendered content');
        });
    });
});

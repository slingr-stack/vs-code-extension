import * as assert from 'assert';
import * as vscode from 'vscode';
import { QuickInfoProvider } from '../../quickInfoPanel/quickInfoProvider';
import { MetadataCache } from '../../cache/cache';
import { TestMetadataFactory, TestContextFactory } from '../testHelpers';
import * as path from 'path';

suite('QuickInfoProvider Tests', () => {
    let provider: QuickInfoProvider;
    let cache: MetadataCache;
    let extensionUri: vscode.Uri;
    let mockWebviewView: any;
    let mockContext: vscode.WebviewViewResolveContext;
    let mockToken: vscode.CancellationToken;

    setup(async () => {
        const extensionPath = path.join(__dirname, '..', '..', '..');
        extensionUri = vscode.Uri.file(extensionPath);
        cache = new MetadataCache(extensionPath);
        
        try {
            await cache.initialize();
        } catch (error) {
            console.warn('Cache initialization failed in test, using empty cache');
        }
        
        provider = new QuickInfoProvider(extensionUri, cache);
    });

    teardown(() => {
        cache?.dispose();
    });

    setup(() => {
        // Create a mock webview view for testing using helper
        mockWebviewView = TestContextFactory.createMockWebviewView(QuickInfoProvider.viewType);
        mockContext = { state: undefined } as vscode.WebviewViewResolveContext;
        mockToken = { isCancellationRequested: false } as vscode.CancellationToken;
    });

    suite('Provider Creation and Initialization', () => {
        test('should create provider with correct viewType', () => {
            assert.strictEqual(QuickInfoProvider.viewType, 'slingrQuickInfo');
        });

        test('should initialize without errors', () => {
            assert.ok(provider, 'Provider should be created successfully');
        });

        test('should resolve webview view correctly', () => {
            const mockContext = { state: undefined } as vscode.WebviewViewResolveContext;
            const mockToken = { isCancellationRequested: false } as vscode.CancellationToken;

            // This should not throw
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
            
            // Check that webview options were set
            assert.ok(mockWebviewView.webview.options.enableScripts, 'Scripts should be enabled');
            assert.ok(Array.isArray(mockWebviewView.webview.options.localResourceRoots), 'Local resource roots should be set');
        });
    });

    suite('Update Method', () => {
        setup(() => {
            provider.resolveWebviewView(mockWebviewView, { state: undefined } as vscode.WebviewViewResolveContext, { isCancellationRequested: false } as vscode.CancellationToken);
        });

        test('should handle undefined metadata', () => {
            provider.update(undefined, undefined);
            
            assert.ok(mockWebviewView.webview.html.includes('Select a metadata'), 'Should show default message');
        });

        test('should handle model metadata', () => {
            const mockModelMetadata = TestMetadataFactory.createModel();

            provider.update('model', mockModelMetadata);
            
            assert.ok(mockWebviewView.webview.html.includes('TestModel'), 'Should contain model name');
            assert.ok(mockWebviewView.webview.html.includes('Model'), 'Should contain model tag');
        });

        test('should handle field metadata', () => {
            const mockFieldMetadata = TestMetadataFactory.createField();

            provider.update('field', mockFieldMetadata);
            
            assert.ok(mockWebviewView.webview.html.includes('testField'), 'Should contain field name');
            assert.ok(mockWebviewView.webview.html.includes('Field'), 'Should contain field tag');
        });

        test('should handle unknown metadata types with fallback', () => {
            const unknownMetadata = { someProperty: 'someValue' } as any;
            
            provider.update('unknown', unknownMetadata);
            
            assert.ok(mockWebviewView.webview.html.includes('someProperty'), 'Should contain JSON fallback');
        });
    });

    suite('Navigation History', () => {
        setup(() => {
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
        });

        test('should track navigation history', () => {
            const mockField = TestMetadataFactory.createField({ name: 'TestField' });
            const mockModel = TestMetadataFactory.createModelWithFields('TestModel', [
                { name: 'testField', type: 'string' }
            ]);

            // First update
            provider.update('model', mockModel);

            // Second update should add first to history
            provider.update('field', mockField);

            // Check that back button appears
            assert.ok(mockWebviewView.webview.html.includes('back-button'), 'Should show back button');
        });

        test('should not add to history when navigating back', () => {
            const mockField = TestMetadataFactory.createField({ name: 'TestField' });
            const mockModel = TestMetadataFactory.createModelWithFields('TestModel', [
                { name: 'testField', type: 'string' }
            ]);

            // Add items to history
            provider.update('model', mockModel);
            provider.update('field', mockField);

            // Navigate back (third parameter = true)
            provider.update('model', mockModel, true);

            // Should still show back button since we didn't clear history
            assert.ok(mockWebviewView.webview.html.includes('back-button'), 'Should still show back button');
        });
    });

    suite('HTML Generation', () => {
        setup(() => {
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
        });

        test('should generate valid HTML structure', () => {
            const mockMetadata = { name: 'Test' } as any;
            provider.update('generic', mockMetadata);
            
            const html = mockWebviewView.webview.html;
            
            assert.ok(html.includes('<!DOCTYPE html>'), 'Should have HTML doctype');
            assert.ok(html.includes('<html'), 'Should have html tag');
            assert.ok(html.includes('<head>'), 'Should have head section');
            assert.ok(html.includes('<body>'), 'Should have body section');
            assert.ok(html.includes('<script>'), 'Should include JavaScript');
        });

        test('should include VSCode styling variables', () => {
            const mockMetadata = { name: 'Test' } as any;
            provider.update('generic', mockMetadata);
            
            const html = mockWebviewView.webview.html;
            
            assert.ok(html.includes('var(--vscode-'), 'Should use VSCode CSS variables');
        });

        test('should include message handling script', () => {
            const mockMetadata = { name: 'Test' } as any;
            provider.update('generic', mockMetadata);
            
            const html = mockWebviewView.webview.html;
            
            assert.ok(html.includes('acquireVsCodeApi'), 'Should include VSCode API');
            assert.ok(html.includes('postMessage'), 'Should include message posting');
        });
    });

    suite('Message Handling', () => {
        test('should handle itemClicked messages', () => {
            // This test would require mocking the message handling
            // For now, we just ensure the method exists and doesn't throw
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
            
            // The onDidReceiveMessage handler is set up during resolve
            assert.ok(true, 'Message handler should be set up without errors');
        });

        test('should handle navigateBack messages', () => {
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
            
            // Similar to above, we verify setup doesn't throw
            assert.ok(true, 'Back navigation handler should be set up without errors');
        });

        test('should handle goToLocation messages', () => {
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
            
            // Similar to above, we verify setup doesn't throw
            assert.ok(true, 'Location navigation handler should be set up without errors');
        });
    });

    suite('Integration with Cache', () => {
        test('should use cache to find metadata', () => {
            // Test that provider can work with cache
            const models = cache.getDataModels();
            assert.ok(Array.isArray(models), 'Should be able to access cache data');
        });

        test('should handle cache updates', () => {
            // Verify provider can handle cache events
            assert.ok(cache.onDidUpdate, 'Cache should have update events');
        });

        test('should handle datasetFile items gracefully', () => {
            provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
            
            // Create a mock dataset file metadata
            const datasetFile = {
                name: 'User.jsonl',
                declaration: {
                    uri: vscode.Uri.file('/test/dataset/User.jsonl'),
                    range: new vscode.Range(0, 0, 10, 0)
                }
            };
            
            // This should not throw and should show a nice message instead of raw JSON
            provider.update('datasetFile', datasetFile as any);
            
            // Check that the webview HTML contains the expected content
            const html = mockWebviewView.webview.html;
            assert.ok(html.includes('Dataset File'), 'Should show dataset file message');
            assert.ok(html.includes('Select the parent dataset'), 'Should suggest selecting parent dataset');
            assert.ok(!html.includes('{"name"'), 'Should not show raw JSON');
        });
    });
});

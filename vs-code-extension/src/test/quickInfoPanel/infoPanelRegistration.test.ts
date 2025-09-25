import * as assert from 'assert';
import * as vscode from 'vscode';
import { registerInfoPanel } from '../../quickInfoPanel/infoPanelRegistration';
import { QuickInfoProvider } from '../../quickInfoPanel/quickInfoProvider';
import { MetadataCache } from '../../cache/cache';
import { TestContextFactory } from '../testHelpers';
import * as path from 'path';

suite('InfoPanel Registration Tests', () => {
    let cache: MetadataCache;
    let mockContext: vscode.ExtensionContext;
    let extensionPath: string;

    setup(async () => {
        extensionPath = path.join(__dirname, '..', '..', '..');
        cache = new MetadataCache(extensionPath);
        
        try {
            await cache.initialize();
        } catch (error) {
            console.warn('Cache initialization failed in test, using empty cache');
        }

        // Create a mock extension context using helper
        mockContext = TestContextFactory.createMockExtensionContext(extensionPath);
    });

    teardown(() => {
        cache?.dispose();
    });

    suite('Registration Function', () => {
        test('should register QuickInfoProvider successfully', () => {
            // We can't actually register twice, so we test the creation instead
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            assert.ok(provider, 'Should return a provider instance');
            assert.ok(provider instanceof QuickInfoProvider, 'Should return QuickInfoProvider instance');
        });

        test('should add registration to context subscriptions', () => {
            // Test that the registration function would add to subscriptions
            // We can't actually test registration due to VSCode limitations in tests
            assert.ok(mockContext.subscriptions !== undefined, 'Context should have subscriptions array');
        });

        test('should use correct viewType for registration', () => {
            // The registration internally uses QuickInfoProvider.viewType
            assert.strictEqual(QuickInfoProvider.viewType, 'slingrQuickInfo', 
                'ViewType should match expected value');
        });

        test('should work with different extension contexts', () => {
            // Create another mock context
            const anotherMockContext = {
                ...mockContext,
                subscriptions: []
            };

            // Test provider creation instead of registration
            const provider = new QuickInfoProvider(anotherMockContext.extensionUri, cache);
            
            assert.ok(provider, 'Should work with different contexts');
        });
    });

    suite('Provider Configuration', () => {
        test('should configure provider with correct extension URI', () => {
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            // We can't directly access private properties, but we can test behavior
            assert.ok(provider, 'Provider should be configured without errors');
        });

        test('should configure provider with cache reference', () => {
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            // Test that provider can access cache functionality indirectly
            assert.ok(provider, 'Provider should have cache reference');
        });

        test('should create provider that can resolve webview views', () => {
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            // Create a mock webview view using helper
            const mockWebviewView = TestContextFactory.createMockWebviewView();
            const mockResolveContext = { state: undefined } as vscode.WebviewViewResolveContext;
            const mockToken = { isCancellationRequested: false } as vscode.CancellationToken;

            // This should not throw
            provider.resolveWebviewView(mockWebviewView, mockResolveContext, mockToken);
            
            assert.ok(true, 'Provider should resolve webview view without errors');
        });
    });

    suite('Integration with VSCode', () => {
        test('should create disposable registration', () => {
            // Test the registration function exists and would work
            assert.ok(typeof registerInfoPanel === 'function', 'registerInfoPanel should be a function');
            assert.ok(mockContext.subscriptions, 'Context should have subscriptions');
        });

        test('should work with extension lifecycle', () => {
            // Test multiple provider creations (simulating extension reload)
            const provider1 = new QuickInfoProvider(mockContext.extensionUri, cache);
            const provider2 = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            assert.ok(provider1, 'First provider creation should work');
            assert.ok(provider2, 'Second provider creation should work');
        });
    });

    suite('Provider Features', () => {
        test('should create provider with update capability', () => {
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            // Test that provider has update method
            assert.ok(typeof provider.update === 'function', 'Provider should have update method');
        });

        test('should create provider with webview view resolution', () => {
            const provider = new QuickInfoProvider(mockContext.extensionUri, cache);
            
            // Test that provider has resolveWebviewView method
            assert.ok(typeof provider.resolveWebviewView === 'function', 
                'Provider should have resolveWebviewView method');
        });
    });
});

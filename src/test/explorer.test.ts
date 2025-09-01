import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { before, after, describe, it } from 'mocha';
import { ExplorerProvider } from '../explorer/explorerProvider';
import { MetadataCache, DecoratedClass, PropertyMetadata, DecoratorMetadata } from '../cache/cache';
import { AppTreeItem } from '../explorer/appTreeItem';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof describe !== 'undefined') {
describe('Explorer Provider Tests', () => {
    let explorerProvider: ExplorerProvider;
    let mockCache: MetadataCache;
    let extensionUri: vscode.Uri;

    before(async () => {
        // Setup test environment
        extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));
        
        // Create a mock cache or use a test workspace
        // For now, we'll create a minimal mock
        mockCache = createMockCache();
        explorerProvider = new ExplorerProvider(mockCache, extensionUri);
    });

    describe('Root Level Items', () => {
        it('should return Data root item when no element is provided', async () => {
            const children = await explorerProvider.getChildren();
            
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'Data');
            assert.strictEqual(children[0].itemType, 'dataRoot');
            assert.strictEqual(children[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        });
    });

    describe('Data Root Children', () => {
        it('should return models from data folder when dataRoot is expanded', async () => {
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await explorerProvider.getChildren(dataRootItem);
            
            // Should return the mock models (sorted alphabetically by label)
            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].label, 'ProjectModel'); // alphabetically first
            assert.strictEqual(children[0].itemType, 'model');
            assert.strictEqual(children[1].label, 'UserModel');
            assert.strictEqual(children[1].itemType, 'model');
        });

        it('should return empty array when no models exist', async () => {
            // Create an empty cache
            const emptyCache = createEmptyMockCache();
            const emptyExplorer = new ExplorerProvider(emptyCache, extensionUri);
            
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await emptyExplorer.getChildren(dataRootItem);
            assert.strictEqual(children.length, 0);
        });
    });

    describe('Model Children', () => {
        it('should return properties for a model', async () => {
            const mockModel = createMockModel();
            const modelItem = new AppTreeItem(
                'User Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );

            const children = await explorerProvider.getChildren(modelItem);
            
            assert.strictEqual(children.length, 2); // name and email properties
            assert.strictEqual(children[0].itemType, 'field');
            assert.strictEqual(children[1].itemType, 'field');
        });

        it('should return empty array for model without properties', async () => {
            const mockModel = createMockModel();
            mockModel.properties = {}; // No properties
            
            const modelItem = new AppTreeItem(
                'Empty Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );

            const children = await explorerProvider.getChildren(modelItem);
            assert.strictEqual(children.length, 0);
        });
    });

    describe('Tree Item Properties', () => {
        it('should create tree item with correct properties', () => {
            const mockModel = createMockModel();
            const treeItem = explorerProvider.getTreeItem(
                new AppTreeItem(
                    'Test Model',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'model',
                    extensionUri,
                    mockModel
                )
            );

            assert.strictEqual(treeItem.label, 'Test Model');
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            assert.strictEqual(treeItem.contextValue, 'model');
        });

        it('should set navigation command for property items', async () => {
            const mockModel = createMockModel();
            const modelItem = new AppTreeItem(
                'User Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );

            const children = await explorerProvider.getChildren(modelItem);
            const fieldItem = children[0];

            assert.ok(fieldItem.command);
            assert.strictEqual(fieldItem.command.command, 'slingr-vscode-extension.navigateToCode');
            assert.strictEqual(fieldItem.command.title, 'Go to Definition');
        });
    });
});
}

// Helper functions to create mock data
function createMockCache(): MetadataCache {
    const mockCache = {
        getDataModelClasses: () => [
            createMockModel('UserModel', 'User Model'),
            createMockModel('ProjectModel', 'ProjectModel')
        ],
        getDataModels: () => [
            createMockModel('UserModel', 'User Model'),
            createMockModel('ProjectModel', 'ProjectModel')
        ],
        onDidUpdate: () => ({ dispose: () => {} }),
        dispose: () => {},
        initialize: async () => {},
        findMetadata: () => []
    } as any;
    
    return mockCache;
}

function createEmptyMockCache(): MetadataCache {
    const mockCache = {
        getDataModelClasses: () => [],
        getDataModels: () => [],
        onDidUpdate: () => ({ dispose: () => {} }),
        dispose: () => {},
        initialize: async () => {},
        findMetadata: () => []
    } as any;
    
    return mockCache;
}

function createMockModel(name: string = 'TestModel', displayName: string = 'Test Model'): DecoratedClass {
    const filePath = `/test/${name.toLowerCase()}.ts`;
    
    return {
        name: name,
        decorators: [
            { name: 'Model', arguments: [], position: new vscode.Range(0, 0, 0, 6) }
        ],
        properties: {
            'name': createMockProperty('name', 'string'),
            'email': createMockProperty('email', 'string')
        },
        methods: {},
        references: [],
        isDataModel: true,
        declaration: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(0, 0, 0, 10)
        )
    };
}

function createMockProperty(name: string, type: string = 'string'): PropertyMetadata {
    const filePath = `/test/model.ts`;
    
    return {
        name: name,
        type: type,
        decorators: [
            { name: 'Field', arguments: [], position: new vscode.Range(5, 0, 5, 6) }
        ],
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(5, 0, 5, 10)
        )
    };
}
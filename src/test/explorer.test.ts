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
            assert.strictEqual(children[1].label, 'User Model'); // alphabetically second
            assert.strictEqual(children[1].itemType, 'model');
        });

        it('should return empty array when no data models exist', async () => {
            const emptyCache = createEmptyMockCache();
            const emptyExplorerProvider = new ExplorerProvider(emptyCache, extensionUri);
            
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await emptyExplorerProvider.getChildren(dataRootItem);
            assert.strictEqual(children.length, 0);
        });

        it('should display folders when models are in subfolders', async () => {
            const cacheWithFolders = createMockCacheWithFolders();
            const folderExplorerProvider = new ExplorerProvider(cacheWithFolders, extensionUri);
            
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await folderExplorerProvider.getChildren(dataRootItem);
            
            // Should have 1 model in root and 1 folder
            assert.strictEqual(children.length, 2);
            
            // First should be the folder (alphabetically)
            assert.strictEqual(children[0].label, 'models');
            assert.strictEqual(children[0].itemType, 'folder');
            
            // Second should be the model
            assert.strictEqual(children[1].label, 'Root Model');
            assert.strictEqual(children[1].itemType, 'model');
        });

        it('should display models inside folders when folder is expanded', async () => {
            const cacheWithFolders = createMockCacheWithFolders();
            const folderExplorerProvider = new ExplorerProvider(cacheWithFolders, extensionUri);
            
            // Create folder item
            const folderItem = new AppTreeItem(
                'models',
                vscode.TreeItemCollapsibleState.Collapsed,
                'folder',
                extensionUri,
                undefined,
                undefined,
                'models'
            );

            const children = await folderExplorerProvider.getChildren(folderItem);
            
            // Should have 1 model in the models folder
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'Folder Model');
            assert.strictEqual(children[0].itemType, 'model');
        });
    });

    describe('Model Children', () => {
        it('should return fields when model is expanded', async () => {
            const mockModel = createMockModel();
            const modelItem = new AppTreeItem(
                'User Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );

            const children = await explorerProvider.getChildren(modelItem);
            
            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].itemType, 'field');
            assert.strictEqual(children[1].itemType, 'field');
        });

        it('should return empty array when model has no fields', async () => {
            const mockModelNoFields = createMockModelWithoutFields();
            const modelItem = new AppTreeItem(
                'Empty Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModelNoFields
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

    describe('Drag and Drop', () => {
        it('should handle drag operation for field items', () => {
            const mockProperty = createMockProperty('testField');
            const mockModel = createMockModel();
            const parentItem = new AppTreeItem(
                'User Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );
            
            const fieldItem = new AppTreeItem(
                'Test Field',
                vscode.TreeItemCollapsibleState.None,
                'field',
                extensionUri,
                mockProperty,
                parentItem
            );

            const dataTransfer = new vscode.DataTransfer();
            const token = new vscode.CancellationTokenSource().token;

            // This should not throw an error
            explorerProvider.handleDrag([fieldItem], dataTransfer, token);
            
            // Check if data was set (requires checking the MIME type)
            const transferItem = dataTransfer.get('application/vnd.slingr-vscode-extension.field');
            assert.ok(transferItem, 'Drag data should be set');
        });

        it('should not handle drag for non-field items', () => {
            const mockModel = createMockModel();
            const modelItem = new AppTreeItem(
                'User Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                mockModel
            );

            const dataTransfer = new vscode.DataTransfer();
            const token = new vscode.CancellationTokenSource().token;

            explorerProvider.handleDrag([modelItem], dataTransfer, token);
            
            // Should not set any data for non-field items
            const transferItem = dataTransfer.get('application/vnd.slingr-vscode-extension.field');
            assert.strictEqual(transferItem, undefined);
        });

        it('should handle drag operation for composition model items', () => {
            const childModel = createMockModel('ChildModel', 'Child Model', '/test/project/src/data/child-model.ts');
            const parentModel = createMockModel('ParentModel', 'Parent Model', '/test/project/src/data/parent-model.ts');
            
            // Add a composition relationship property to the parent model
            parentModel.properties['children'] = {
                name: 'children',
                type: 'ChildModel',
                decorators: [
                    {
                        name: 'Field',
                        arguments: [{ label: 'Children' }],
                        position: new vscode.Range(0, 0, 0, 10)
                    },
                    {
                        name: 'Relationship',
                        arguments: [{ type: 'Composition' }],
                        position: new vscode.Range(0, 0, 0, 10)
                    }
                ],
                references: [],
                declaration: new vscode.Location(
                    vscode.Uri.file('/test/project/src/data/parent-model.ts'),
                    new vscode.Range(5, 0, 5, 10)
                )
            };

            const parentItem = new AppTreeItem(
                'Parent Model',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                parentModel
            );
            
            const compositionItem = new AppTreeItem(
                'Children',
                vscode.TreeItemCollapsibleState.Collapsed,
                'model',
                extensionUri,
                childModel,
                parentItem
            );

            const dataTransfer = new vscode.DataTransfer();
            const token = new vscode.CancellationTokenSource().token;

            // This should handle drag for composition model items
            explorerProvider.handleDrag([compositionItem], dataTransfer, token);
            
            const transferItem = dataTransfer.get('application/vnd.slingr-vscode-extension.field');
            assert.ok(transferItem, 'Drag data should be set for composition model items');
            
            const dragData = transferItem.value;
            assert.strictEqual(dragData.field, 'children', 'Should drag the composition field name');
            assert.strictEqual(dragData.modelClassName, 'ParentModel', 'Should reference the parent model class');
        });
    });
});

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
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createEmptyMockCache(): MetadataCache {
    const mockCache = {
        getDataModelClasses: () => [],
        getDataModels: () => [],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createMockCacheWithFolders(): MetadataCache {
    const mockCache = {
        getDataModelClasses: () => [
            createMockModel('RootModel', 'Root Model', '/test/project/src/data/root-model.ts'),
            createMockModel('FolderModel', 'Folder Model', '/test/project/src/data/models/folder-model.ts')
        ],
        getDataModels: () => [
            createMockModel('RootModel', 'Root Model', '/test/project/src/data/root-model.ts'),
            createMockModel('FolderModel', 'Folder Model', '/test/project/src/data/models/folder-model.ts')
        ],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createMockCacheWithComposition(): MetadataCache {
    // Create child model that will be referenced by composition
    const childModel = createMockModel('ChildModel', 'Child Model', '/test/project/src/data/child-model.ts');
    
    // Create parent model with composition relationship to child
    const parentModel = createMockModel('ParentModel', 'Parent Model', '/test/project/src/data/parent-model.ts');
    
    // Add composition relationship field to parent model
    parentModel.properties['child'] = {
        name: 'child',
        type: 'ChildModel',
        decorators: [
            {
                name: 'Field',
                arguments: [{ label: 'Child' }],
                position: new vscode.Range(0, 0, 0, 10)
            },
            {
                name: 'Relationship',
                arguments: [{ type: 'Composition' }],
                position: new vscode.Range(0, 0, 0, 10)
            }
        ],
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file('/test/project/src/data/parent-model.ts'),
            new vscode.Range(5, 0, 5, 10)
        )
    };
    
    // Add reference from parent to child model
    childModel.references = [
        new vscode.Location(
            vscode.Uri.file('/test/project/src/data/parent-model.ts'),
            new vscode.Range(5, 0, 5, 10)
        )
    ];
    
    const mockCache = {
        getDataModelClasses: () => [parentModel, childModel],
        getDataModels: () => [parentModel, childModel],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: (filePath: string) => {
            if (filePath === '/test/project/src/data/parent-model.ts') {
                return {
                    uri: vscode.Uri.file(filePath),
                    classes: {
                        'ParentModel': parentModel
                    }
                };
            }
            return undefined;
        }
    } as any;

    return mockCache;
}

function createMockModel(name: string = 'UserModel', label?: string, filePath: string = '/test/project/src/data/model.ts'): DecoratedClass {
    return {
        name,
        decorators: [
            {
                name: 'Model',
                arguments: [{ label: label || name }],
                position: new vscode.Range(0, 0, 0, 10)
            }
        ],
        properties: {
            'name': createMockProperty('name', 'User Name'),
            'email': createMockProperty('email', 'emailField')
        },
        methods: {},
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(0, 0, 0, 10)
        ),
        isDataModel: true
    };
}

function createMockModelWithoutFields(): DecoratedClass {
    return {
        name: 'EmptyModel',
        decorators: [
            {
                name: 'Model',
                arguments: [{ label: 'Empty Model' }],
                position: new vscode.Range(0, 0, 0, 10)
            }
        ],
        properties: {},
        methods: {},
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file('/test/project/src/data/empty-model.ts'),
            new vscode.Range(0, 0, 0, 10)
        ),
        isDataModel: true
    };
}

function createMockProperty(name: string, label?: string, filePath: string = '/test/project/src/data/model.ts'): PropertyMetadata {
    return {
        name,
        type: 'string',
        decorators: [
            {
                name: 'Field',
                arguments: [{ label: label || name }],
                position: new vscode.Range(0, 0, 0, 10)
            }
        ],
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(5, 0, 5, 10)
        )
    };
}
}

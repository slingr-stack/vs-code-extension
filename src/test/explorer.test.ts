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
        it('should return entities from data folder when dataRoot is expanded', async () => {
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await explorerProvider.getChildren(dataRootItem);
            
            // Should return the mock entities (sorted alphabetically by label)
            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].label, 'ProjectEntity'); // alphabetically first
            assert.strictEqual(children[0].itemType, 'entity');
            assert.strictEqual(children[1].label, 'User Entity'); // alphabetically second
            assert.strictEqual(children[1].itemType, 'entity');
        });

        it('should return empty array when no data entities exist', async () => {
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

        it('should display folders when entities are in subfolders', async () => {
            const cacheWithFolders = createMockCacheWithFolders();
            const folderExplorerProvider = new ExplorerProvider(cacheWithFolders, extensionUri);
            
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await folderExplorerProvider.getChildren(dataRootItem);
            
            // Should have 1 entity in root and 1 folder
            assert.strictEqual(children.length, 2);
            
            // First should be the folder (alphabetically)
            assert.strictEqual(children[0].label, 'models');
            assert.strictEqual(children[0].itemType, 'folder');
            
            // Second should be the entity
            assert.strictEqual(children[1].label, 'Root Entity');
            assert.strictEqual(children[1].itemType, 'entity');
        });

        it('should display entities inside folders when folder is expanded', async () => {
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
            
            // Should have 1 entity in the models folder
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'Folder Entity');
            assert.strictEqual(children[0].itemType, 'entity');
        });

        it('should filter out entities referenced by composition relationships', async () => {
            const cacheWithComposition = createMockCacheWithComposition();
            const compositionExplorerProvider = new ExplorerProvider(cacheWithComposition, extensionUri);
            
            const dataRootItem = new AppTreeItem(
                'Data',
                vscode.TreeItemCollapsibleState.Expanded,
                'dataRoot',
                extensionUri
            );

            const children = await compositionExplorerProvider.getChildren(dataRootItem);
            
            // Should only show the parent entity, not the child entity referenced by composition
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, 'Parent Entity');
            assert.strictEqual(children[0].itemType, 'entity');
        });
    });

    describe('Entity Children', () => {
        it('should return fields when entity is expanded', async () => {
            const mockEntity = createMockEntity();
            const entityItem = new AppTreeItem(
                'User Entity',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entity',
                extensionUri,
                mockEntity
            );

            const children = await explorerProvider.getChildren(entityItem);
            
            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0].itemType, 'field');
            assert.strictEqual(children[1].itemType, 'field');
        });

        it('should return empty array when entity has no fields', async () => {
            const mockEntityNoFields = createMockEntityWithoutFields();
            const entityItem = new AppTreeItem(
                'Empty Entity',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entity',
                extensionUri,
                mockEntityNoFields
            );

            const children = await explorerProvider.getChildren(entityItem);
            assert.strictEqual(children.length, 0);
        });
    });

    describe('Tree Item Properties', () => {
        it('should create tree item with correct properties', () => {
            const mockEntity = createMockEntity();
            const treeItem = explorerProvider.getTreeItem(
                new AppTreeItem(
                    'Test Entity',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entity',
                    extensionUri,
                    mockEntity
                )
            );

            assert.strictEqual(treeItem.label, 'Test Entity');
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            assert.strictEqual(treeItem.contextValue, 'entity');
        });

        it('should set navigation command for property items', async () => {
            const mockEntity = createMockEntity();
            const entityItem = new AppTreeItem(
                'User Entity',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entity',
                extensionUri,
                mockEntity
            );

            const children = await explorerProvider.getChildren(entityItem);
            const fieldItem = children[0];
            
            assert.ok(fieldItem.command);
            assert.strictEqual(fieldItem.command.command, 'slingr-vscode-extension.navigateToCode');
            assert.strictEqual(fieldItem.command.title, 'Go to Definition');
        });
    });

    describe('Drag and Drop', () => {
        it('should handle drag operation for field items', () => {
            const mockProperty = createMockProperty('testField');
            const mockEntity = createMockEntity();
            const parentItem = new AppTreeItem(
                'User Entity',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entity',
                extensionUri,
                mockEntity
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
            const mockEntity = createMockEntity();
            const entityItem = new AppTreeItem(
                'User Entity',
                vscode.TreeItemCollapsibleState.Collapsed,
                'entity',
                extensionUri,
                mockEntity
            );

            const dataTransfer = new vscode.DataTransfer();
            const token = new vscode.CancellationTokenSource().token;

            explorerProvider.handleDrag([entityItem], dataTransfer, token);
            
            // Should not set any data for non-field items
            const transferItem = dataTransfer.get('application/vnd.slingr-vscode-extension.field');
            assert.strictEqual(transferItem, undefined);
        });
    });
});

// Helper functions to create mock data
function createMockCache(): MetadataCache {
    const mockCache = {
        getDataEntityClasses: () => [
            createMockEntity('UserEntity', 'User Entity'),
            createMockEntity('ProjectEntity', 'ProjectEntity')
        ],
        getDataEntities: () => [
            createMockEntity('UserEntity', 'User Entity'),
            createMockEntity('ProjectEntity', 'ProjectEntity')
        ],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createEmptyMockCache(): MetadataCache {
    const mockCache = {
        getDataEntityClasses: () => [],
        getDataEntities: () => [],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createMockCacheWithFolders(): MetadataCache {
    const mockCache = {
        getDataEntityClasses: () => [
            createMockEntity('RootEntity', 'Root Entity', '/test/project/src/data/root-entity.ts'),
            createMockEntity('FolderEntity', 'Folder Entity', '/test/project/src/data/models/folder-entity.ts')
        ],
        getDataEntities: () => [
            createMockEntity('RootEntity', 'Root Entity', '/test/project/src/data/root-entity.ts'),
            createMockEntity('FolderEntity', 'Folder Entity', '/test/project/src/data/models/folder-entity.ts')
        ],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: () => undefined
    } as any;

    return mockCache;
}

function createMockCacheWithComposition(): MetadataCache {
    // Create child entity that will be referenced by composition
    const childEntity = createMockEntity('ChildEntity', 'Child Entity', '/test/project/src/data/child-entity.ts');
    
    // Create parent entity with composition relationship to child
    const parentEntity = createMockEntity('ParentEntity', 'Parent Entity', '/test/project/src/data/parent-entity.ts');
    
    // Add composition relationship field to parent entity
    parentEntity.properties['child'] = {
        name: 'child',
        type: 'ChildEntity',
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
            vscode.Uri.file('/test/project/src/data/parent-entity.ts'),
            new vscode.Range(5, 0, 5, 10)
        )
    };
    
    // Add reference from parent to child entity
    childEntity.references = [
        new vscode.Location(
            vscode.Uri.file('/test/project/src/data/parent-entity.ts'),
            new vscode.Range(5, 0, 5, 10)
        )
    ];
    
    const mockCache = {
        getDataEntityClasses: () => [parentEntity, childEntity],
        getDataEntities: () => [parentEntity, childEntity],
        onDidUpdate: new vscode.EventEmitter<void>().event,
        _onDidUpdate: new vscode.EventEmitter<void>(),
        getMetadataForFile: (filePath: string) => {
            if (filePath === '/test/project/src/data/parent-entity.ts') {
                return {
                    uri: vscode.Uri.file(filePath),
                    classes: {
                        'ParentEntity': parentEntity
                    }
                };
            }
            return undefined;
        }
    } as any;

    return mockCache;
}

function createMockEntity(name: string = 'UserEntity', label?: string, filePath: string = '/test/project/src/data/entity.ts'): DecoratedClass {
    return {
        name,
        decorators: [
            {
                name: 'Entity',
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
        isDataEntity: true
    };
}

function createMockEntityWithoutFields(): DecoratedClass {
    return {
        name: 'EmptyEntity',
        decorators: [
            {
                name: 'Entity',
                arguments: [{ label: 'Empty Entity' }],
                position: new vscode.Range(0, 0, 0, 10)
            }
        ],
        properties: {},
        methods: {},
        references: [],
        declaration: new vscode.Location(
            vscode.Uri.file('/test/project/src/data/empty-entity.ts'),
            new vscode.Range(0, 0, 0, 10)
        ),
        isDataEntity: true
    };
}

function createMockProperty(name: string, label?: string, filePath: string = '/test/project/src/data/entity.ts'): PropertyMetadata {
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

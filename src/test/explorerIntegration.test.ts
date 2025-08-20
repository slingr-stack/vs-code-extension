import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { before, after, describe, it } from 'mocha';
import { ExplorerProvider } from '../explorer/explorerProvider';
import { MetadataCache } from '../cache/cache';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof describe !== 'undefined') {
describe('Explorer Integration Tests', () => {
    let testWorkspaceUri: vscode.Uri;
    let cache: MetadataCache;
    let explorerProvider: ExplorerProvider;
    let extensionContext: vscode.ExtensionContext;

    before(async function() {
        // This test requires a real workspace with TypeScript files
        // Skip if no workspace is open
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            this.skip();
            return;
        }

        testWorkspaceUri = vscode.workspace.workspaceFolders[0].uri;
        
        // Create extension context mock
        extensionContext = {
            extensionPath: path.join(__dirname, '..', '..'),
            extensionUri: vscode.Uri.file(path.join(__dirname, '..', '..')),
        } as any;

        // Create test TypeScript files
        await createTestEntityFiles();

        // Initialize real cache and explorer
        cache = new MetadataCache(extensionContext.extensionPath);
        explorerProvider = new ExplorerProvider(cache, extensionContext.extensionUri);
        
        // Initialize cache
        await cache.initialize();
    });

    after(async () => {
        // Clean up test files
        await cleanupTestFiles();
        
        // Dispose cache
        cache?.dispose();
    });

    describe('Real File Integration', () => {
        it('should find and display real entities from src/data folder', async function() {
            // Skip if no test entities were created
            const entities = cache.getDataEntityClasses();
            if (entities.length === 0) {
                this.skip();
                return;
            }

            const children = await explorerProvider.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].itemType, 'dataRoot');

            const dataChildren = await explorerProvider.getChildren(children[0]);
            assert.ok(dataChildren.length > 0, 'Should find at least one entity');
            
            // Check that all items are entities
            dataChildren.forEach(child => {
                assert.strictEqual(child.itemType, 'entity');
                assert.ok(child.metadata, 'Entity should have metadata');
            });
        });

        it('should display fields for a real entity', async function() {
            const entities = cache.getDataEntityClasses();
            if (entities.length === 0) {
                this.skip();
                return;
            }

            const rootChildren = await explorerProvider.getChildren();
            const dataChildren = await explorerProvider.getChildren(rootChildren[0]);
            
            if (dataChildren.length === 0) {
                this.skip();
                return;
            }

            const entityItem = dataChildren[0];
            const fieldChildren = await explorerProvider.getChildren(entityItem);
            
            // Should have fields if the entity has @Field decorated properties
            fieldChildren.forEach(field => {
                assert.strictEqual(field.itemType, 'field');
                assert.ok(field.metadata, 'Field should have metadata');
                assert.ok(field.command, 'Field should have navigation command');
            });
        });

        it('should update when files change', async function() {
            this.timeout(5000); // Give time for file system events

            let updateReceived = false;
            const disposable = cache.onDidUpdate(() => {
                updateReceived = true;
            });

            // Create a new entity file
            const newEntityPath = path.join(testWorkspaceUri.fsPath, 'src', 'data', 'testEntity2.ts');
            const newEntityContent = `
import { Entity, Field } from '@slingr/framework';

@Entity({ label: 'Test Entity 2' })
export class TestEntity2 {
    @Field({ label: 'Test Field' })
    testField: string;
}
`;
            
            await vscode.workspace.fs.writeFile(vscode.Uri.file(newEntityPath), Buffer.from(newEntityContent));

            // Wait for the cache to update
            await new Promise(resolve => setTimeout(resolve, 1000));

            assert.ok(updateReceived, 'Cache should update when files change');

            // Clean up
            disposable.dispose();
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(newEntityPath));
            } catch (e) {
                // Ignore cleanup errors
            }
        });
    });

    describe('Performance Tests', () => {
        it('should load children quickly', async function() {
            const start = Date.now();
            
            const children = await explorerProvider.getChildren();
            if (children.length > 0) {
                await explorerProvider.getChildren(children[0]);
            }
            
            const duration = Date.now() - start;
            assert.ok(duration < 1000, `Loading should be fast (took ${duration}ms)`);
        });
    });
});

async function createTestEntityFiles(): Promise<void> {
    try {
        const workspaceUri = vscode.workspace.workspaceFolders![0].uri;
        
        // Ensure src/data directory exists
        const dataDir = vscode.Uri.joinPath(workspaceUri, 'src', 'data');
        try {
            await vscode.workspace.fs.createDirectory(dataDir);
        } catch (e) {
            // Directory might already exist
        }

        // Create a test entity file
        const testEntityPath = vscode.Uri.joinPath(dataDir, 'testEntity.ts');
        const testEntityContent = `
import { Entity, Field } from '@slingr/framework';

@Entity({ label: 'Test Entity', persistent: true })
export class TestEntity {
    @Field({ label: 'Name Field' })
    name: string;

    @Field({ label: 'Email Field' })
    email: string;

    @Field({ label: 'Age Field' })
    age: number;
}
`;
        
        await vscode.workspace.fs.writeFile(testEntityPath, Buffer.from(testEntityContent));
        
        // Create another test entity
        const testEntity2Path = vscode.Uri.joinPath(dataDir, 'anotherEntity.ts');
        const testEntity2Content = `
import { Entity, Field } from '@slingr/framework';

@Entity({ label: 'Another Entity', persistent: true })
export class AnotherEntity {
    @Field({ label: 'Title' })
    title: string;
}
`;
        
        await vscode.workspace.fs.writeFile(testEntity2Path, Buffer.from(testEntity2Content));
        
    } catch (error) {
        console.log('Could not create test files:', error);
    }
}

async function cleanupTestFiles(): Promise<void> {
    try {
        const workspaceUri = vscode.workspace.workspaceFolders![0].uri;
        const testFiles = [
            'src/data/testEntity.ts',
            'src/data/anotherEntity.ts',
            'src/data/testEntity2.ts'
        ];

        for (const file of testFiles) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, file));
            } catch (e) {
                // Ignore if file doesn't exist
            }
        }
    } catch (error) {
        console.log('Could not clean up test files:', error);
    }
}
}

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { before, after, describe, it } from 'mocha';
import { MetadataCache } from '../cache/cache';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof describe !== 'undefined') {
describe('MetadataCache Tests', () => {
    let cache: MetadataCache;
    let extensionPath: string;

    before(() => {
        extensionPath = path.join(__dirname, '..', '..');
        cache = new MetadataCache(extensionPath);
    });

    after(() => {
        cache?.dispose();
    });

    describe('Cache Initialization', () => {
        it('should initialize without errors', async function() {
            this.timeout(10000); // Cache initialization might take time
            
            try {
                await cache.initialize();
                assert.ok(true, 'Cache should initialize successfully');
            } catch (error) {
                assert.fail(`Cache initialization failed: ${error}`);
            }
        });

        it('should have getDataEntities method', () => {
            assert.ok(typeof cache.getDataEntities === 'function');
        });

        it('should have getDataModelClasses method', () => {
            assert.ok(typeof cache.getDataModelClasses === 'function');
        });
    });

    describe('Data Entity Methods', () => {
        it('should return array from getDataEntities', () => {
            const entities = cache.getDataEntities();
            assert.ok(Array.isArray(entities), 'getDataEntities should return an array');
        });

        it('should return array from getDataModelClasses', () => {
            const entities = cache.getDataModelClasses();
            assert.ok(Array.isArray(entities), 'getDataModelClasses should return an array');
        });

        it('should have isDataEntity flag on entities', () => {
            const entities = cache.getDataEntities();
            entities.forEach(entity => {
                assert.strictEqual(entity.isDataEntity, true, 'All data entities should have isDataEntity = true');
            });
        });

        it('should only return Entity decorated classes from getDataModelClasses', () => {
            const entities = cache.getDataModelClasses();
            entities.forEach(entity => {
                const hasEntityDecorator = entity.decorators.some(d => d.name === 'Entity');
                assert.ok(hasEntityDecorator, 'All items from getDataModelClasses should have @Entity decorator');
            });
        });
    });

    describe('Event Handling', () => {
        it('should have onDidUpdate event', () => {
            assert.ok(cache.onDidUpdate, 'Cache should have onDidUpdate event');
            assert.ok(typeof cache.onDidUpdate === 'function' || typeof cache.onDidUpdate === 'object');
        });
    });

    describe('findMetadata Method', () => {
        it('should find entities with Entity decorator', () => {
            const entities = cache.findMetadata(item => 
                'decorators' in item && 
                Array.isArray(item.decorators) && 
                item.decorators.some(d => d.name === 'Entity')
            );
            
            assert.ok(Array.isArray(entities), 'findMetadata should return an array');
        });

        it('should find fields with Field decorator', () => {
            const fields = cache.findMetadata(item => 
                'decorators' in item && 
                Array.isArray(item.decorators) && 
                item.decorators.some(d => d.name === 'Field')
            );
            
            assert.ok(Array.isArray(fields), 'findMetadata should return an array for fields');
        });
    });
});
}

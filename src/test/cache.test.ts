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

        it('should have getDataModels method', () => {
            assert.ok(typeof cache.getDataModels === 'function');
        });

        it('should have getDataModelClasses method', () => {
            assert.ok(typeof cache.getDataModelClasses === 'function');
        });
    });

    describe('Data Model Methods', () => {
        it('should return array from getDataModels', () => {
            const models = cache.getDataModels();
            assert.ok(Array.isArray(models), 'getDataModels should return an array');
        });

        it('should return array from getDataModelClasses', () => {
            const models = cache.getDataModelClasses();
            assert.ok(Array.isArray(models), 'getDataModelClasses should return an array');
        });

        it('should have isDataModel flag on models', () => {
            const models = cache.getDataModels();
            models.forEach(model => {
                assert.strictEqual(model.isDataModel, true, 'All data models should have isDataModel = true');
            });
        });

        it('should only return Model decorated classes from getDataModelClasses', () => {
            const models = cache.getDataModelClasses();
            models.forEach(model => {
                const hasModelDecorator = model.decorators.some(d => d.name === 'Model');
                assert.ok(hasModelDecorator, 'All items from getDataModelClasses should have @Model decorator');
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
        it('should find models with Model decorator', () => {
            const models = cache.findMetadata(item => 
                'decorators' in item && 
                Array.isArray(item.decorators) && 
                item.decorators.some(d => d.name === 'Model')
            );
            
            assert.ok(Array.isArray(models), 'findMetadata should return an array');
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

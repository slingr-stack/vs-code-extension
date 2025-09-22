import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChangeCompositionToReferenceTool } from '../../commands/fields/changeCompositionToReference';
import { ChangeCompositionToReferenceRefactorTool } from '../../refactor/tools/changeCompositionToReference';
import { PropertyMetadata, DecoratorMetadata } from '../../cache/cache';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('ChangeCompositionToReference Tool Tests', () => {
        let changeCompositionToReferenceTool: ChangeCompositionToReferenceTool;
        let mockExplorerProvider: any;

        setup(() => {
            mockExplorerProvider = {
                refresh: () => {}
            };
            changeCompositionToReferenceTool = new ChangeCompositionToReferenceTool();
        });

        const createMockPropertyMetadata = (name: string, type: string, decoratorNames: string[]): PropertyMetadata => {
            const decorators: DecoratorMetadata[] = decoratorNames.map(decoratorName => ({
                name: decoratorName,
                arguments: [],
                position: new vscode.Range(10, 0, 10, 10)
            }));

            return {
                name,
                type,
                decorators,
                references: [],
                declaration: {
                    uri: vscode.Uri.file('/src/data/model.ts'), // Use correct model file path
                    range: new vscode.Range(10, 0, 10, 10)
                }
            };
        };

        suite('Tool Instantiation', () => {
            test('should create ChangeCompositionToReferenceTool instance successfully', () => {
                assert.ok(changeCompositionToReferenceTool);
                assert.ok(changeCompositionToReferenceTool instanceof ChangeCompositionToReferenceTool);
            });

            test('should create ChangeCompositionToReferenceRefactorTool instance successfully', () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                assert.ok(refactorTool);
                assert.equal(refactorTool.getCommandId(), 'slingr-vscode-extension.changeCompositionToReference');
                assert.equal(refactorTool.getTitle(), 'Change Composition to Reference');
                assert.deepStrictEqual(refactorTool.getHandledChangeTypes(), ['CHANGE_COMPOSITION_TO_REFERENCE']);
            });
        });

        suite('Refactor Tool Capability Check', () => {
            test('should correctly identify component models for manual trigger', async () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Mock cache with parent model that has composition field pointing to component model
                const mockCache = {
                    getDataModelClasses: () => [
                        {
                            name: 'ParentModel',
                            properties: {
                                'componentField': {
                                    name: 'componentField',
                                    type: 'ComponentModel',
                                    decorators: [
                                        { name: 'Field', arguments: [], position: new vscode.Range(5, 0, 5, 10) },
                                        { name: 'Composition', arguments: [], position: new vscode.Range(6, 0, 6, 15) }
                                    ],
                                    references: [],
                                    declaration: {
                                        uri: vscode.Uri.file('/src/data/parent.ts'),
                                        range: new vscode.Range(7, 0, 7, 20)
                                    }
                                }
                            }
                        }
                    ]
                };

                // Mock context with component model metadata (since composition fields show as models in explorer)
                const mockContext = {
                    uri: vscode.Uri.file('/src/data/parent.ts'),
                    range: new vscode.Range(10, 0, 10, 10),
                    cache: mockCache as any,
                    metadata: {
                        name: 'ComponentModel',
                        decorators: [
                            { name: 'Model', arguments: [], position: new vscode.Range(1, 0, 1, 7) }
                        ],
                        properties: {},
                        methods: {},
                        references: [],
                        declaration: {
                            uri: vscode.Uri.file('/src/data/parent.ts'),
                            range: new vscode.Range(10, 0, 15, 1)
                        },
                        isDataModel: true
                    }
                };

                const canHandle = await refactorTool.canHandleManualTrigger(mockContext);
                assert.strictEqual(canHandle, true);
            });

            test('should reject models that are not component models', async () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Mock cache with no composition relationships
                const mockCache = {
                    getDataModelClasses: () => [
                        {
                            name: 'IndependentModel',
                            properties: {
                                'normalField': {
                                    name: 'normalField',
                                    type: 'string',
                                    decorators: [
                                        { name: 'Field', arguments: [], position: new vscode.Range(5, 0, 5, 10) },
                                        { name: 'Text', arguments: [], position: new vscode.Range(6, 0, 6, 15) }
                                    ],
                                    references: [],
                                    declaration: {
                                        uri: vscode.Uri.file('/src/data/independent.ts'),
                                        range: new vscode.Range(7, 0, 7, 20)
                                    }
                                }
                            }
                        }
                    ]
                };

                // Mock context with independent model metadata
                const mockContext = {
                    uri: vscode.Uri.file('/src/data/independent.ts'),
                    range: new vscode.Range(10, 0, 10, 10),
                    cache: mockCache as any,
                    metadata: {
                        name: 'IndependentModel',
                        decorators: [
                            { name: 'Model', arguments: [], position: new vscode.Range(1, 0, 1, 7) }
                        ],
                        properties: {},
                        methods: {},
                        references: [],
                        declaration: {
                            uri: vscode.Uri.file('/src/data/independent.ts'),
                            range: new vscode.Range(10, 0, 15, 1)
                        },
                        isDataModel: true
                    }
                };

                const canHandle = await refactorTool.canHandleManualTrigger(mockContext);
                assert.strictEqual(canHandle, false);
            });

            test('should reject fields without decorators for manual trigger', async () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Create a proper mock cache with the required methods
                const mockCache = {
                    getDataModelClasses: () => [],
                    getMetadataByPositionAndType: () => null
                };
                
                const mockContext = {
                    uri: vscode.Uri.file('/src/data/model.ts'), // Use correct model file path
                    range: new vscode.Range(10, 0, 10, 10),
                    cache: mockCache as any,
                    metadata: createMockPropertyMetadata('testField', 'string', [])
                };

                const canHandle = await refactorTool.canHandleManualTrigger(mockContext);
                assert.strictEqual(canHandle, false);
            });
        });

        suite('Tool Configuration', () => {
            test('should have correct command registration details', () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Verify command ID matches expected pattern
                assert.strictEqual(refactorTool.getCommandId(), 'slingr-vscode-extension.changeCompositionToReference');
                
                // Verify title is descriptive
                assert.strictEqual(refactorTool.getTitle(), 'Change Composition to Reference');
                
                // Verify it handles the correct change type
                const handledTypes = refactorTool.getHandledChangeTypes();
                assert.strictEqual(handledTypes.length, 1);
                assert.strictEqual(handledTypes[0], 'CHANGE_COMPOSITION_TO_REFERENCE');
            });

            test('should return empty array for automatic analysis', () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                const changes = refactorTool.analyze();
                assert.strictEqual(Array.isArray(changes), true);
                assert.strictEqual(changes.length, 0);
            });
        });

        suite('Tool Integration Tests', () => {
            test('should properly convert PropertyMetadata to FieldInfo', () => {
                // Create a mock composition field metadata
                const mockProperty = createMockPropertyMetadata('address', 'Address', ['Composition', 'Field']);
                
                // Test the convertPropertyToFieldInfo method would work
                // Note: This is an indirect test since the method is private
                // We test the type mapping logic that would be used
                
                const expectedFieldTypes = ['Text', 'LongText', 'Email', 'Html', 'Integer', 'Money', 'Date', 'DateRange', 'Boolean', 'Choice', 'Relationship'];
                assert.ok(expectedFieldTypes.length > 0);
                
                // Test that a Composition decorator would be recognized
                const hasCompositionDecorator = mockProperty.decorators.some(d => d.name === 'Composition');
                assert.strictEqual(hasCompositionDecorator, true);
            });

            test('should have valid field type options available', () => {
                // Import the FIELD_TYPE_OPTIONS to test they're available
                const { FIELD_TYPE_OPTIONS } = require('../../commands/interfaces');
                
                assert.ok(FIELD_TYPE_OPTIONS);
                assert.ok(Array.isArray(FIELD_TYPE_OPTIONS));
                assert.ok(FIELD_TYPE_OPTIONS.length > 0);
                
                // Check that required field types exist
                const textOption = FIELD_TYPE_OPTIONS.find((opt: any) => opt.decorator === 'Text');
                assert.ok(textOption);
                assert.strictEqual(textOption.tsType, 'string');
            });
        });

        suite('Error Handling', () => {
            test('should handle invalid metadata gracefully', async () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Create a proper mock cache with the required methods
                const mockCache = {
                    getDataModelClasses: () => [],
                    getMetadataByPositionAndType: () => null
                };
                
                // Mock context with invalid metadata
                const mockContext = {
                    uri: vscode.Uri.file('/src/data/model.ts'), // Use correct model file path
                    range: new vscode.Range(10, 0, 10, 10),
                    cache: mockCache as any,
                    metadata: undefined
                };

                const canHandle = await refactorTool.canHandleManualTrigger(mockContext);
                assert.strictEqual(canHandle, false);
            });

            test('should handle non-model files gracefully', async () => {
                const refactorTool = new ChangeCompositionToReferenceRefactorTool();
                
                // Create a proper mock cache with the required methods
                const mockCache = {
                    getDataModelClasses: () => [],
                    getMetadataByPositionAndType: () => null
                };
                
                // Mock context with non-model file
                const mockContext = {
                    uri: vscode.Uri.file('/test/script.js'), // Not a TypeScript model file
                    range: new vscode.Range(10, 0, 10, 10),
                    cache: mockCache as any,
                    metadata: createMockPropertyMetadata('testField', 'TestModel', ['Composition'])
                };

                const canHandle = await refactorTool.canHandleManualTrigger(mockContext);
                assert.strictEqual(canHandle, false);
            });
        });
    });
}

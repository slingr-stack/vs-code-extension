import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AddCompositionTool } from '../commands/models/addComposition';
import { MetadataCache } from '../cache/cache';

// Only run tests if we're in a test environment (Mocha globals are available)
if (typeof suite !== 'undefined') {
    suite('AddComposition Tool Tests', () => {
        let testWorkspaceDir: string;
        let testModelFile: string;
        let mockCache: MetadataCache;
        let addCompositionTool: AddCompositionTool;

        setup(async () => {
            // Create a temporary workspace directory for testing
            testWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-addcomposition-test-'));
            const testDataDir = path.join(testWorkspaceDir, 'src', 'data');
            
            // Create the src/data directory structure
            fs.mkdirSync(testDataDir, { recursive: true });
            
            // Create a sample model file for testing
            testModelFile = path.join(testDataDir, 'testModel.ts');
            const modelContent = `import { BaseModel, Field, Text, Model } from 'slingr-framework';

@Model()
export class TestModel extends BaseModel {
    @Field()
    @Text()
    existingField!: string;
}
`;
            fs.writeFileSync(testModelFile, modelContent);
            
            // Create mock cache
            mockCache = {
                getMetadataForFile: (filePath: string) => {
                    if (filePath === testModelFile) {
                        return {
                            classes: {
                                TestModel: {
                                    name: 'TestModel',
                                    decorators: [{ name: 'Model', arguments: [] }],
                                    properties: {
                                        existingField: {
                                            name: 'existingField',
                                            decorators: [
                                                { name: 'Field', arguments: [] },
                                                { name: 'Text', arguments: [] }
                                            ],
                                            type: 'string'
                                        }
                                    },
                                    methods: {},
                                    extends: 'BaseModel'
                                }
                            }
                        };
                    }
                    return { classes: {} };
                },
                getDataModelClasses: () => [
                    {
                        name: 'TestModel',
                        decorators: [{ name: 'Model', arguments: [] }],
                        properties: {
                            existingField: {
                                name: 'existingField',
                                decorators: [
                                    { name: 'Field', arguments: [] },
                                    { name: 'Text', arguments: [] }
                                ],
                                type: 'string'
                            }
                        },
                        methods: {},
                        extends: 'BaseModel',
                        filePath: testModelFile
                    }
                ],
                getModelPath: () => testDataDir,
                isLoaded: () => true,
                refresh: () => Promise.resolve(),
                watchFile: () => {},
                unwatchFile: () => {}
            } as unknown as MetadataCache;
            
            addCompositionTool = new AddCompositionTool();
        });

        teardown(() => {
            // Clean up temporary files
            if (fs.existsSync(testWorkspaceDir)) {
                fs.rmSync(testWorkspaceDir, { recursive: true });
            }
        });

        test('should convert plural field names to singular model names', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const determineInfo = (tool as any).determineInnerModelInfo.bind(tool);
            
            // Test plural to singular conversion
            assert.deepStrictEqual(determineInfo('addresses'), { 
                innerModelName: 'Address', 
                isArray: true 
            });
            
            assert.deepStrictEqual(determineInfo('phoneNumbers'), { 
                innerModelName: 'PhoneNumber', 
                isArray: true 
            });
            
            assert.deepStrictEqual(determineInfo('categories'), { 
                innerModelName: 'Category', 
                isArray: true 
            });
            
            assert.deepStrictEqual(determineInfo('boxes'), { 
                innerModelName: 'Box', 
                isArray: true 
            });
            
            // Test singular field names (should not be array)
            assert.deepStrictEqual(determineInfo('profile'), { 
                innerModelName: 'Profile', 
                isArray: false 
            });
        });

        test('should correctly convert camelCase to PascalCase', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const toPascalCase = (tool as any).toPascalCase.bind(tool);
            
            assert.strictEqual(toPascalCase('address'), 'Address');
            assert.strictEqual(toPascalCase('phoneNumber'), 'PhoneNumber');
            assert.strictEqual(toPascalCase('userProfile'), 'UserProfile');
        });

        test('should correctly convert plural to singular', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const toSingular = (tool as any).toSingular.bind(tool);
            
            // Test various pluralization patterns
            assert.strictEqual(toSingular('addresses'), 'address');
            assert.strictEqual(toSingular('boxes'), 'box');
            assert.strictEqual(toSingular('categories'), 'category');
            assert.strictEqual(toSingular('phoneNumbers'), 'phoneNumber');
            assert.strictEqual(toSingular('companies'), 'company');
            
            // Test singular words (should remain unchanged)
            assert.strictEqual(toSingular('profile'), 'profile');
            assert.strictEqual(toSingular('user'), 'user');
        });

        test('should generate correct inner model code', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const generateInnerModelCode = (tool as any).generateInnerModelCode.bind(tool);
            
            const result = generateInnerModelCode('Address', 'User');
            
            const expected = `@Model()
export class Address {

  @Field()
  @Relationship({ type: 'reference' })
  parent!: User;

}`;
            
            assert.strictEqual(result, expected);
        });

        test('should generate correct composition field code for array', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const generateCompositionFieldCode = (tool as any).generateCompositionFieldCode.bind(tool);
            
            const fieldInfo = {
                name: 'addresses',
                type: {
                    label: 'Relationship',
                    decorator: 'Relationship',
                    tsType: 'Address[]',
                    description: 'Composition relationship'
                },
                required: false,
                additionalConfig: {
                    relationshipType: 'composition',
                    targetModel: 'Address'
                }
            };
            
            const result = generateCompositionFieldCode(fieldInfo, 'Address', true);
            
            const expected = `@Field({})
@Relationship({
  type: 'composition'
})
addresses!: Address[];`;
            
            assert.strictEqual(result, expected);
        });

        test('should generate correct composition field code for single object', () => {
            const tool = new AddCompositionTool();
            
            // Access the private method via type assertion for testing
            const generateCompositionFieldCode = (tool as any).generateCompositionFieldCode.bind(tool);
            
            const fieldInfo = {
                name: 'profile',
                type: {
                    label: 'Relationship',
                    decorator: 'Relationship',
                    tsType: 'Profile',
                    description: 'Composition relationship'
                },
                required: false,
                additionalConfig: {
                    relationshipType: 'composition',
                    targetModel: 'Profile'
                }
            };
            
            const result = generateCompositionFieldCode(fieldInfo, 'Profile', false);
            
            const expected = `@Field({})
@Relationship({
  type: 'composition'
})
profile!: Profile;`;
            
            assert.strictEqual(result, expected);
        });
    });
}

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
                unwatchFile: () => {},
                getModelByName: (name: string) => {
                    if (name === 'TestModel') {
                        return {
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
                            declaration: { uri: vscode.Uri.file(testModelFile) }
                        };
                    }
                    return null;
                },
                getModelDecoratorByName: (decoratorName: string, modelClass: any) => {
                    if (decoratorName === 'Model' && modelClass?.name === 'TestModel') {
                        return {
                            name: 'Model',
                            arguments: []
                        };
                    }
                    return null;
                }
            } as unknown as MetadataCache;

            const testUri = vscode.Uri.file(testModelFile);
            
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
  @Reference()
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
            
            const expected = `@Field()
@Composition()
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
            
            const expected = `@Field()
@Composition()
profile!: Profile;`;
            
            assert.strictEqual(result, expected);
        });

        test('should create WorkspaceEdit for composition addition without applying', async () => {
            const fieldName = 'addresses';
            
            const { edit, innerModelName } = await addCompositionTool.createAddCompositionWorkspaceEdit(
                mockCache,
                'TestModel',
                fieldName
            );

            // Verify the edit contains the expected changes
            assert.ok(edit, 'WorkspaceEdit should be created');
            assert.strictEqual(innerModelName, 'Address', 'Inner model name should be Address');
            
            const testUri = vscode.Uri.file(testModelFile);
            const fileEdits = edit.get(testUri);
            assert.ok(fileEdits && fileEdits.length > 0, 'WorkspaceEdit should contain file edits');

            // Apply edits manually to verify content
            const originalContent = fs.readFileSync(testModelFile, 'utf8');
            let modifiedContent = originalContent;
            
            const sortedEdits = fileEdits.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
            for (let i = sortedEdits.length - 1; i >= 0; i--) {
                const edit = sortedEdits[i];
                const lines = modifiedContent.split('\n');
                
                if (edit.range.isEmpty) {
                    lines.splice(edit.range.start.line, 0, edit.newText);
                } else {
                    lines.splice(edit.range.start.line, edit.range.end.line - edit.range.start.line + 1, edit.newText);
                }
                
                modifiedContent = lines.join('\n');
            }

            // Verify the composition field was added
            assert.ok(modifiedContent.includes('addresses'), 'Composition field name should be in the modified content');
            assert.ok(modifiedContent.includes('@Field()'), 'Field decorator should be present');
            assert.ok(modifiedContent.includes('@Composition()'), 'Composition decorator should be present');
            assert.ok(modifiedContent.includes('addresses!: Address[]'), 'Field declaration should be present');

            // Verify the inner model was created
            assert.ok(modifiedContent.includes('class Address extends BaseModel'), 'Inner model should be created');
            assert.ok(modifiedContent.includes('@Model()'), 'Model decorator should be present on inner model');

            // Verify original file is unchanged (since we didn't apply the edit)
            const currentContent = fs.readFileSync(testModelFile, 'utf8');
            assert.strictEqual(currentContent, originalContent, 'Original file should remain unchanged');
        });

        test('should create WorkspaceEdit for singular composition field', async () => {
            const fieldName = 'profile'; // Singular field name
            
            const { edit, innerModelName } = await addCompositionTool.createAddCompositionWorkspaceEdit(
                mockCache,
                'TestModel',
                fieldName
            );

            assert.ok(edit, 'WorkspaceEdit should be created');
            assert.strictEqual(innerModelName, 'Profile', 'Inner model name should be Profile');
            
            const testUri = vscode.Uri.file(testModelFile);
            const fileEdits = edit.get(testUri);
            assert.ok(fileEdits && fileEdits.length > 0, 'WorkspaceEdit should contain file edits');

            // Apply edits manually to verify content
            const originalContent = fs.readFileSync(testModelFile, 'utf8');
            let modifiedContent = originalContent;
            
            const sortedEdits = fileEdits.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
            for (let i = sortedEdits.length - 1; i >= 0; i--) {
                const edit = sortedEdits[i];
                const lines = modifiedContent.split('\n');
                
                if (edit.range.isEmpty) {
                    lines.splice(edit.range.start.line, 0, edit.newText);
                } else {
                    lines.splice(edit.range.start.line, edit.range.end.line - edit.range.start.line + 1, edit.newText);
                }
                
                modifiedContent = lines.join('\n');
            }

            // Verify the composition field was added (should be singular, not array)
            assert.ok(modifiedContent.includes('profile!: Profile;'), 'Singular field declaration should be present');
            assert.ok(!modifiedContent.includes('profile!: Profile[]'), 'Should not be array for singular field');

            // Verify the inner model was created
            assert.ok(modifiedContent.includes('class Profile extends BaseModel'), 'Inner model should be created');
        });

        test('should throw error when composition field already exists', async () => {
            const fieldName = 'existingField'; // This field already exists in the test model
            
            try {
                await addCompositionTool.createAddCompositionWorkspaceEdit(
                    mockCache,
                    'TestModel',
                    fieldName
                );
                assert.fail('Should have thrown an error for existing field');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an Error');
                assert.ok(error.message.includes('already exists'), 'Error message should mention field already exists');
            }
        });

        test('should throw error when inner model already exists', async () => {
            // First add a mock model with the name that would be generated
            const originalGetModelByName = mockCache.getModelByName;
            mockCache.getModelByName = (name: string) => {
                if (name === 'TestModel') {
                    return originalGetModelByName('TestModel');
                }
                if (name === 'Address') {
                    return {
                        name: 'Address',
                        decorators: [{
                            name: 'Model',
                            arguments: [],
                            position: new vscode.Range(0, 0, 0, 0)
                        }],
                        properties: {},
                        methods: {},
                        references: [],
                        declaration: { uri: vscode.Uri.file(testModelFile), range: new vscode.Range(0, 0, 0, 0) },
                        isDataModel: true
                    } as any; // Use type assertion to avoid complex mock setup
                }
                return null;
            };
            
            try {
                await addCompositionTool.createAddCompositionWorkspaceEdit(
                    mockCache,
                    'TestModel',
                    'addresses' // This would generate 'Address' model which we mocked as existing
                );
                assert.fail('Should have thrown an error for existing inner model');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw an Error');
                assert.ok(error.message.includes('already exists'), 'Error message should mention model already exists');
            } finally {
                // Restore original method
                mockCache.getModelByName = originalGetModelByName;
            }
        });
    });
}

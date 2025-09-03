import * as vscode from 'vscode';
import { DecoratedClass, PropertyMetadata } from '../cache/cache';

/**
 * Test helper methods for creating mock metadata objects
 * This reduces code duplication across quickInfoPanel tests
 */
export class TestMetadataFactory {
    
    /**
     * Creates a basic PropertyMetadata object with sensible defaults
     */
    static createField(overrides: Partial<PropertyMetadata> = {}): PropertyMetadata {
        const defaults: PropertyMetadata = {
            name: 'testField',
            type: 'string',
            decorators: [{ 
                name: 'Field', 
                arguments: [], 
                position: new vscode.Range(5, 0, 5, 10) 
            }],
            references: [],
            declaration: {
                uri: vscode.Uri.file('/test/field.ts'),
                range: new vscode.Range(5, 0, 5, 20)
            }
        };
        
        return { ...defaults, ...overrides };
    }

    /**
     * Creates a field with specific type and additional decorators
     */
    static createFieldWithType(name: string, type: string, additionalDecorators: any[] = []): PropertyMetadata {
        return this.createField({
            name,
            type,
            decorators: [
                { name: 'Field', arguments: [], position: new vscode.Range(5, 0, 5, 10) },
                ...additionalDecorators
            ]
        });
    }

    /**
     * Creates a basic DecoratedClass (model) object with sensible defaults
     */
    static createModel(overrides: Partial<DecoratedClass> = {}): DecoratedClass {
        const defaults: DecoratedClass = {
            name: 'TestModel',
            decorators: [{ 
                name: 'Model', 
                arguments: [], 
                position: new vscode.Range(0, 0, 0, 10) 
            }],
            properties: {},
            methods: {},
            references: [],
            declaration: {
                uri: vscode.Uri.file('/test/model.ts'),
                range: new vscode.Range(0, 0, 10, 0)
            },
            isDataModel: true
        };
        
        return { ...defaults, ...overrides };
    }

    /**
     * Creates a model with specific fields
     */
    static createModelWithFields(
        modelName: string,
        fields: Array<{ name: string; type: string; decoratorArgs?: any[] }>
    ): DecoratedClass {
        const properties: { [key: string]: PropertyMetadata } = {};
        
        fields.forEach((field, index) => {
            properties[field.name] = this.createField({
                name: field.name,
                type: field.type,
                decorators: [{ 
                    name: 'Field', 
                    arguments: field.decoratorArgs || [], 
                    position: new vscode.Range(5 + index, 0, 5 + index, 10) 
                }],
                declaration: {
                    uri: vscode.Uri.file('/test/model.ts'),
                    range: new vscode.Range(5 + index, 0, 5 + index, 20)
                }
            });
        });

        return this.createModel({
            name: modelName,
            properties
        });
    }

    /**
     * Creates an empty model with no fields
     */
    static createEmptyModel(modelName: string = 'EmptyModel'): DecoratedClass {
        return this.createModel({
            name: modelName,
            properties: {}
        });
    }

    /**
     * Creates a field with relationship decorators (using the existing createRelationshipField)
     */
    static createRelationshipField(
        fieldName: string, 
        relatedModelType: string,
        uri?: vscode.Uri,
        range?: vscode.Range
    ): PropertyMetadata {
        return this.createField({
            name: fieldName,
            type: relatedModelType,
            decorators: [
                { name: 'Field', arguments: [], position: new vscode.Range(5, 0, 5, 10) },
                { name: 'Relationship', arguments: [], position: new vscode.Range(4, 0, 4, 15) }
            ],
            declaration: {
                uri: uri || vscode.Uri.file('/test/relationship.ts'),
                range: range || new vscode.Range(5, 0, 5, 20)
            }
        });
    }

    /**
     * Creates a field without any decorators (non-field property)
     */
    static createNonField(name: string, type: string, uri?: vscode.Uri, range?: vscode.Range): PropertyMetadata {
        return this.createField({
            name,
            type,
            decorators: [], // No decorators
            declaration: {
                uri: uri || vscode.Uri.file('/test/property.ts'),
                range: range || new vscode.Range(5, 0, 5, 20)
            }
        });
    }

    /**
     * Creates a non-model class (without @Model decorator)
     */
    static createNonModel(name: string, uri?: vscode.Uri, range?: vscode.Range): DecoratedClass {
        return this.createModel({
            name,
            decorators: [], // No Model decorator
            isDataModel: false,
            declaration: {
                uri: uri || vscode.Uri.file('/test/class.ts'),
                range: range || new vscode.Range(0, 0, 10, 0)
            }
        });
    }

    /**
     * Creates a mock cache for testing
     */
    static createMockCache(): any {
        return {
            getMetadataForFile: () => undefined,
            findMetadata: () => [],
            notifyFileDeleted: () => {},
            notifyFileChanged: () => {},
            refresh: () => Promise.resolve(),
        } as any;
    }
}

/**
 * Helper methods for creating mock contexts and other test objects
 */
export class TestContextFactory {

    /**
     * Creates a mock webview view for testing providers
     */
    static createMockWebviewView(viewType: string = 'slingrQuickInfo'): any {
        return {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: () => ({ dispose: () => {} }),
                postMessage: () => Promise.resolve(true),
                asWebviewUri: (uri: vscode.Uri) => uri,
                cspSource: 'vscode-webview:'
            },
            visible: true,
            viewType,
            title: 'Quick Info',
            description: undefined,
            onDidDispose: () => ({ dispose: () => {} }),
            onDidChangeVisibility: () => ({ dispose: () => {} }),
            show: () => {},
            dispose: () => {}
        };
    }

    /**
     * Creates a mock extension context for testing
     */
    static createMockExtensionContext(extensionPath: string = '/test/extension'): vscode.ExtensionContext {
        const extensionUri = vscode.Uri.file(extensionPath);
        
        return {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
                keys: () => []
            },
            extensionPath,
            extensionUri,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => `${extensionPath}/${relativePath}`,
            storagePath: `${extensionPath}/storage`,
            storageUri: vscode.Uri.file(`${extensionPath}/storage`),
            globalStoragePath: `${extensionPath}/globalStorage`,
            globalStorageUri: vscode.Uri.file(`${extensionPath}/globalStorage`),
            logPath: `${extensionPath}/logs`,
            logUri: vscode.Uri.file(`${extensionPath}/logs`),
            extensionMode: vscode.ExtensionMode.Test,
            extension: {} as any,
            secrets: {} as any,
            languageModelAccessInformation: {} as any
        };
    }
}

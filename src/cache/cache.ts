import * as vscode from 'vscode';
import { Project, SourceFile, ClassDeclaration, PropertyDeclaration, Decorator, Node, SyntaxKind } from 'ts-morph';
import * as path from 'path';

/**
 * The main cache structure to hold all the metadata of the project.
 * It's a map where the key is the file path.
 */
export interface ProjectMetadataCache {
    [filePath: string]: FileMetadata;
}

/**
 * Contains metadata about a single source file.
 */
export interface FileMetadata {
    uri: vscode.Uri;
    classes: { [className: string]: DecoratedClass };
}

/**
 * Contains metadata about a class, including its decorators.
 */
export interface DecoratedClass {
    name: string;
    decorators: DecoratorMetadata[];
    properties: { [propertyName: string]: PropertyMetadata };
    methods: { [methodName: string]: MethodMetadata };
    references: vscode.Location[];
    declaration: vscode.Location;
    isDataModel: boolean;
}

/**
 * Contains metadata about a property of a class, including its decorators.
 */
export interface PropertyMetadata {
    name: string;
    type: string;
    decorators: DecoratorMetadata[];
    references: vscode.Location[];
    declaration: vscode.Location;
}

/**
 * A generic representation of a decorator instance.
 */
export interface DecoratorMetadata {
    name: string;
    arguments: any[];
    position: vscode.Range;
}

/**
 * Contains metadata about a single method parameter.
 */
export interface ParameterMetadata {
    name: string;
    type: string;
    decorators: DecoratorMetadata[];
}

/**
 * Contains metadata about a method of a class, including its decorators.
 */
export interface MethodMetadata {
    name: string;
    parameters: ParameterMetadata[];
    returnType: string;
    decorators: DecoratorMetadata[];
    references: vscode.Location[];
    declaration: vscode.Location;
}

/**
 * Simplified metadata cache for the VS Code extension.
 * Focuses on essential functionality without over-engineering.
 */
export class MetadataCache {
    private cache: ProjectMetadataCache = {};
    private tsMorphProject: Project = new Project();
    private fileWatcher!: vscode.FileSystemWatcher;
    private _onDidUpdate: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

    public readonly onDidUpdate: vscode.Event<void> = this._onDidUpdate.event;

    constructor(private extensionPath: string) {
        // Initialize with sensible defaults for ts-morph
        this.tsMorphProject = new Project({
            useInMemoryFileSystem: false,
        });
    }

    /**
     * Initializes the cache by parsing all relevant files in the workspace
     * and setting up a file watcher to keep the cache up-to-date.
     */
    public async initialize(): Promise<void> {
        // Find TypeScript files in data and ui directories
        const files = await vscode.workspace.findFiles('{src/data/**/*.ts,src/ui/**/*.ts}', '**/node_modules/**');
        for (const file of files) {
            this.addSourceFile(file);
        }

        this.setupFileWatcher();
    }

    /**
     * Sets up a simple file system watcher to detect changes
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.ts');

        this.fileWatcher.onDidCreate(uri => this.handleFileChange(uri, 'create'));
        this.fileWatcher.onDidChange(uri => this.handleFileChange(uri, 'change'));
        this.fileWatcher.onDidDelete(uri => this.handleFileChange(uri, 'delete'));
    }

    /**
     * Simplified file change handling
     */
    private handleFileChange(uri: vscode.Uri, type: 'create' | 'change' | 'delete'): void {
        if (uri.path.includes('/node_modules/')) {
            return;
        }

        const filePath = uri.fsPath.replace(/\\/g, '/');

        try {
            if (type === 'delete') {
                this.removeSourceFile(filePath);
            } else {
                let sourceFile = this.tsMorphProject.getSourceFile(filePath);
                if (sourceFile) {
                    sourceFile.refreshFromFileSystemSync();
                } else {
                    sourceFile = this.tsMorphProject.addSourceFileAtPath(filePath);
                }
                this.parseFileForMetadata(sourceFile);
            }

            this._onDidUpdate.fire();
        } catch (error) {
            console.error(`Error processing file change for ${uri.fsPath}:`, error);
        }
    }

    /**
     * Adds a source file to the ts-morph project and parses its metadata.
     */
    private addSourceFile(uri: vscode.Uri): void {
        const normalizedPath = uri.fsPath.replace(/\\/g, '/');
        const sourceFile = this.tsMorphProject.addSourceFileAtPath(normalizedPath);
        this.parseFileForMetadata(sourceFile);
    }

    /**
     * Removes a source file from both ts-morph project and cache.
     */
    private removeSourceFile(filePath: string): void {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const sourceFile = this.tsMorphProject.getSourceFile(normalizedPath);
        if (sourceFile) {
            this.tsMorphProject.removeSourceFile(sourceFile);
        }
        delete this.cache[normalizedPath];
    }

    /**
     * Simplified metadata parsing focusing on essential information
     */
    private parseFileForMetadata(sourceFile: SourceFile): void {
        const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
        const fileUri = vscode.Uri.file(filePath);

        const fileMetadata: FileMetadata = {
            uri: fileUri,
            classes: {}
        };

        // Parse classes in the file
        const classDeclarations = sourceFile.getClasses();
        for (const classDecl of classDeclarations) {
            const className = classDecl.getName();
            if (!className) {
                continue;
            }

            const classDecorators = this.parseDecorators(classDecl.getDecorators());
            
            // Determine if this is a data model
            const isDataModel = classDecorators.some(d => d.name === 'Model') && 
                              filePath.includes('/src/data/');

            const classMetadata: DecoratedClass = {
                name: className,
                decorators: classDecorators,
                properties: {},
                methods: {},
                references: [],
                declaration: new vscode.Location(
                    fileUri,
                    new vscode.Range(
                        classDecl.getStartLineNumber() - 1,
                        0,
                        classDecl.getEndLineNumber() - 1,
                        0
                    )
                ),
                isDataModel
            };

            // Parse properties
            const properties = classDecl.getProperties();
            for (const prop of properties) {
                const propName = prop.getName();
                const propType = prop.getType().getText();
                const propDecorators = this.parseDecorators(prop.getDecorators());

                classMetadata.properties[propName] = {
                    name: propName,
                    type: propType,
                    decorators: propDecorators,
                    references: [],
                    declaration: new vscode.Location(
                        fileUri,
                        new vscode.Range(
                            prop.getStartLineNumber() - 1,
                            prop.getStart() - prop.getStartLinePos(),
                            prop.getEndLineNumber() - 1,
                            prop.getEnd() - prop.getStartLinePos()
                        )
                    )
                };
            }

            // Parse methods (simplified - no complex parameter parsing)
            const methods = classDecl.getMethods();
            for (const method of methods) {
                const methodName = method.getName();
                const returnType = method.getReturnType().getText();
                const methodDecorators = this.parseDecorators(method.getDecorators());

                classMetadata.methods[methodName] = {
                    name: methodName,
                    parameters: [], // Simplified - no parameter parsing
                    returnType,
                    decorators: methodDecorators,
                    references: [],
                    declaration: new vscode.Location(
                        fileUri,
                        new vscode.Range(
                            method.getStartLineNumber() - 1,
                            method.getStart() - method.getStartLinePos(),
                            method.getEndLineNumber() - 1,
                            method.getEnd() - method.getStartLinePos()
                        )
                    )
                };
            }

            fileMetadata.classes[className] = classMetadata;
        }

        this.cache[filePath] = fileMetadata;
    }

    /**
     * Simplified decorator parsing
     */
    private parseDecorators(decorators: Decorator[]): DecoratorMetadata[] {
        return decorators.map(decorator => {
            const name = decorator.getName();
            const start = decorator.getStart();
            const end = decorator.getEnd();
            const sourceFile = decorator.getSourceFile();
            
            return {
                name,
                arguments: [], // Simplified - no complex argument parsing
                position: new vscode.Range(
                    sourceFile.getLineAndColumnAtPos(start).line - 1,
                    sourceFile.getLineAndColumnAtPos(start).column,
                    sourceFile.getLineAndColumnAtPos(end).line - 1,
                    sourceFile.getLineAndColumnAtPos(end).column
                )
            };
        });
    }

    /**
     * Returns all data model classes (classes with @Model decorator in src/data/).
     */
    public getDataModelClasses(): DecoratedClass[] {
        const models: DecoratedClass[] = [];
        
        for (const fileMetadata of Object.values(this.cache)) {
            for (const classData of Object.values(fileMetadata.classes)) {
                if (classData.isDataModel) {
                    models.push(classData);
                }
            }
        }
        
        return models;
    }

    /**
     * Alias for getDataModelClasses for backward compatibility
     */
    public getDataModels(): DecoratedClass[] {
        return this.getDataModelClasses();
    }

    /**
     * Simplified metadata search
     */
    public findMetadata(predicate: (item: DecoratedClass | PropertyMetadata) => boolean): (DecoratedClass | PropertyMetadata)[] {
        const results: (DecoratedClass | PropertyMetadata)[] = [];
        
        for (const fileMetadata of Object.values(this.cache)) {
            for (const classData of Object.values(fileMetadata.classes)) {
                if (predicate(classData)) {
                    results.push(classData);
                }
                
                for (const propData of Object.values(classData.properties)) {
                    if (predicate(propData)) {
                        results.push(propData);
                    }
                }
            }
        }
        
        return results;
    }

    /**
     * Disposes of the cache and cleans up resources.
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
        this._onDidUpdate.dispose();
    }
}
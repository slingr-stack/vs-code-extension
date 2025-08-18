import * as vscode from 'vscode';
import { Project, SourceFile, ClassDeclaration, PropertyDeclaration, Decorator, Node, Type, MethodDeclaration, SyntaxKind, ts, ObjectLiteralExpression, ArrayLiteralExpression, ParameterDeclaration } from 'ts-morph';
import * as path from 'path';

// --- Data Structures (from your cache.ts) ---

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
    uri: vscode.Uri; // The path to the source file
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
    references: vscode.Location[]; // Location of references to the class
    declaration: vscode.Location; // Location of the class declaration
}

/**
 * Contains metadata about a property of a class, including its decorators.
 */
export interface PropertyMetadata {
    name: string;
    type: string; // The property type as a string
    decorators: DecoratorMetadata[];
    references: vscode.Location[]; // Location of references to the property
    declaration: vscode.Location; // Location of the property declaration
}

/**
 * A generic representation of a decorator instance.
 */
export interface DecoratorMetadata {
    name: string; // e.g., "Entity", "Action", "Field"
    arguments: any[]; // The arguments passed to the decorator
    position: vscode.Range; // position to the decorator in the source code
}

/**
 * Contains metadata about a single method parameter.
 */
export interface ParameterMetadata {
    name: string;
    type: string;
}

/**
 * Contains metadata about a method, its parameters, and special return values.
 */
export interface MethodMetadata {
    name: string;
    parameters: ParameterMetadata[];
    decorators: DecoratorMetadata[]; // If the method has decorators
    // Stores the fields returned by `getFields`.
    returnedFields: string[] | null;
    declaration: vscode.Location;
}


// --- Cache Implementation ---

type FileChangeType = 'create' | 'change' | 'delete';

/**
 * Manages a cache of project metadata extracted from TypeScript files using ts-morph.
 * It is designed to be generic, efficient, and resilient to file system changes.
 */
export class MetadataCache {
    private _onDidUpdate: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidUpdate: vscode.Event<void> = this._onDidUpdate.event;
    private tsMorphProject: Project;
    private cache: ProjectMetadataCache = {};
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private isProcessingQueue = false;
    private fileChangeQueue: { uri: vscode.Uri, type: FileChangeType }[] = [];

    /**
     * Initializes the cache and the ts-morph project.
     * @param extensionPath The absolute path to the extension's directory.
     */
    constructor(extensionPath: string) {
        this.tsMorphProject = new Project({
            // It's often better to use a tsconfig file for more complex projects
            tsConfigFilePath: path.join(extensionPath, "tsconfig.json"),
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
            },
        });
    }

    /**
     * Initializes the cache by parsing all relevant files in the workspace
     * and setting up a file watcher to keep the cache up-to-date.
     */
    public async initialize(): Promise<void> {

        const files = await vscode.workspace.findFiles('{src/model/**/*.ts,src/ui/**/*.ts}', '**/node_modules/**');
        for (const file of files) {
            this.addSourceFile(file);
        }

        this.buildAllReferences();
        this.setupFileWatcher();
    }

    /**
     * Sets up a file system watcher to detect changes, creations, and deletions
     * of TypeScript files and updates the cache accordingly.
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.ts');

        this.fileWatcher.onDidCreate(uri => this.queueFileChange(uri, 'create'));
        this.fileWatcher.onDidChange(uri => this.queueFileChange(uri, 'change'));
        this.fileWatcher.onDidDelete(uri => this.queueFileChange(uri, 'delete'));
    }

    /**
     * Adds a file change event to the queue to be processed sequentially.
     * This prevents race conditions and ensures cache consistency.
     * @param uri The URI of the file that changed.
     * @param type The type of change (create, change, delete).
     */
    private queueFileChange(uri: vscode.Uri, type: FileChangeType): void {
        // Avoid processing files inside node_modules
        if (uri.path.includes('/node_modules/')) {
            return;
        }
        this.fileChangeQueue.push({ uri, type });
        this.processQueue();
    }

    /**
    * Processes a file change from the queue.
    */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.fileChangeQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        const { uri, type } = this.fileChangeQueue.shift()!;
        const filePath = uri.fsPath.replace(/\\/g, '/');

        try {
            if (type === 'delete') {
                this.removeSourceFile(filePath);
            } else { // Handles 'create' and 'change'
                let sourceFile = this.tsMorphProject.getSourceFile(filePath);
                if (sourceFile) {
                    // For 'change', refresh the existing file from the disk.
                    await sourceFile.refreshFromFileSystem();
                } else {
                    // For 'create', add the new file to the project.
                    sourceFile = this.tsMorphProject.addSourceFileAtPath(filePath);
                }
                // Parse the file and directly commit the new metadata to the cache.
                this.parseFileForMetadata(sourceFile, true);
            }

            // After any change (create, update, delete), rebuild all references
            // across the project to ensure consistency.
            this.buildAllReferences();

            this._onDidUpdate.fire();

        } catch (error) {
            console.error(`Error processing file change for ${uri.fsPath}:`, error);
        } finally {
            this.isProcessingQueue = false;
            this.processQueue();
        }
    }

    /**
     * Helper to get a deep copy of metadata to prevent mutation of the cache state.
     */
    public getMetadataForFile(path: string): FileMetadata | undefined {
        const fileData = this.cache[path];
        return fileData ? JSON.parse(JSON.stringify(fileData)) : undefined;
    }

    /**
     * Adds a new source file to the ts-morph project and parses it for metadata.
     * @param filePath The path to the source file.
     */
    private addSourceFile(filePath: string | vscode.Uri): void {
        const path = filePath instanceof vscode.Uri ? filePath.fsPath : filePath;
        const sourceFile = this.tsMorphProject.addSourceFileAtPath(path);
        this.parseFileForMetadata(sourceFile);
    }

    /**
     * Updates an existing source file in the cache by re-parsing it.
     * @param filePath The path to the source file.
     */
    private async updateSourceFile(filePath: string): Promise<void> {
        const sourceFile = this.tsMorphProject.getSourceFile(filePath);
        if (sourceFile) {
            await sourceFile.refreshFromFileSystem();
            this.parseFileForMetadata(sourceFile);
        } else {
            this.addSourceFile(filePath);
        }
    }

    /**
     * Removes a source file from the cache and the ts-morph project.
     * @param filePath The path to the source file.
     */
    private removeSourceFile(filePath: string): void {
        delete this.cache[filePath];
        const sourceFile = this.tsMorphProject.getSourceFile(filePath);
        if (sourceFile) {
            this.tsMorphProject.removeSourceFile(sourceFile);
        }
    }

    /**
     * Parses a single source file to extract metadata about its classes,
     * properties, and decorators.
     * @param sourceFile The ts-morph SourceFile object.
     * @param commitToCache If true, the generated metadata will be stored in the cache. Defaults to true.
     * @returns The generated `FileMetadata` for the source file.
     */
    private parseFileForMetadata(sourceFile: SourceFile, commitToCache: boolean = true): FileMetadata {
        const filePath = sourceFile.getFilePath();
        const fileMetadata: FileMetadata = {
            uri: vscode.Uri.file(filePath),
            classes: {},
        };

        sourceFile.getClasses().forEach((classDeclaration: ClassDeclaration) => {
            const className = classDeclaration.getName() ?? '[Anonymous]';
            const decoratedClass: DecoratedClass = {
                name: className,
                decorators: this.extractDecoratorMetadata(classDeclaration),
                properties: {},
                methods: {},
                references: [],
                declaration: new vscode.Location(
                    vscode.Uri.file(filePath),
                    this.tsNodeToVscodeRange(classDeclaration.getNameNode() ?? classDeclaration)
                )
            };

            classDeclaration.getProperties().forEach((property: PropertyDeclaration) => {
                const propertyName = property.getName();
                decoratedClass.properties[propertyName] = {
                    name: propertyName,
                    type: this.getCleanTypeName(property.getType()),
                    decorators: this.extractDecoratorMetadata(property),
                    references: [],
                    declaration: new vscode.Location(
                        vscode.Uri.file(filePath),
                        this.tsNodeToVscodeRange(property.getNameNode())
                    )
                };
            });

            classDeclaration.getMethods().forEach((method: MethodDeclaration) => {
                const methodName = method.getName();
                decoratedClass.methods[methodName] = this.parseMethod(method);
            });

            fileMetadata.classes[className] = decoratedClass;
        });

        // Only commit to the cache if the flag is true
        if (commitToCache) {
            this.cache[filePath] = fileMetadata;
        }

        return fileMetadata;
    }

    /**
     * Parses any method to extract its parameters and special return values.
     */
    private parseMethod(method: MethodDeclaration): MethodMetadata {
        const methodName = method.getName();
        let returnedFields: string[] | null = null; // Default to null

        // Special handling for `getFields` method in views
        if (methodName === 'getFields') {
            const returnStatement = method.getFirstDescendantByKind(SyntaxKind.ReturnStatement);
            if (returnStatement) {
                const returnExpression = returnStatement.getExpression();
                if (returnExpression && Node.isArrayLiteralExpression(returnExpression)) {
                    const arrayLiteral = returnExpression as ArrayLiteralExpression;
                    const elements = arrayLiteral.getElements();

                    // Only populate the array if there are actual field objects
                    if (elements.length > 0) {
                        const fields: string[] = [];
                        elements.forEach((element: Node) => {
                            if (Node.isObjectLiteralExpression(element)) {
                                const obj = element as ObjectLiteralExpression;
                                const fieldProperty = obj.getProperty('field');
                                if (fieldProperty && Node.isPropertyAssignment(fieldProperty)) {
                                    const initializer = fieldProperty.getInitializer();
                                    if (initializer && Node.isStringLiteral(initializer)) {
                                        fields.push(initializer.getLiteralValue());
                                    }
                                }
                            }
                        });
                        returnedFields = fields;
                    }
                }
            }
            // If there's no return, or it returns [], or it's not an array, `returnedFields` remains null.
        }

        return {
            name: methodName,
            parameters: this.parseMethodParameters(method),
            returnedFields: returnedFields,
            decorators: [],
            declaration: new vscode.Location(
                vscode.Uri.file(method.getSourceFile().getFilePath()),
                this.tsNodeToVscodeRange(method.getNameNode())
            )
        };
    }

    /**
     * Parses the parameters of a given method.
     */
    private parseMethodParameters(method: MethodDeclaration): ParameterMetadata[] {
        return method.getParameters().map((param: ParameterDeclaration) => {
            return {
                name: param.getName(),
                type: this.getCleanTypeName(param.getType())
            };
        });
    }

    /**
     * Gets a clean, human-readable name for a ts-morph Type object.
     * This method correctly handles imported types, removing the "import(...)" part.
     * @param type The ts-morph Type object.
     * @returns The clean type name as a string.
     */
    private getCleanTypeName(type: Type): string {
        // If the type has an alias symbol, it means it's an imported type.
        // The alias symbol's name is the clean name we want (e.g., "Project").
        const aliasSymbol = type.getAliasSymbol();
        if (aliasSymbol) {
            return aliasSymbol.getName();
        }

        // If there's no alias, it might be a type defined in the same file or a primitive.
        // We can get the name from its primary symbol.
        const symbol = type.getSymbol();
        if (symbol) {
            return symbol.getName();
        }

        // As a fallback for primitives (string, number, etc.) or anonymous types,
        // we return the raw text of the type.
        return type.getText();
    }

    /**
     * Extracts metadata from decorators on a given node (class or property).
     * @param node The node to extract decorators from.
     * @returns An array of DecoratorMetadata.
     */
    private extractDecoratorMetadata(node: ClassDeclaration | PropertyDeclaration): DecoratorMetadata[] {
        return node.getDecorators().map((decorator: Decorator) => ({
            name: decorator.getName(),
            arguments: decorator.getArguments().map((arg: Node) => this.parseNodeValue(arg)),
            position: this.tsNodeToVscodeRange(decorator),
        }));
    }

    private parseNodeValue(node: Node): any {
        if (Node.isObjectLiteralExpression(node)) {
            const obj: { [key: string]: any } = {};
            node.getProperties().forEach((prop: Node) => {
                if (Node.isPropertyAssignment(prop)) {
                    const key = prop.getName();
                    const value = this.parseNodeValue(prop.getInitializer()!);
                    obj[key] = value;
                }
            });
            return obj;
        }
        if (Node.isStringLiteral(node)) {
            return node.getLiteralValue();
        }
        if (Node.isNumericLiteral(node)) {
            return node.getLiteralValue();
        }
        if (node.getKind() === SyntaxKind.TrueKeyword) {
            return true;
        }
        if (node.getKind() === SyntaxKind.FalseKeyword) {
            return false;
        }
        if (Node.isIdentifier(node)) {
            return node.getText();
        }
        if (Node.isArrayLiteralExpression(node)) {
            return node.getElements().map((elem: Node) => this.parseNodeValue(elem));
        }
        return node.getText();
    }

    /**
     * Finds all file paths that reference any class or property within a given file.
     * This is useful for understanding the impact of deleting a file.
     * @param filePath The path of the file whose references are being sought.
     * @returns An array of unique file paths that reference the given file.
     */
    private getReferencingFilePaths(filePath: string): string[] {
        const referencingFiles = new Set<string>();
        const fileMeta = this.cache[filePath];

        if (!fileMeta) {
            return [];
        }

        // Collect all references from the file's classes and properties
        for (const classData of Object.values(fileMeta.classes)) {
            // Add files that reference the class itself
            for (const ref of classData.references) {
                referencingFiles.add(ref.uri.fsPath);
            }

            // Add files that reference any of the class's properties
            for (const propData of Object.values(classData.properties)) {
                for (const ref of propData.references) {
                    referencingFiles.add(ref.uri.fsPath);
                }
            }
        }

        return Array.from(referencingFiles);
    }

    /**
     * Iterates through all cached items and finds their references throughout the project.
     * This includes direct references found by ts-morph and implicit references
     * from string literals in places like EntityView `getFields` methods.
     */
    private buildAllReferences(): void {
        // Clear existing references from all cache items
        for (const file of Object.values(this.cache)) {
            for (const cls of Object.values(file.classes)) {
                cls.references = [];
                for (const prop of Object.values(cls.properties)) {
                    prop.references = [];
                }
            }
        }

        // Find direct references using ts-morph
        for (const file of Object.values(this.cache)) {
            const sourceFile = this.tsMorphProject.getSourceFile(file.uri.fsPath);
            if (!sourceFile) {
                continue;
            }

            for (const cls of Object.values(file.classes)) {
                const classNode = sourceFile.getClass(cls.name);
                if (!classNode) {
                    continue;
                }

                this.findAndStoreReferences(classNode, cls);
                for (const prop of Object.values(cls.properties)) {
                    const propNode = classNode.getProperty(prop.name);
                    if (propNode) {
                        this.findAndStoreReferences(propNode, prop);
                    }
                }
            }
        }

        // Find implicit references in EntityViews
        this.buildImplicitViewFieldReferences();
    }

     /**
     * After a file is changed, this function efficiently updates all affected references.
     * It avoids a full project-wide reference rebuild by focusing only on the items
     * within the changed file.
     * @param changedFilePath The path of the file that was modified.
     */
    private updateAffectedReferences(changedFilePath: string): void {
        const sourceFile = this.tsMorphProject.getSourceFile(changedFilePath);
        if (!sourceFile) {
            return;
        }

        // Identify all classes and properties in the changed file
        const affectedItems: (DecoratedClass | PropertyMetadata)[] = [];
        const fileMeta = this.cache[changedFilePath];
        if (fileMeta) {
            for (const classData of Object.values(fileMeta.classes)) {
                affectedItems.push(classData);
                affectedItems.push(...Object.values(classData.properties));
            }
        }

        //  Clear all stale references pointing TO the affected items
        for (const item of affectedItems) {
            item.references = [];
        }

        // Rebuild references for only the affected items
        for (const classData of Object.values(fileMeta.classes)) {
            const classNode = sourceFile.getClass(classData.name);
            if (classNode) {
                this.findAndStoreReferences(classNode, classData);

                for (const propData of Object.values(classData.properties)) {
                    const propNode = classNode.getProperty(propData.name);
                    if (propNode) {
                        this.findAndStoreReferences(propNode, propData);
                    }
                }
            }
        }

        // Rebuild implicit string references in EntityViews
        // The locations of these have also changed.
        this.buildImplicitViewFieldReferences();
    }

    /**
     * Finds implicit field references within `getFields` methods of `EntityView` classes.
     * This is necessary because `ts-morph`'s `findReferences` does not detect references
     * made via string literals (e.g., `{ field: 'fieldName' }`).
     */
    private buildImplicitViewFieldReferences(): void {
        // Create a map for quick lookups of entities by name
        const entityMap = new Map<string, DecoratedClass>();
        this.findMetadata(item => 'properties' in item && item.decorators.some(d => d.name === 'Entity'))
            .forEach(entity => entityMap.set((entity as DecoratedClass).name, entity as DecoratedClass));

        // Find all EntityView classes
        const viewClasses = this.findMetadata(
            item => 'properties' in item && item.decorators.some(d => d.name === 'EntityView')
        ) as DecoratedClass[];

        for (const viewClass of viewClasses) {
            const entityViewDecorator = viewClass.decorators.find(d => d.name === 'EntityView');
            const entityName = entityViewDecorator?.arguments[0]?.entity;

            if (!entityName || !entityMap.has(entityName)) {
                continue;
            }

            const entityClass = entityMap.get(entityName)!;
            const viewSourceFile = this.tsMorphProject.getSourceFile(viewClass.declaration.uri.fsPath);
            const viewClassNode = viewSourceFile?.getClass(viewClass.name);
            const getFieldsMethodNode = viewClassNode?.getMethod('getFields');
            const returnStatement = getFieldsMethodNode?.getFirstDescendantByKind(SyntaxKind.ReturnStatement);
            const returnExpression = returnStatement?.getExpression();

            if (!returnExpression || !Node.isArrayLiteralExpression(returnExpression)) {
                continue;
            }

            returnExpression.getElements().forEach((element: Node) => {
                if (Node.isObjectLiteralExpression(element)) {
                    const fieldProperty = element.getProperty('field');
                    if (fieldProperty && Node.isPropertyAssignment(fieldProperty)) {
                        const initializer = fieldProperty.getInitializer();
                        if (initializer && Node.isStringLiteral(initializer)) {
                            const fieldName = initializer.getLiteralValue();
                            const targetProperty = entityClass.properties[fieldName];
                            if (targetProperty) {
                                // The start of the literal content is one char after the node starts (to skip the quote).
                                const contentStartPos = initializer.getStart() + 1;
                                // The end of the literal content is one char before the node ends (to skip the quote).
                                const contentEndPos = initializer.getEnd() - 1;

                                const start = viewSourceFile!.getLineAndColumnAtPos(contentStartPos);
                                const end = viewSourceFile!.getLineAndColumnAtPos(contentEndPos);

                                const range = new vscode.Range(
                                    start.line - 1, start.column - 1,
                                    end.line - 1, end.column - 1
                                );
                                const refLocation = new vscode.Location(
                                    vscode.Uri.file(viewSourceFile!.getFilePath()),
                                    range
                                );
                                targetProperty.references.push(refLocation);
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * Finds all references to a given node (class or property) and stores them
     * in the cache using your more precise method.
     * @param node The ts-morph node to find references for.
     * @param metadataObject The corresponding metadata object in the cache to store the references in.
     */
    private findAndStoreReferences(node: ClassDeclaration | PropertyDeclaration, metadataObject: DecoratedClass | PropertyMetadata): void {
        const referencedSymbols = node.findReferences();

        for (const referencedSymbol of referencedSymbols) {
            for (const reference of referencedSymbol.getReferences()) {
                const refSourceFile = reference.getSourceFile();
                const textSpan = reference.getTextSpan();

                const start = refSourceFile.getLineAndColumnAtPos(textSpan.getStart());
                const end = refSourceFile.getLineAndColumnAtPos(textSpan.getEnd());

                const preciseRange = new vscode.Range(
                    new vscode.Position(start.line - 1, start.column - 1),
                    new vscode.Position(end.line - 1, end.column - 1)
                );

                const refLocation = new vscode.Location(
                    vscode.Uri.file(refSourceFile.getFilePath()),
                    preciseRange
                );

                metadataObject.references.push(refLocation);
            }
        }
    }


    /**
     * Provides a clean method to search for metadata across the entire cache.
     * @param predicate A function that returns true for the metadata you're looking for.
     * @returns An array of found metadata objects.
     */
    public findMetadata(predicate: (item: DecoratedClass | PropertyMetadata | MethodMetadata) => boolean): (DecoratedClass | PropertyMetadata | MethodMetadata)[] {
        const results: (DecoratedClass | PropertyMetadata | MethodMetadata)[] = [];
        for (const fileData of Object.values(this.cache)) {
            for (const classData of Object.values(fileData.classes)) {
                if (predicate(classData)) {
                    results.push(classData);
                }
                for (const propData of Object.values(classData.properties)) {
                    if (predicate(propData)) {
                        results.push(propData);
                    }
                }
                for (const methodData of Object.values(classData.methods)) {
                    if (predicate(methodData)) {
                        results.push(methodData);
                    }
                }
            }
        }
        return results;
    }

    /**
     * Utility to convert a ts-morph Node's position to a VS Code Range.
     * @param node The ts-morph Node.
     * @returns A VS Code Range.
     */
    private tsNodeToVscodeRange(node: Node): vscode.Range {
        const sourceFile = node.getSourceFile();
        const start = node.getStart();
        const end = node.getEnd();
        const startPos = sourceFile.getLineAndColumnAtPos(start);
        const endPos = sourceFile.getLineAndColumnAtPos(end);
        return new vscode.Range(startPos.line - 1, startPos.column - 1, endPos.line - 1, endPos.column - 1);
    }

    /**
     * Disposes of the file watcher when the extension is deactivated.
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
    }
}
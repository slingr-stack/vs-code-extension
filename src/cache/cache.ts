import * as vscode from 'vscode';
import { Project, SourceFile, ClassDeclaration, PropertyDeclaration, Decorator, Node, Type, MethodDeclaration, SyntaxKind, ts, ObjectLiteralExpression, ArrayLiteralExpression, ParameterDeclaration } from 'ts-morph';
import * as path from 'path';
import { RefactorController } from '../refactor/RefactorController';
import { ChangeObject } from '../refactor/refactorInterfaces';

// Represents the type of changes that can occur to a file
type FileChangeType = 'create' | 'change' | 'delete';

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
}

/**
 * Contains metadata about a method, its parameters, and special return values.
 */
export interface MethodMetadata {
    name: string;
    parameters: ParameterMetadata[]; 
    decorators: DecoratorMetadata[];
    returnedFields: string[] | null;
    declaration: vscode.Location;
}

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
    private refactorController: RefactorController | null = null;
    private automaticRefactorsEnabled: boolean = true;

    /**
     * Initializes the cache and the ts-morph project.
     * @param extensionPath The absolute path to the extension's directory.
     */
    constructor(extensionPath: string) {
        this.tsMorphProject = new Project({
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
        
        const files = await vscode.workspace.findFiles('{src/data/**/*.ts,src/ui/**/*.ts}', '**/node_modules/**');
        for (const file of files) {
            this.addSourceFile(file);
        }

        this.buildAllReferences();
        this.setupFileWatcher();
    }

    /**
     * Sets the refactor controller to be used for managing refactorings.
     * @param controller The refactor controller instance.
     */
    public setRefactorController(controller: RefactorController): void {
        this.refactorController = controller;
    }

    /**
     * Sets whether automatic refactors should be proposed and executed.
     * @param enabled True to enable, false to disable.
     */
    public setAutomaticRefactorsEnabled(enabled: boolean): void {
        this.automaticRefactorsEnabled = enabled;
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
        if (uri.path.includes('/node_modules/')) {
            return;
        }
        this.fileChangeQueue.push({ uri, type });
        this.processQueue();
    }

    /**
    * Processes a file change from the queue, performing Phase 1 (Analysis) of the pipeline.
    */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.fileChangeQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        const { uri, type } = this.fileChangeQueue.shift()!;
        const filePath = uri.fsPath.replace(/\\/g, '/');
        try {
            // Get "before" state from cache and "after" state from disk.
            const oldFileMeta = this.cache[filePath];
            let newFileMeta: FileMetadata | undefined;

            if (type === 'create' || type === 'change') {
                let sourceFile = this.tsMorphProject.getSourceFile(filePath);
                if (sourceFile) {
                    await sourceFile.refreshFromFileSystem();
                } else {
                    sourceFile = this.tsMorphProject.addSourceFileAtPath(filePath);
                }
                newFileMeta = this.parseFileForMetadata(sourceFile, false);
            }

            // Only perform analysis and propose refactors if the feature is enabled.
            if (this.automaticRefactorsEnabled && this.refactorController) {
                const allChanges: ChangeObject[] = [];
                const tools = this.refactorController.getTools();
                for (const tool of tools) {
                    const detectedChanges = tool.analyze(oldFileMeta, newFileMeta, allChanges);
                    allChanges.push(...detectedChanges);
                }

                // If analysis found changes, hand them off for Planning and Execution.
                if (allChanges.length > 0) {
                    await this.refactorController.proposeAutomaticRefactors(allChanges);
                    
                    // After execution, the file(s) on disk have changed. We must re-read
                    // the primary file to update our cache with the final state.
                    if (type !== 'delete') {
                        const sourceFile = this.tsMorphProject.getSourceFile(filePath);
                        if (sourceFile) {
                            await sourceFile.refreshFromFileSystem();
                            newFileMeta = this.parseFileForMetadata(sourceFile, false);
                        }
                    }
                }
            }
            
            if (type === 'delete') {
                this.removeSourceFile(filePath);
            } else if (newFileMeta) {
                this.cache[filePath] = newFileMeta;
            }
            
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
    public getMetadataForFile(path: string, isCopy: boolean = false): FileMetadata | undefined {
        const normalizedPath = path.replace(/\\/g, '/');
        const fileData = this.cache[normalizedPath];
        return fileData ? (isCopy ? JSON.parse(JSON.stringify(fileData)) : fileData) : undefined;
    }

    /**
     * Adds a new source file to the ts-morph project and parses it for metadata.
     * @param filePath The path to the source file.
     */
    private addSourceFile(filePath: string | vscode.Uri): void {
        const path = filePath instanceof vscode.Uri ? filePath.fsPath : filePath;
        const normalizedPath = path.replace(/\\/g, '/');
        const sourceFile = this.tsMorphProject.addSourceFileAtPath(normalizedPath);
        this.parseFileForMetadata(sourceFile);
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
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const fileMetadata: FileMetadata = {
            uri: vscode.Uri.file(normalizedFilePath),
            classes: {},
        };

        sourceFile.getClasses().forEach((classDeclaration: ClassDeclaration) => {
            const className = classDeclaration.getName() ?? '[Anonymous]';
            const isDataModel = filePath.includes('/src/data/');
            const decoratedClass: DecoratedClass = {
                name: className,
                decorators: this.extractDecoratorMetadata(classDeclaration),
                properties: {},
                methods: {},
                references: [],
                declaration: new vscode.Location(
                    vscode.Uri.file(normalizedFilePath),
                    this.tsNodeToVscodeRange(classDeclaration.getNameNode() ?? classDeclaration)
                ),
                isDataModel: isDataModel
            };

            classDeclaration.getProperties().forEach((property: PropertyDeclaration) => {
                const propertyName = property.getName();
                decoratedClass.properties[propertyName] = {
                    name: propertyName,
                    type: this.getCleanTypeName(property.getType()),
                    decorators: this.extractDecoratorMetadata(property),
                    references: [],
                    declaration: new vscode.Location(
                        vscode.Uri.file(normalizedFilePath),
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

        if (commitToCache) {
            this.cache[normalizedFilePath] = fileMetadata;
        }

        return fileMetadata;
    }

    /**
     * Parses any method to extract its parameters and special return values.
     */
    private parseMethod(method: MethodDeclaration): MethodMetadata {
        const methodName = method.getName();
        let returnedFields: string[] | null = null;

        if (methodName === 'getFields') {
            const returnStatement = method.getFirstDescendantByKind(SyntaxKind.ReturnStatement);
            if (returnStatement) {
                const returnExpression = returnStatement.getExpression();
                if (returnExpression && Node.isArrayLiteralExpression(returnExpression)) {
                    const arrayLiteral = returnExpression as ArrayLiteralExpression;
                    const elements = arrayLiteral.getElements();

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
        }

        return {
            name: methodName,
            parameters: this.parseMethodParameters(method),
            returnedFields: returnedFields,
            decorators: [],
            declaration: new vscode.Location(
                vscode.Uri.file(method.getSourceFile().getFilePath().replace(/\\/g, '/')),
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
        const aliasSymbol = type.getAliasSymbol();
        if (aliasSymbol) {
            return aliasSymbol.getName();
        }

        const symbol = type.getSymbol();
        if (symbol) {
            return symbol.getName();
        }

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
     * Iterates through all cached items and finds their references throughout the project.
     * This includes direct references found by ts-morph and implicit references
     * from string literals in places like ModelView `getFields` methods.
     */
    private buildAllReferences(): void {
        for (const file of Object.values(this.cache)) {
            for (const cls of Object.values(file.classes)) {
                cls.references = [];
                for (const prop of Object.values(cls.properties)) {
                    prop.references = [];
                }
            }
        }

        for (const file of Object.values(this.cache)) {
            const normalizedPath = file.uri.fsPath.replace(/\\/g, '/');
            const sourceFile = this.tsMorphProject.getSourceFile(normalizedPath);
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

        const affectedItems: (DecoratedClass | PropertyMetadata)[] = [];
        const fileMeta = this.cache[changedFilePath];
        if (fileMeta) {
            for (const classData of Object.values(fileMeta.classes)) {
                affectedItems.push(classData);
                affectedItems.push(...Object.values(classData.properties));
            }
        }

        for (const item of affectedItems) {
            item.references = [];
        }

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

        this.buildImplicitViewFieldReferences();
    }

    /**
     * Finds implicit field references within `getFields` methods of `ModelView` classes.
     * This is necessary because `ts-morph`'s `findReferences` does not detect references
     * made via string literals (e.g., `{ field: 'fieldName' }`).
     */
    private buildImplicitViewFieldReferences(): void {
        const modelMap = new Map<string, DecoratedClass>();
        this.findMetadata(item => 'properties' in item && item.decorators.some(d => d.name === 'Model'))
            .forEach(model => modelMap.set((model as DecoratedClass).name, model as DecoratedClass));

        const viewClasses = this.findMetadata(
            item => 'properties' in item && item.decorators.some(d => d.name === 'ModelView')
        ) as DecoratedClass[];

        for (const viewClass of viewClasses) {
            const modelViewDecorator = viewClass.decorators.find(d => d.name === 'ModelView');
            const modelName = modelViewDecorator?.arguments[0]?.model;

            if (!modelName || !modelMap.has(modelName)) {
                continue;
            }

            const modelClass = modelMap.get(modelName)!;
            const normalizedViewPath = viewClass.declaration.uri.fsPath.replace(/\\/g, '/');
            const viewSourceFile = this.tsMorphProject.getSourceFile(normalizedViewPath);
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
                            const targetProperty = modelClass.properties[fieldName];
                            if (targetProperty) {

                                const contentStartPos = initializer.getStart() + 1;
                                
                                const contentEndPos = initializer.getEnd() - 1;

                                const start = viewSourceFile!.getLineAndColumnAtPos(contentStartPos);
                                const end = viewSourceFile!.getLineAndColumnAtPos(contentEndPos);

                                const range = new vscode.Range(
                                    start.line - 1, start.column - 1,
                                    end.line - 1, end.column - 1
                                );
                                const refLocation = new vscode.Location(
                                    vscode.Uri.file(viewSourceFile!.getFilePath().replace(/\\/g, '/')),
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
                    vscode.Uri.file(refSourceFile.getFilePath().replace(/\\/g, '/')),
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
     * Returns all models that are stored in the src/data folder.
     * These are the models that will be shown in the explorer.
     * @returns An array of DecoratedClass objects that represent data models.
     */
    public getDataModels(): DecoratedClass[] {
        const dataModels: DecoratedClass[] = [];
        for (const fileData of Object.values(this.cache)) {
            for (const classData of Object.values(fileData.classes)) {
                if (classData.isDataModel) {
                    dataModels.push(classData);
                }
            }
        }
        return dataModels;
    }

    /**
     * Returns all Model decorated classes that are stored in the src/data folder.
     * This is a more specific version of getDataModels() that only returns
     * classes with the Model decorator.
     * @returns An array of DecoratedClass objects that represent Model classes in the data folder.
     */
    public getDataModelClasses(): DecoratedClass[] {
        return this.getDataModels().filter(classData => 
            classData.decorators.some(decorator => decorator.name === 'Model')
        );
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
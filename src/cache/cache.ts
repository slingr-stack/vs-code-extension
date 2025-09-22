import * as vscode from 'vscode';
import { Project, SourceFile, ClassDeclaration, PropertyDeclaration, Decorator, Node, Type, MethodDeclaration, SyntaxKind, ObjectLiteralExpression, ArrayLiteralExpression, ParameterDeclaration, ArrowFunction, FunctionExpression, VariableDeclaration, ScriptTarget, ModuleKind } from 'ts-morph';
import * as path from 'path';
import { accessSync } from 'fs';
import { RefactorController } from '../refactor/RefactorController';
import { ChangeObject } from '../refactor/refactorInterfaces';
import * as crypto from 'crypto';

// Represents the type of changes that can occur to a file
type FileChangeType = 'create' | 'change' | 'delete';

export type InfrastructureEventStatus  = 'change-detected' | 'update-success' | 'update-failure';

export type CacheFileUpdateType = 'dataSource' | 'dataModel' | 'fullRefresh' | 'unknown';

export interface CacheUpdateEvent {
    type: CacheFileUpdateType;
    uri?: vscode.Uri; // The URI of the changed file. Undefined for a full refresh.
}

export interface InfrastructureStatusChangeEvent {
    status: InfrastructureEventStatus ;
    uri: vscode.Uri;
    error?: string; // Optional: only used for 'update-failure'
}

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
    dataSources: { [dataSourceName: string]: DataSourceMetadata };
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
 * Contains metadata about a single data source definition.
 */
export interface DataSourceMetadata {
    name: string;
    type: string; // e.g., 'TypeORMSqlDataSource'
    declaration: vscode.Location;
    references: vscode.Location[];
    options: { [key: string]: any };
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
    private _onDidUpdate: vscode.EventEmitter<CacheUpdateEvent> = new vscode.EventEmitter<CacheUpdateEvent>();
    public readonly onDidUpdate: vscode.Event<CacheUpdateEvent> = this._onDidUpdate.event;
    private tsMorphProject: Project;
    private cache: ProjectMetadataCache = {};
    private fileWatcher: vscode.FileSystemWatcher | null = null;
    private folderWatcher: vscode.FileSystemWatcher | null = null;
    private isProcessingQueue = false;
    private fileChangeQueue: { uri: vscode.Uri, type: FileChangeType }[] = [];
    private refactorController: RefactorController | null = null;
    private automaticRefactorsEnabled: boolean = true;
    private dataSourceHashes: Map<string, string> = new Map();
    private _onInfrastructureStatusChange: vscode.EventEmitter<InfrastructureStatusChangeEvent> = new vscode.EventEmitter<InfrastructureStatusChangeEvent>();
    public readonly onInfrastructureStatusChange: vscode.Event<InfrastructureStatusChangeEvent> = this._onInfrastructureStatusChange.event;
    public isInfrastructureUpdateNeeded: boolean = false;
    private outOfSyncDataSources: Set<string> = new Set();

    /**
     * Initializes the cache and the ts-morph project.
     * @param extensionPath The absolute path to the extension's directory.
     */
    constructor(extensionPath: string) {
        // Try to find the workspace's tsconfig.json first, fallback to a basic configuration
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let tsConfigPath: string | undefined;
        
        if (workspaceFolder) {
            const workspaceTsConfig = path.join(workspaceFolder.uri.fsPath, "tsconfig.json");
            try {
                // Check if workspace tsconfig exists
                accessSync(workspaceTsConfig);
                tsConfigPath = workspaceTsConfig;
                console.log('[Cache] Using workspace tsconfig.json:', tsConfigPath);
            } catch {
                console.log('[Cache] No workspace tsconfig.json found, using default configuration');
            }
        }

        this.tsMorphProject = new Project({
            tsConfigFilePath: tsConfigPath,
            compilerOptions: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                allowJs: true,
                target: ScriptTarget.ES2020,
                module: ModuleKind.CommonJS,
            },
        });
    }

    /**
     * Initializes the cache by parsing all relevant files in the workspace
     * and setting up a file watcher to keep the cache up-to-date.
     * This is the "shallow" initialization phase that loads basic structure without references.
     */
    public async initialize(): Promise<void> {
        
        const files = await vscode.workspace.findFiles('{src/data/**/*.ts,src/dataSources/**/*.ts}');
        for (const file of files) {
            this.addSourceFile(file);
        }

        this.setupFileWatcher();
    }

    /**
     * Builds all references in the background after the initial shallow load.
     * This allows the UI to render quickly while references are computed asynchronously.
     */
    public buildAllReferencesInBackground(): void {
        // Run reference building in the background
        setTimeout(async () => {
            await this.buildAllReferences();
            
            // Notify that deep data is now available
            this._onDidUpdate.fire({ type: 'fullRefresh' });
        }, 0);
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
     * Gets all SQL data sources from the cache.
     * @returns An array of SQL data source metadata.
     */
    public getSqlDataSources(): DataSourceMetadata[] {
        return this.getDataSources().filter(
            ds => ds.type === 'TypeORMSqlDataSource'
        );
    }

    public notifyInfrastructureStatus(event: InfrastructureStatusChangeEvent): void {
        this._onInfrastructureStatusChange.fire(event);
    }

    /**
     * Sets up file system watchers to detect changes, creations, and deletions
     * of TypeScript files and folder structure changes in src/data.
     */
    private setupFileWatcher(): void {
        // Watch for TypeScript file changes
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.ts');

        this.fileWatcher.onDidCreate(uri => this.queueFileChange(uri, 'create'));
        this.fileWatcher.onDidChange(uri => this.queueFileChange(uri, 'change'));
        this.fileWatcher.onDidDelete(uri => this.queueFileChange(uri, 'delete'));

        // Watch for folder structure changes in src/data directory
        // ignoreCreateEvents: false, ignoreChangeEvents: true, ignoreDeleteEvents: false
        this.folderWatcher = vscode.workspace.createFileSystemWatcher('**/src/data/**/*', false, true, false);

        this.folderWatcher.onDidCreate(uri => this.handleFolderStructureChange(uri, 'create'));
        this.folderWatcher.onDidDelete(uri => this.handleFolderStructureChange(uri, 'delete'));
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
     * Handles folder structure changes in the src/data directory.
     * When folders are created, deleted, or renamed, this triggers a cache refresh
     * to ensure the explorer reflects the updated folder structure.
     * @param uri The URI of the folder that changed.
     * @param type The type of change (create, delete).
     */
    private async handleFolderStructureChange(uri: vscode.Uri, type: 'create' | 'delete'): Promise<void> {
        // Only handle changes in src/data directory
        if (!uri.path.includes('/src/data/')) {
            return;
        }

        // For folder changes, we need to refresh the entire cache to ensure
        // the explorer reflects the new folder structure
        console.log(`[Cache] Folder structure change detected: ${type} ${uri.path}`);
        
        // Force a cache refresh by re-reading all files
        await this.forceRefresh();
    }

    /**
     * Forces a complete refresh of the cache by re-reading all TypeScript files.
     * This is useful when folder structure changes occur.
     */
    public async forceRefresh(): Promise<void> {
        try {
            // Clear existing cache
            this.cache = {};
        
            // Remove all source files from ts-morph project
            this.tsMorphProject.getSourceFiles().forEach(sf => {
                this.tsMorphProject.removeSourceFile(sf);
            });
        
            // Re-scan all files
            const files = await vscode.workspace.findFiles('{src/data/**/*.ts,src/dataSources/**/*.ts}');
            for (const file of files) {
                this.addSourceFile(file);
            }
            // Rebuild all references
            this.buildAllReferences(); // Full rebuild for force refresh
            // Notify listeners that the cache has been updated
            this._onDidUpdate.fire({type: 'fullRefresh'});
        } catch (error) {
            console.error('[Cache] Error during force refresh:', error);
        }
    }

    /**
     * Manually triggers a cache update event.
     * This can be used by external tools to force explorer refresh.
     */
    public triggerUpdate(): void {
        this._onDidUpdate.fire({type: 'fullRefresh'});
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

        // Check if the changed file is a data source
        if (filePath.includes('/src/dataSources/')) {
            try {
                await this.handleDataSourceChange(uri, type);
            } catch (error) {
                console.error(`Error processing data source change for ${uri.fsPath}:`, error);
            } finally {
                this.isProcessingQueue = false;
                this.processQueue();
            }
            return;
        }

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
            let fileType: CacheFileUpdateType = 'unknown';
            if (filePath.includes('/src/dataSources/')) {
                fileType = 'dataSource';
            } else if (filePath.includes('/src/data/')) {
                fileType = 'dataModel';
            }
            this._onDidUpdate.fire({ type: fileType, uri: uri });

        } catch (error) {
            console.error(`Error processing file change for ${uri.fsPath}:`, error);
        } finally {
            this.isProcessingQueue = false;
            this.processQueue();
        }
    }

    /**
     * Handles changes to data source files by checking for actual content changes
     * and updating the infrastructure update flag if necessary.
     * @param uri The URI of the changed data source file.
     * @param type The type of change (create, change, delete).
     */
    private async handleDataSourceChange(uri: vscode.Uri, type: FileChangeType): Promise<void> {
       const filePath = uri.fsPath.replace(/\\/g, '/');
        
        // --- Infrastructure Hash Check Logic ---
        const oldHash = this.dataSourceHashes.get(filePath);
        let newHash: string | undefined;

        if (type === 'create' || type === 'change') {
            let sourceFile = this.tsMorphProject.getSourceFile(filePath);
            if (!sourceFile) {
                sourceFile = this.tsMorphProject.addSourceFileAtPath(filePath);
            } else {
                await sourceFile.refreshFromFileSystem();
            }
            newHash = this.parseDataSourceFile(sourceFile);
        }

        // Determine if infrastructure changes occurred, but don't fire events yet
        let hasInfrastructureChanges = false;
        
        if (type === 'delete') {
            // File deleted - trigger update if there was a data source to delete
            if (oldHash) {
                hasInfrastructureChanges = true;
            }
            this.dataSourceHashes.delete(filePath);
        } else {
            // File created or changed
            if (newHash) {
                // Data source found in file
                if (oldHash !== newHash) {
                    hasInfrastructureChanges = true;
                }
                this.dataSourceHashes.set(filePath, newHash);
            } else {
                // No data source found in file
                if (oldHash) {
                    // Had a data source before, now it's gone
                    hasInfrastructureChanges = true;
                }
                this.dataSourceHashes.delete(filePath);
            }
        }
        
        // --- Refactoring and Cache Logic (mirrors processQueue) ---
        const oldFileMeta = this.cache[filePath];
        let newFileMeta: FileMetadata | undefined;

        if (type === 'create' || type === 'change') {
            const sourceFile = this.tsMorphProject.getSourceFile(filePath)!;
            newFileMeta = this.parseFileForMetadata(sourceFile, false);
        }

        if (this.automaticRefactorsEnabled && this.refactorController) {
            const allChanges: ChangeObject[] = [];
            const tools = this.refactorController.getTools();
            for (const tool of tools) {
                const detectedChanges = tool.analyze(oldFileMeta, newFileMeta, allChanges);
                allChanges.push(...detectedChanges);
            }

            if (allChanges.length > 0) {
                await this.refactorController.proposeAutomaticRefactors(allChanges);
                
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

        // Build references and fire update event (same as processQueue)
        this.buildAllReferences();
        this._onDidUpdate.fire({ type: 'dataSource', uri: uri });

        // Fire infrastructure status change event AFTER cache has been updated
        if (hasInfrastructureChanges) {
            this.isInfrastructureUpdateNeeded = true;
            this.outOfSyncDataSources.add(filePath);
            this._onInfrastructureStatusChange.fire({ status: 'change-detected', uri: uri });
        }
    }

    /**
     * Acknowledges that a global infrastructure update has completed successfully,
     * resetting the state for all out-of-sync data sources.
     */
    public acknowledgeAllInfrastructureUpdates(): void {
        this.outOfSyncDataSources.clear();
        this.isInfrastructureUpdateNeeded = false;
    }

    /**
     * Gets metadata for a specific file.
     * @param path The file path to get metadata for.
     * @param isCopy Whether to return a copy of the metadata.
     * @returns The file metadata or undefined if not found.
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
     * Parses a data source file to extract its configuration.
     * @param sourceFile The ts-morph SourceFile object.
     * @returns A hash representing the data source configuration, or undefined if not found.
     */
    private parseDataSourceFile(sourceFile: SourceFile): string | undefined {
        const varDeclarations = sourceFile.getVariableDeclarations();

        for (const varDecl of varDeclarations) {
            if (varDecl.isExported()) {
                const initializer = varDecl.getInitializer();
                
                if (initializer && Node.isNewExpression(initializer)) {
                    const className = initializer.getExpression().getText();
                    const varName = varDecl.getName();
                    const constructorArgs = initializer.getArguments();
                    
                    let configObjectText = '';
                    if (constructorArgs.length > 0 && Node.isObjectLiteralExpression(constructorArgs[0])) {
                        configObjectText = constructorArgs[0].getText();
                    }

                    const stringToHash = `const ${varName} = new ${className}(${configObjectText});`;
                    return crypto.createHash('md5').update(stringToHash).digest('hex');
                }
            }
        }
        return undefined; // No data source found in this file
    }

    /**
     * Parses a single source file to extract its metadata, properties, and decorators.
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
            dataSources: {},
        };

        // Class parsing logic
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

        // Data source parsing logic
        if (normalizedFilePath.includes('/src/dataSources/')) {
            sourceFile.getVariableDeclarations().forEach((varDecl: VariableDeclaration) => {
                if (varDecl.isExported()) {
                    const initializer = varDecl.getInitializer();
                    if (initializer && Node.isNewExpression(initializer)) {
                        const dataSourceName = varDecl.getName();
                        const dataSourceType = initializer.getExpression().getText();
                        let options = {};
                        const constructorArg = initializer.getArguments()[0];
                        if (constructorArg && Node.isObjectLiteralExpression(constructorArg)) {
                            options = this.parseNodeValue(constructorArg);
                        }

                        fileMetadata.dataSources[dataSourceName] = {
                            name: dataSourceName,
                            type: dataSourceType,
                            declaration: new vscode.Location(
                                vscode.Uri.file(normalizedFilePath),
                                this.tsNodeToVscodeRange(varDecl.getNameNode())
                            ),
                            references: [],
                            options: options
                        };
                    }
                }
            });
        }

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
     * This method correctly handles imported types, removing the "import(...)" part,
     * and preserves array notation for array types.
     * @param type The ts-morph Type object.
     * @returns The clean type name as a string.
     */
    private getCleanTypeName(type: Type): string {
        // Handle array types by preserving the array notation
        if (type.isArray()) {
            const elementType = type.getArrayElementType();
            if (elementType) {
                return this.getCleanTypeName(elementType) + '[]';
            }
        }

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
        if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
            return this.parseAnonymousFunction(node);
        }

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

    // Add this new helper method inside the MetadataCache class
    private parseAnonymousFunction(node: ArrowFunction | FunctionExpression): MethodMetadata {
        const sourceFile = node.getSourceFile();
    
        // Reuse existing logic to parse parameters and get the location
        const parameters = node.getParameters().map((param: ParameterDeclaration) => {
            return {
                name: param.getName(),
                type: this.getCleanTypeName(param.getType())
            };
        });

        const location = new vscode.Location(
            vscode.Uri.file(sourceFile.getFilePath()),
            this.tsNodeToVscodeRange(node)
        );
    
        // Build an object that matches the MethodMetadata interface
        return {
            name: '[anonymous]', // Anonymous functions don't have a name
            parameters: parameters,
            declaration: location,
            decorators: [], // Anonymous functions in args don't have decorators
            returnedFields: null
        };
    }

    /**
     * Iterates through all cached items and finds their references throughout the project.
     * This includes direct references found by ts-morph and implicit references
     * from string literals in places like ModelView `getFields` methods.
     * 
     * Optimized version that builds references efficiently using proven ts-morph methods.
     * @param targetFilePath Optional file path to rebuild references for. If not provided, rebuilds all.
     */
    private async buildAllReferences(targetFilePath?: string): Promise<void> {
        
        // If targetFilePath is provided, only rebuild references for that specific file
        if (targetFilePath) {
            this.buildReferencesForFile(targetFilePath);
            return;
        }

        // Full rebuild - clear all references first
        let totalItems = 0;
        for (const file of Object.values(this.cache)) {
            for (const cls of Object.values(file.classes)) {
                cls.references = [];
                totalItems++;
                for (const prop of Object.values(cls.properties)) {
                    prop.references = [];
                    totalItems++;
                }
            }
            for (const ds of Object.values(file.dataSources)) {
                ds.references = [];
                totalItems++;
            }
        }

        // single pass through all source files
        await this.buildReferencesOptimized();
    }

    /**
     * Optimized reference building that processes all cached items efficiently.
     * Uses the proven ts-morph findReferences() method but optimizes by collecting all items first.
     */
    private async buildReferencesOptimized(): Promise<void> {
        
        // Ensure all TypeScript files in the workspace are loaded for proper cross-file reference resolution
        const allTsFiles = await vscode.workspace.findFiles('{src/data/**/*.ts,src/dataSources/**/*.ts}');
        
        for (const file of allTsFiles) {
            const filePath = file.fsPath.replace(/\\/g, '/');
            if (!this.tsMorphProject.getSourceFile(filePath)) {
                try {
                    this.tsMorphProject.addSourceFileAtPath(filePath);
                } catch (error) {
                    // Silently continue if we can't load a file
                }
            }
        }
        
        // Collect all nodes and their corresponding metadata objects
        const nodesToProcess: Array<{ node: ClassDeclaration | PropertyDeclaration | VariableDeclaration, metadata: DecoratedClass | PropertyMetadata | DataSourceMetadata }> = [];
        
        for (const file of Object.values(this.cache)) {
            const sourceFile = this.tsMorphProject.getSourceFile(file.uri.fsPath);
            if (!sourceFile) continue;

            // Collect classes and their properties
            for (const cls of Object.values(file.classes)) {
                const classNode = sourceFile.getClass(cls.name);
                if (classNode) {
                    nodesToProcess.push({ node: classNode, metadata: cls });
                    
                    for (const prop of Object.values(cls.properties)) {
                        const propNode = classNode.getProperty(prop.name);
                        if (propNode) {
                            nodesToProcess.push({ node: propNode, metadata: prop });
                        }
                    }
                }
            }

            // Collect data sources
            for (const ds of Object.values(file.dataSources)) {
                const varDecl = sourceFile.getVariableDeclaration(ds.name);
                if (varDecl) {
                    nodesToProcess.push({ node: varDecl, metadata: ds });
                }
            }
        }
        
        // Process all nodes using the proven findReferences approach
        for (const { node, metadata } of nodesToProcess) {
            this.findAndStoreReferences(node, metadata);
        }
    }

    /**
     * Builds references for a specific file's classes and properties
     * @param filePath The file path to build references for
     */
    private buildReferencesForFile(filePath: string): void {
        const normalizedPath: string = filePath.replace(/\\/g, '/');
        const file = this.cache[normalizedPath];
        if (!file) {
            return;
        }

        const sourceFile = this.tsMorphProject.getSourceFile(normalizedPath);
        if (!sourceFile) {
            return;
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
        for (const ds of Object.values(file.dataSources)) {
            const varDecl = sourceFile.getVariableDeclaration(ds.name);
            if (varDecl) {
                this.findAndStoreReferences(varDecl, ds);
            }
        }
    }

    /**
     * Finds all references to a given node (class or property) and stores them
     * in the cache using your more precise method.
     * @param node The ts-morph node to find references for.
     * @param metadataObject The corresponding metadata object in the cache to store the references in.
     */
    private findAndStoreReferences(node: ClassDeclaration | PropertyDeclaration | VariableDeclaration, metadataObject: DecoratedClass | PropertyMetadata | DataSourceMetadata): void {
        const nodeName = node.getKind() === SyntaxKind.ClassDeclaration ? 
            (node as ClassDeclaration).getName() :
            node.getKind() === SyntaxKind.PropertyDeclaration ?
            (node as PropertyDeclaration).getName() :
            (node as VariableDeclaration).getName();
            
        try {
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
        } catch (error) {
            console.warn(`[Cache] Error finding references for ${nodeName}:`, error);
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
     * Returns all @Model decorated classes that are stored in the src/data folder.
     * This is a more specific version of getDataModels() that only returns
     * classes with the @Model decorator.
     * @returns An array of DecoratedClass objects that represent Model classes in the data folder.
     */
    public getDataModelClasses(): DecoratedClass[] {
        return this.getDataModels().filter(classData => 
            classData.decorators.some(decorator => decorator.name === 'Model')
        );
    }

    /**
     * Returns all data sources found in the cache.
     * @returns An array of DataSourceMetadata objects.
     */
    public getDataSources(): DataSourceMetadata[] {
        const dataSources: DataSourceMetadata[] = [];
        for (const fileData of Object.values(this.cache)) {
            if (fileData.dataSources) {
                dataSources.push(...Object.values(fileData.dataSources));
            }
        }
        return dataSources.sort((a, b) => a.name.localeCompare(b.name));
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
     * Disposes of the file watchers when the extension is deactivated.
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
        this.folderWatcher?.dispose();
    }
}
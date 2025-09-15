import * as vscode from 'vscode';
import { AppTreeItem } from '../explorer/appTreeItem';

/**
 * Interface for URI resolution options
 */
export interface UriResolutionOptions {
    /** Whether to require a TypeScript file */
    requireTypeScript?: boolean;
    /** Whether to require a model file (contains @Model) */
    requireModel?: boolean;
    /** Whether to allow fallback to active editor */
    allowActiveEditorFallback?: boolean;
    /** Whether to use workspace folder as fallback when no URI provided */
    useWorkspaceFolderFallback?: boolean;
    /** Error message when no URI is provided */
    noUriErrorMessage?: string;
    /** Error message when file is not TypeScript */
    notTypeScriptErrorMessage?: string;
    /** Error message when file is not a model */
    notModelErrorMessage?: string;
}

/**
 * Result of URI resolution
 */
export interface UriResolutionResult {
    /** Resolved target URI */
    targetUri: vscode.Uri;
    /** Model name if available from AppTreeItem */
    modelName?: string;
    /** The document for the resolved URI */
    document?: vscode.TextDocument;
}

/**
 * Default options for URI resolution
 */
const DEFAULT_URI_OPTIONS: UriResolutionOptions = {
    requireTypeScript: true,
    requireModel: false,
    allowActiveEditorFallback: true,
    useWorkspaceFolderFallback: false,
    noUriErrorMessage: 'Please select a file or open one in the editor.',
    notTypeScriptErrorMessage: 'Please select a TypeScript file (.ts).',
    notModelErrorMessage: 'The selected file does not appear to be a model file.'
};

/**
 * Resolves a URI from various input sources with validation
 */
export async function resolveTargetUri(
    uri?: vscode.Uri | AppTreeItem,
    options: UriResolutionOptions = {}
): Promise<UriResolutionResult> {
    const opts = { ...DEFAULT_URI_OPTIONS, ...options };
    let targetUri: vscode.Uri;
    let modelName: string | undefined;

    // Step 1: Resolve the URI from different sources
    if (uri) {
        if (uri instanceof vscode.Uri) {
            targetUri = uri;
        } else {
            // AppTreeItem case
            if ((uri.itemType === 'model' || uri.itemType === 'compositionField') && uri.metadata?.declaration?.uri) {
                targetUri = uri.metadata.declaration.uri;
                modelName = uri.metadata?.name;
            } else {
                throw new Error(opts.noUriErrorMessage!);
            }
        }
    } else {
        // Fallback to active editor if allowed
        if (opts.allowActiveEditorFallback) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                // Use workspace folder as final fallback if allowed
                if (opts.useWorkspaceFolderFallback) {
                    targetUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('');
                } else {
                    throw new Error(opts.noUriErrorMessage!);
                }
            } else {
                targetUri = activeEditor.document.uri;
            }
        } else {
            throw new Error(opts.noUriErrorMessage!);
        }
    }

    // Step 2: Validate TypeScript file if required
    if (opts.requireTypeScript && !targetUri.fsPath.endsWith('.ts')) {
        throw new Error(opts.notTypeScriptErrorMessage!);
    }

    // Step 3: Load document and validate model if required
    let document: vscode.TextDocument | undefined;
    if (opts.requireModel) {
        document = await vscode.workspace.openTextDocument(targetUri);
        const content = document.getText();
        
        if (!content.includes('@Model')) {
            throw new Error(opts.notModelErrorMessage!);
        }
    }

    return {
        targetUri,
        modelName,
        document
    };
}

/**
 * Creates a standardized command handler that includes error handling
 */
export function createCommandHandler(
    commandFn: (result: UriResolutionResult, ...args: any[]) => Promise<void>,
    uriOptions?: UriResolutionOptions
) {
    return async (uri?: vscode.Uri | AppTreeItem, ...additionalArgs: any[]) => {
        try {
            const result = await resolveTargetUri(uri, uriOptions);
            await commandFn(result, ...additionalArgs);
        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }
    };
}

/**
 * Creates a command registration helper
 */
export function registerCommand(
    disposables: vscode.Disposable[],
    commandId: string,
    commandFn: (result: UriResolutionResult, ...args: any[]) => Promise<void>,
    uriOptions?: UriResolutionOptions
): void {
    const handler = createCommandHandler(commandFn, uriOptions);
    const command = vscode.commands.registerCommand(commandId, handler);
    disposables.push(command);
}

/**
 * Pre-configured URI resolution options for common scenarios
 */
export const URI_OPTIONS = {
    /** For commands that work with any TypeScript file */
    TYPESCRIPT_FILE: {
        requireTypeScript: true,
        requireModel: false,
        allowActiveEditorFallback: true,
        useWorkspaceFolderFallback: false,
        noUriErrorMessage: 'Please select a TypeScript file or open one in the editor.',
        notTypeScriptErrorMessage: 'Please select a TypeScript file (.ts).'
    } as UriResolutionOptions,

    /** For commands that specifically need model files */
    MODEL_FILE: {
        requireTypeScript: true,
        requireModel: true,
        allowActiveEditorFallback: true,
        useWorkspaceFolderFallback: false,
        noUriErrorMessage: 'Please select a model file or open one in the editor.',
        notTypeScriptErrorMessage: 'Please select a TypeScript model file (.ts).',
        notModelErrorMessage: 'The selected file does not appear to be a model file.'
    } as UriResolutionOptions,

    /** For commands that require explicit file selection (no active editor fallback) */
    EXPLICIT_MODEL_SELECTION: {
        requireTypeScript: true,
        requireModel: false,
        allowActiveEditorFallback: false,
        useWorkspaceFolderFallback: false,
        noUriErrorMessage: 'Please select a model file.',
        notTypeScriptErrorMessage: 'Please select a TypeScript model file (.ts).'
    } as UriResolutionOptions,

    /** For commands that work with any file type */
    ANY_FILE: {
        requireTypeScript: false,
        requireModel: false,
        allowActiveEditorFallback: true,
        useWorkspaceFolderFallback: true,
        noUriErrorMessage: 'Please select a file or open one in the editor.'
    } as UriResolutionOptions
};

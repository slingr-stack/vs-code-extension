import * as vscode from 'vscode';
import { cache } from '../extension';
import { DecoratedClass, PropertyMetadata } from '../cache/cache';

/**
 * Finds the metadata for a class or property at a specific position in a document.
 * @param uri The URI of the document.
 * @param position The position in the document.
 * @returns The found metadata or undefined.
 */
export async function findNodeAtPosition(uri: vscode.Uri, position: vscode.Position): Promise<DecoratedClass | PropertyMetadata | undefined> {
    const fileCache = cache.findMetadata(m => m.declaration.uri.fsPath === uri.fsPath);

    // Search for properties first, as they are more specific
    const property = fileCache.find(m => 
        'type' in m && m.declaration.range.contains(position)
    ) as PropertyMetadata | undefined;

    if (property) {
        return property;
    }

    // If no property is found, search for a class
    const classInfo = fileCache.find(m => 
        'decorators' in m && !('type' in m) && m.declaration.range.contains(position)
    ) as DecoratedClass | undefined;

    return classInfo;
}

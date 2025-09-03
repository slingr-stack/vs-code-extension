
import * as vscode from 'vscode';
import { DecoratedClass, MethodMetadata, PropertyMetadata } from "../cache/cache";
import { fieldTypeConfig } from '../utils/fieldTypes';

/**
 * Checks if a URI corresponds to a file in the model directory.
 * @param uri - The VS Code URI to check.
 * @returns True if the URI is for an model file, false otherwise.
 */
export function isModelFile(uri: vscode.Uri): boolean {
    const modelFileRegex = /src\/data\/.*\.ts$/;
    return modelFileRegex.test(uri.path);
}

/**
 * Checks if a class metadata object is an Model.
 * @param metadata - The class or property metadata to check.
 * @returns True if the metadata is for an Model class, false otherwise.
 */
export function isModel(metadata: DecoratedClass | PropertyMetadata): metadata is DecoratedClass {
    return 'decorators' in metadata && metadata.decorators.some(d => d.name === 'Model');
}

const fieldDecoratorNames = Object.keys(fieldTypeConfig);

/**
 * Checks if a property metadata object is a Field.
 * @param metadata - The class or property metadata to check.
 * @returns True if the metadata is for a Field property, false otherwise.
 */
export function isField(metadata: DecoratedClass | PropertyMetadata): metadata is PropertyMetadata {
    return 'type' in metadata && metadata.decorators.some(d => fieldDecoratorNames.includes(d.name) || d.name === 'Field');
}

export function isMethodMetadata(value: any): value is MethodMetadata {
    // Check for properties that uniquely identify a MethodMetadata object
    return typeof value === 'object' && value !== null && 'parameters' in value && 'declaration' in value;
}

/**
 * Compares two range-like objects for equality.
 * @param r1 - The first range object.
 * @param r2 - The second range object.
 * @returns True if both ranges are equal or both are undefined/null, false otherwise.
 */
export function areRangesEqual(
    r1?: { start: { line: number, character: number }, end: { line: number, character: number } },
    r2?: { start: { line: number, character: number }, end: { line: number, character: number } }
): boolean {
    if (!r1 || !r2) {
        return r1 === r2;
    }
    return r1.start.line === r2.start.line &&
           r1.start.character === r2.start.character &&
           r1.end.line === r2.end.line &&
           r1.end.character === r2.end.character;
}
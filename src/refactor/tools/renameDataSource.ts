import * as vscode from 'vscode';
import { ChangeObject, IRefactorTool, ManualRefactorContext, RenameDataSourcePayload } from '../refactorInterfaces';
import { FileMetadata, MetadataCache } from '../../cache/cache';
import { areRangesEqual } from '../../utils/metadata';

export class RenameDataSourceTool implements IRefactorTool {
    getCommandId(): string {
        return 'slingr-vscode-extension.renameDataSource';
    }

    getTitle(): string {
        return 'Rename Data Source';
    }

    getHandledChangeTypes(): string[] {
        return ['RENAME_DATA_SOURCE'];
    }

    async canHandleManualTrigger(context: ManualRefactorContext): Promise<boolean> {
        const fileMeta = context.cache.getMetadataForFile(context.uri.fsPath);
        return !!fileMeta && Object.keys(fileMeta.dataSources).length > 0;
    }

    analyze(oldFileMeta?: FileMetadata, newFileMeta?: FileMetadata): ChangeObject[] {
        if (!oldFileMeta || !newFileMeta) {
            return [];
        }

        const oldDataSourceNames = Object.keys(oldFileMeta.dataSources);
        const newDataSourceNames = Object.keys(newFileMeta.dataSources);

        const removed = oldDataSourceNames.filter(name => !newDataSourceNames.includes(name));
        const added = newDataSourceNames.filter(name => !oldDataSourceNames.includes(name));

        if (removed.length === 1 && added.length === 1) {
            const oldName = removed[0];
            const newName = added[0];
            const payload: RenameDataSourcePayload = {
                oldName,
                newName,
                newUri: vscode.Uri.joinPath(oldFileMeta.uri, '..', `${newName}.ts`),
                isManual: false,
            };
            return [{
                type: 'RENAME_DATA_SOURCE',
                uri: newFileMeta.uri,
                description: `Rename data source '${oldName}' to '${newName}'`,
                payload,
            }];
        }

        return [];
    }

    async initiateManualRefactor(context: ManualRefactorContext): Promise<ChangeObject | undefined> {
        const fileMeta = context.cache.getMetadataForFile(context.uri.fsPath);
        if (!fileMeta || Object.keys(fileMeta.dataSources).length === 0) {
            vscode.window.showErrorMessage('No data source found in this file.');
            return;
        }

        const oldName = Object.keys(fileMeta.dataSources)[0];

        const newName = await vscode.window.showInputBox({
            prompt: `Rename data source '${oldName}'`,
            value: oldName,
            validateInput: (value) => {
                if (!value) {
                    return 'Data source name cannot be empty';
                }
                if (!/^[a-zA-Z0-9_]+$/.test(value)) {
                    return 'Invalid data source name. Only alphanumeric characters and underscores are allowed.';
                }
                return null;
            },
        });

        if (!newName || newName === oldName) {
            return;
        }

        const payload: RenameDataSourcePayload = {
            oldName,
            newName,
            newUri: vscode.Uri.joinPath(context.uri, '..', `${newName}.ts`),
            isManual: true,
        };

        return {
            type: 'RENAME_DATA_SOURCE',
            uri: context.uri,
            description: `Rename data source '${oldName}' to '${newName}'`,
            payload,
        };
    }

    async prepareEdit(change: ChangeObject, cache: MetadataCache): Promise<vscode.WorkspaceEdit> {
        const payload = change.payload as RenameDataSourcePayload;
        const { oldName, newName, isManual } = payload;
        const workspaceEdit = new vscode.WorkspaceEdit();

        const oldUri = change.uri;
        const fileMeta = cache.getMetadataForFile(oldUri.fsPath);
        const dataSourceMeta = fileMeta?.dataSources[oldName];

        if (!dataSourceMeta) {
            console.error(`Could not find metadata for data source '${oldName}'`);
            return workspaceEdit;
        }

        const declarationUri = dataSourceMeta.declaration.uri;
        const declarationRange = dataSourceMeta.declaration.range;

        // Update all references EXCEPT the declaration itself (which is handled next)
        for (const ref of dataSourceMeta.references) {
            if (ref.uri.fsPath === declarationUri.fsPath && areRangesEqual(ref.range, declarationRange)) {
                continue;
            }
            workspaceEdit.replace(ref.uri, ref.range, newName);
        }

        // If it's a manual rename, we also need to change the declaration
        if (isManual) {
            workspaceEdit.replace(declarationUri, declarationRange, newName);
        }

        // Rename the file if its name matches the old data source name
        const oldFileName = oldUri.path.split('/').pop()?.replace('.ts', '');
        if (oldFileName === oldName) {
            const newUri = vscode.Uri.joinPath(oldUri, '..', `${newName}.ts`);
            workspaceEdit.renameFile(oldUri, newUri);
        }

        return workspaceEdit;
    }

}
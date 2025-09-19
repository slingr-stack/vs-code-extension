import { DatasetMetadata } from '../../cache/cache';
import { BaseRenderer } from './baseRenderer';
import { IRendererContext } from './iMetadataRenderer';
import { MetadataItem } from '../quickInfoProvider';
import * as fs from 'fs';

/**
 * Specialized renderer for Slingr dataset metadata display.
 *
 * The DatasetRenderer creates a view of dataset configurations including:
 * - Dataset name with source code navigation
 * - Associated files list with navigation links and model information
 * - File count summary and JSONL record counts
 * - Model-specific context for each file
 */
export class DatasetRenderer extends BaseRenderer {
    /**
     * Renders dataset metadata into a structured HTML display.
     * @param metadata - The dataset metadata to render
     * @param context - Rendering context for creating interactive elements
     * @returns HTML string with complete dataset information display
     */
    public render(metadata: MetadataItem, context?: IRendererContext): string {
        // Type guard to ensure we have dataset metadata
        if (!this.isDatasetMetadata(metadata)) {
            return '<p>Invalid dataset metadata</p>';
        }

        const dataset = metadata as DatasetMetadata;

        const titleCommand = {
            command: 'goToLocation',
            data: dataset.declaration
        };

        // Render dataset files as a clickable list with enhanced information
        const filesHtml = dataset.files.length > 0 
            ? dataset.files.map(file => {
                const fileCommand = {
                    command: 'goToLocation',
                    data: file.declaration
                };

                // Extract model name from file name (remove .jsonl extension)
                const modelName = file.name.replace('.jsonl', '');
                
                // Try to get record count and model information
                const fileInfo = this.getFileInfo(file, context);
                
                return `
                    <li>
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div>
                                <a href="#" class="clickable" data-command='${JSON.stringify(fileCommand)}'>
                                    <code>${file.name}</code>
                                </a>
                                ${modelName !== file.name.replace('.jsonl', '') ? '' : this.renderModelLink(modelName, context)}
                            </div>
                            <div style="color: var(--vscode-description-foreground); font-size: 0.9em;">
                                ${fileInfo}
                            </div>
                        </div>
                    </li>
                `;
            }).join('')
            : '<li><em>No files found</em></li>';

        const filesSummary = dataset.files.length > 0 
            ? `${dataset.files.length} file${dataset.files.length === 1 ? '' : 's'}`
            : 'No files';

        // Calculate total records across all files
        const totalRecords = this.getTotalRecords(dataset);
        const recordsSummary = totalRecords > 0 ? ` (${totalRecords} records total)` : '';

        return `
            <h1>
                <span class="tag">Dataset</span>
                <a href="#" class="clickable" data-command='${JSON.stringify(titleCommand)}'>${dataset.name}</a>
            </h1>
            <table>
                ${this._renderTableRow('Name', `<code>${dataset.name}</code>`)}
                ${this._renderTableRow('Files', filesSummary + recordsSummary)}
            </table>

            <h2>Dataset Files</h2>
            <ul class="item-list">
                ${filesHtml}
            </ul>
        `;
    }

    /**
     * Type guard to check if metadata is DatasetMetadata
     */
    private isDatasetMetadata(metadata: MetadataItem): metadata is DatasetMetadata {
        return metadata && typeof metadata === 'object' && 'files' in metadata && 'name' in metadata;
    }

    /**
     * Gets enhanced file information including record count for JSONL files
     */
    private getFileInfo(file: any, context?: IRendererContext): string {
        if (!file.name.endsWith('.jsonl')) {
            return '';
        }

        try {
            const filePath = file.declaration.uri.fsPath;
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.trim().split('\n').filter(line => line.trim());
                const recordCount = lines.length;
                
                if (recordCount === 0) {
                    return '<em>empty</em>';
                }
                
                return `${recordCount} record${recordCount === 1 ? '' : 's'}`;
            }
        } catch (error) {
            // Silently handle file read errors
            console.warn(`Could not read dataset file: ${file.name}`, error);
        }
        
        return '';
    }

    /**
     * Renders a clickable link to the model if it exists
     */
    private renderModelLink(modelName: string, context?: IRendererContext): string {
        if (!context?.findModel) {
            return '';
        }

        const model = context.findModel(modelName);
        if (model) {
            const modelCommand = {
                command: 'itemClicked',
                data: { itemType: 'model', name: modelName }
            };
            
            return ` → <a href="#" class="clickable" data-command='${JSON.stringify(modelCommand)}' style="color: var(--vscode-textLink-foreground);">${modelName}</a>`;
        }

        return ` <span style="color: var(--vscode-description-foreground);">(${modelName})</span>`;
    }

    /**
     * Calculates the total number of records across all JSONL files in the dataset
     */
    private getTotalRecords(dataset: DatasetMetadata): number {
        let total = 0;
        
        for (const file of dataset.files) {
            if (!file.name.endsWith('.jsonl')) {
                continue;
            }

            try {
                const filePath = file.declaration.uri.fsPath;
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.trim().split('\n').filter(line => line.trim());
                    total += lines.length;
                }
            } catch (error) {
                // Silently handle file read errors
                console.warn(`Could not read dataset file: ${file.name}`, error);
            }
        }
        
        return total;
    }
}
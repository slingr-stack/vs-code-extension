import { IMetadataRenderer } from './iMetadataRenderer';
import { ModelRenderer } from './modelRenderer';
import { FieldRenderer } from './fieldRenderer';
import { DataSourceRenderer } from './dataSourceRenderer';

/**
 * Central registry for metadata renderers in the Quick Info Panel system.
 * 
 * This module maintains a mapping between metadata item types and their
 * corresponding specialized renderers. The registry enables the Quick Info
 * Provider to automatically select the appropriate renderer for each type
 * of metadata being displayed.
 */
export const rendererRegistry = new Map<string, IMetadataRenderer>([
    ['model', new ModelRenderer()],
    ['field', new FieldRenderer()],
    ['referenceField', new FieldRenderer()],
    ['compositionField', new FieldRenderer()],
    ['dataSource', new DataSourceRenderer()],
]);
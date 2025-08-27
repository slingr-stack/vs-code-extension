import { IMetadataRenderer } from './iMetadataRenderer';
import { ModelRenderer } from './modelRenderer';
import { FieldRenderer } from './fieldRenderer';
// When you add new renderers, you'll import them here:
// import { ActionRenderer } from './actionRenderer';

// Create and export the registry map
export const rendererRegistry = new Map<string, IMetadataRenderer>([
    ['model', new ModelRenderer()],
    ['field', new FieldRenderer()],
    // When you add an Action renderer, you just add it here:
    // ['action', new ActionRenderer()],
]);
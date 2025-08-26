// src/info-panel/renderers/iMetadataRenderer.ts
import { DecoratedClass, PropertyMetadata } from '../../cache/cache';

export interface IMetadataRenderer {
    render(metadata: any): string;
}
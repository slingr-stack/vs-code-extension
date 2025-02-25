import { Entity } from "./entity";
import { GridView } from "./gridView";

export interface App {
    entities: Record<string, Entity>;
    views: Record<string, GridView>;
}

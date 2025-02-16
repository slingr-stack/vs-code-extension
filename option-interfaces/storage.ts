import { DataDefinition } from "./backend";

export interface DatabaseSettings {
    name: string,
    uri: string
}

export function registerDatabase(dbSettings: DatabaseSettings): void {
    // TODO
}

export function registerPersistentData<T>(db: DatabaseSettings, dataDefinition: DataDefinition<T>): void {
    // TODO
}

export function findById<T>(id: string): T {
    return null;
}
import { Index, Repository } from "./db";

export interface MongoRepository<T> extends Repository<T> {
}

export function repositoryForSchema<T>(def: MongoRepository<T>): MongoRepository<T> {
    return def;
}

function regular<T>(fields: (keyof T)[]): Index<T> {
    return {
        type: 'regular',
        fields
    } as Index<T>;
};

export let indexes = {
    regular: regular
};
export interface Repository<T> {
    name: string;
    managed: boolean;
    indexes: Index<T>[];
    encrypt: (keyof T)[];
}

export interface Index<T> {
    type: 'regular' | 'unique' | 'fulltext' | 'vector',
    fields: (keyof T)[]
}
import { MongoQuery } from "./backend";
import { View } from "./frontend";

export interface OperationPermissions {
    type: 'always' | 'never' | 'conditional'
}

export interface DataOperationPermissions extends OperationPermissions {
    condition?: (data: any) => boolean
}

export interface QueryOperationPermissions extends OperationPermissions {
    condition?: MongoQuery
}

export interface ContextPermissions extends OperationPermissions {
    condition?: (context: any) => boolean
}

export interface FieldPermissions {
    read: OperationPermissions,
    write: OperationPermissions
}

export interface DataPermissions<T> {
    fields: {
        [K in keyof T]: FieldPermissions
    }
}

export interface PersistentDataPermissions<T> extends DataPermissions<T> {
    create: DataOperationPermissions,
    access: QueryOperationPermissions,
    edit: DataOperationPermissions,
    delete: DataOperationPermissions,
    auditLogs: DataOperationPermissions
}

export interface ViewPermissions {
    view: View,
    access: ContextPermissions
}

export interface Role {
    dataPermissions: DataPermissions<any>[],
    viewPermissions: ViewPermissions[]
}

export interface Group {
    roles: Role[]
}
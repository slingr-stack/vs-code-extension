import { DataModel, Field } from './backend';
import { DatabaseSettings, findById, registerDatabase, registerPersistentData } from './storage';
import { DataModelUISettings } from './frontend';
import { PersistentDataPermissions, DataPermissions, Role, Group } from './security';
import { formatDateTime } from './utils';
import { MongoRecord, CopiedField } from './storage';
import * as context from './libs/context';

///////////////////////////////////////////////////////////////////////////////////////////////////
// Model
///////////////////////////////////////////////////////////////////////////////////////////////////

// User

@DataModel()
@DataModelUISettings<User>({
    defaultLabel: 'fullName'
})
class User extends MongoRecord {
    @Field({
        required: {type: 'always'},
    })
    firstName: string;

    @Field({
        required: {type: 'always'}
    })
    lastName: string;

    @Field({
        calculation: (user: User) => `${user.firstName} ${user.lastName}`
    })
    fullName: string;

    @Field({
        required: {type: 'always'}
    })
    email: string;
}

// TaskNote

@DataModel()
@DataModelUISettings<TaskNote>({
    defaultLabel: 'label'
})
class TaskNote {
    @Field({
        calculation: calculateTaskNoteLabel
    })
    label: string;

    @Field({
        required: {type: 'always'}
    })
    note: string;

    @Field({
        required: {type: 'always'},
        defaultValue: () => new Date().getTime()
    })
    timestamp: number;

    @Field({
        required: {type: 'always'},
        defaultValue: () => context.getCurrentUser().id
    })
    addedBy: string;

    @CopiedField<TaskNote, User>({
        relationshipField: 'addedBy',
        copiedField: 'fullName'
    })
    addedByFullName: string;
}

function calculateTaskNoteLabel(taskNote: TaskNote) : string {
    return `${taskNote.addedBy} wrote on ${formatDateTime(new Date(taskNote.timestamp), 'MM/dd yy')} at ${formatDateTime(new Date(taskNote.timestamp), 'HH:mm')}`;
}

// Task

@DataModel()
@DataModelUISettings<Task>({
    defaultLabel: 'label'
})
class Task extends MongoRecord {
    @Field({
        required: {type: 'always'},
        calculation: (task: Task) => `#${task.number}. ${task.title}`
    })
    label: string;

    @Field({
        type: 'auto-incremental'
    })
    number: number;

    @Field({
        required: {type: 'always'}
    })
    title: string;

    @Field({
        type: 'array',
        itemType: 'relationship'
    })
    notes: TaskNote[];
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Views
///////////////////////////////////////////////////////////////////////////////////////////////////

const CreateTaskView: SimpleRecordView<Task> = {
    name: 'Create Task',
    mode: 'create',
    managed: true
};

const EditTaskView: SimpleRecordView<Task> = {
    name: 'Edit Task',
    mode: 'edit',
    managed: true
};

const TasksGridView: GridView<Task> = {
    name: 'Tasks',
    columns: [
        'number',
        'title'
    ],
    create: {
        enabled: true,
        view: CreateTaskView
    },
    detail: {
        enabled: true,
        view: EditTaskView
    }
}


///////////////////////////////////////////////////////////////////////////////////////////////////
// App Layout
///////////////////////////////////////////////////////////////////////////////////////////////////

const LeftMenu: Menu = {
    items: [
        {
            name: 'Tasks',
            view: TasksGridView
        } as MenuView
    ]
}

const TaskManagerAppLayout: AppLayout = {
    leftMenu: LeftMenu
}


///////////////////////////////////////////////////////////////////////////////////////////////////
// Permissions
///////////////////////////////////////////////////////////////////////////////////////////////////

const FullPermissionsOnTasks: PersistentDataPermissions<Task> = {
    create: {type: 'always'},
    edit: {type: 'always'},
    access: {type: 'always'},
    delete: {type: 'always'},
    auditLogs: {type: 'always'},
    fields: {
        id: {read: {type: 'always'}, write: {type: 'always'}},
        label: {read: {type: 'always'}, write: {type: 'always'}},
        number: {read: {type: 'always'}, write: {type: 'always'}},
        title: {read: {type: 'always'}, write: {type: 'always'}},
        notes: {read: {type: 'always'}, write: {type: 'always'}},
    }
}

const DefaultPermissionsOnTaskNotes: DataPermissions<TaskNote> = {
    fields: {
        label: {read: {type: 'always'}, write: {type: 'never'}},
        note: {read: {type: 'always'}, write: {type: 'always'}},
        timestamp: {read: {type: 'always'}, write: {type: 'never'}},
        addedBy: {read: {type: 'always'}, write: {type: 'never'}},
        addedByFullName: {read: {type: 'always'}, write: {type: 'never'}}
    }
}

const ManageTasksRole: Role = {
    dataPermissions: [
        FullPermissionsOnTasks,
        DefaultPermissionsOnTaskNotes
    ],
    viewPermissions: [
        { view: CreateTaskView, access: {type: 'always'} },
        { view: EditTaskView, access: {type: 'always'} },
        { view: TasksGridView, access: {type: 'always'} }
    ]
}

const AdminsGroup: Group = {
    roles: [ManageTasksRole]
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// Storage
///////////////////////////////////////////////////////////////////////////////////////////////////

const MainDatabase: DatabaseSettings = {
    name: 'example1',
    uri: ''
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// App Init
///////////////////////////////////////////////////////////////////////////////////////////////////

registerDatabase(MainDatabase);
registerPersistentData(MainDatabase, UserDefinition);
registerPersistentData(MainDatabase, TaskDefinition);

import { DataModel, Field } from './backend';
import { DatabaseSettings, findById, registerDatabase, registerPersistentData } from './storage';
import {
    GridView, SimpleRecordView,
    Menu, MenuView, AppLayout,
    DataUISettings
} from './frontend';
import { PersistentDataPermissions, DataPermissions, Role, Group } from './security';
import { formatDateTime } from './utils';
import { MongoRecord } from './storage';
import * as context from './libs/context';

///////////////////////////////////////////////////////////////////////////////////////////////////
// Model
///////////////////////////////////////////////////////////////////////////////////////////////////

// User

@DataModel()
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

    @CopiedField({
        
    })
    addedByFullName: string;
}



/*
interface TaskNote {
    label: string,
    note: string,
    timestamp: number,
    addedBy: string,
    addedByFullName: string
}

const TaskNoteDefinition: DataDefinition<TaskNote> & DataUISettings<TaskNote> = {
    defaultLabel: 'label',
    fields: {
        label: {
            type: 'text',
            required: {type: 'always'},
            calculation: calculateTaskNoteLabel
        },
        note: {
            type: 'text',
            required: {type: 'always'}
        },
        timestamp: {
            type: 'datetime',
            required: {type: 'always'},
            defaultValue: () => new Date().getTime()
        },
        addedBy: {
            type: 'relationship',
            required: {type: 'always'},
        },
        addedByFullName: {
            type: 'text',
            calculation: (taskNote: TaskNote) => {
                const user = findById<User>(taskNote.addedBy);
                return user.fullName;
            }
        }
    }
}
*/

function calculateTaskNoteLabel(taskNote: TaskNote) : string {
    return `${taskNote.addedBy} wrote on ${formatDateTime(new Date(taskNote.timestamp), 'MM/dd yy')} at ${formatDateTime(new Date(taskNote.timestamp), 'HH:mm')}`;
}

// Task

interface Task {
    id: string,
    label: string,
    number: number,
    title: string,
    notes: TaskNote[]
}

const TaskDefinition: DataDefinition<Task> & DataUISettings<Task> = {
    defaultLabel: 'label',
    fields: {
        id: {
            type: 'id'
        },
        label: {
            type: 'text',
            required: {type: 'always'},
            calculation: (task: Task) => `#${task.number}. ${task.title}`
        },
        number: {
            type: 'auto-incremental'
        },
        title: {
            type: 'text',
            required: {type: 'always'}
        },
        notes: {
            type: 'array',
            itemType: 'relationship'
        }
    }
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

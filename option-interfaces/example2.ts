import { DataDefinition } from './backend';
import { DatabaseSettings, findById, registerDatabase, registerPersistentData } from './storage';
import {
    GridView, SimpleRecordView,
    Menu, MenuView, AppLayout,
    DataUISettings
} from './frontend';
import { PersistentDataPermissions, DataPermissions, Role, Group } from './security';
import { formatDateTime } from './utils';

///////////////////////////////////////////////////////////////////////////////////////////////////
// Model
///////////////////////////////////////////////////////////////////////////////////////////////////

// User

type UserStatus = 'active' | 'inactive' | 'blocked';


interface User {
    firstName: string,
    lastName: string,
    fullName: string,
    email: string,
    status: UserStatus,
    department: string
}

const userModel = model<User>({
    fields: {
        firstName: textField({
            required: {type: 'always'},
            ui: {
                label: 'First Name'
            }
        }),
        lastName: textField({
            required: {type: 'always'},
            ui: {
                label: 'Last Name'
            }
        }),
        fullName: textField({
            calculation: (user: User) => {
                return `${user.firstName} ${user.lastName}`;
            },
            ui: {
                label: 'Full Name'
            }
        }),
        email: textField({
            required: {type: 'always'},
            validation: emailValidation,
            ui: {
                label: 'Email',
                readOnly: emailLabelWidget(),
                edit: textInputWidget()    
            }
        }),
        status: choiceField<UserStatus>({
            required: required.ALWAYS,
            defaultValue: 'active',
            ui: {
                label: 'Status',
                optionLabels: {
                    active: 'Active',
                    inactive: 'Inactive',
                    blocked: 'Blocked'
                }
            }
        }),
        department: textField({required: {type: 'always'}})
    },
    ui: {
        recordLabelField: 'fullName',
        sorting: {
            fields: 'fullName',
            direction: 'asc'
        }
    },
    dataSource: modelDataSource<User>({
        database: mainDb,
        indexes: [
            regularIndex(['fullName']),
            regularIndex(['email'])
        ]
    })
});

// TaskNote

interface TaskNote {
    label: string,
    note: string,
    timestamp: number,
    addedBy: string,
    addedByFullName: string
}

const taskNoteModel = model<TaskNote>({
    fields: {
        label: textField({
            required: {type: 'always'},
            calculation: calculateTaskNoteLabel
        }),
        note: longTextField({
            required: {type: 'always'},
            ui: {
                readOnly: markdownWidget(),
                editor: markdownEditor()
            }
        }),
        timestamp: datetimeField({
            required: required.ALWAYS,
            defaultValue: () => new Date().getTime(),
            ui: {
                readOnly: datatimeFormatWidget({format: 'MM/dd yy HH:mm'})
            }
        }),
        addedBy: relationshipField({
            required: required.ALWAYS,
            target: userModel,
            filter: () => {
                const users = backend.dataSources.mainDb.users();
                return users.query({status: 'active'});
            },
            ui: {
                label: 'Added By (ID)',
                visibility: visibility.NEVER
            }
        }),
        addedByFullName: textField({
            copiedField: copiedField<User>({
                from: 'addedBy',
                field: 'fullName'
            }),
            ui: {
                label: 'Added By'
            }
        })
    },
    ui: {
        recordLabelField: 'label'
    }
});

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

const taskModel = model<Task>({
    fields: {
        label: textField({
            required: {type: 'always'},
            ui: {
                label: 'Label'
            }
        }),
        number: autoIncrementalField({
            ui: {
                label: 'Number'
            }
        }),
        title: textField({
            required: {type: 'always'},
            ui: {
                label: 'Title'
            }
        }),
        notes: arrayField<TakeNote>({
            itemType: taskNoteModel,
            ui: {
                label: 'Notes',
                sorting: 'natural'
            }
        })
    },
    ui: {
        label: 'label',
        sorting: {
            field: 'createAt',
            direction: 'desc'
        }
    },
    dataSource: modelDataSource<Task>({
        database: mainDb,
        indexes: [
            regularIndex(['number']),
            regularIndex(['title'])
        ]
    })
});

///////////////////////////////////////////////////////////////////////////////////////////////////
// Agents
///////////////////////////////////////////////////////////////////////////////////////////////////

const visitSummarizationAgent = agent({
    modelSettings: {
        model: 'gemini-2.0-flash'
    },
    inputs: [
        {
            name: 'text',
            type: 'string'
        }
    ],
    instructions: `
    You are a doctor and need to summarize the medical record in no more than 100.
    `,
    prompt: `
    Please, summarize the following text: {text}
    `
});

const expressionSolver = tool({
    name: 'expressionSolver',
    description: 'Solves a math expression and returns the result',
    params: {
        expression: textField({})
    },
    script: (params: object) => {
        // do something
    }
})

const mathSolverAgent = agent({
    modelSettings: {
        model: 'gpt-3.5-turbo'
    },
    inputs: {
        question: textField({})
    }
    instructions: `
    You need to solve a mathematical expression and provide the result.
    `,
    prompt: `
    Please, solve the following mathematical expression: {question}
    `,
    tools: [ expressionSolver ]
});


///////////////////////////////////////////////////////////////////////////////////////////////////
// Views
///////////////////////////////////////////////////////////////////////////////////////////////////

const CreateTaskView = simpleRecordView<Task>({
    name: 'Create Task',
    mode: 'create',
    managed: true
});

const EditTaskView = simpleRecordView<Task>({
    name: 'Edit Task',
    mode: 'edit',
    managed: true
});

const TasksGridView = gridView<Task>({
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
});

interface TaskRelationship {
    task: string,
    number: number,
    title: string
}

interface DashboardModel extends ViewModel {
    project: string,
    tasks: TaskRelationship[]
}

const DashboardView = flexView<DashboardModel>({
    fields: {
        project: relationshipField({
            target: projectModel,
            ui: {
                label: 'Project'
            }
        }),
        tasks: arrayField<TaskRelationship>({
            fields: {
                task: relationshipField({
                    target: taskModel,
                    ui: {
                        label: 'Task'
                    }
                }),
                number: textField({
                    copiedField: copiedField<Task>({
                        from: 'task',
                        field: 'number'
                    }),
                    ui: {
                        label: 'Number'
                    }
                }),
                title: textField({
                    copiedField: copiedField<Task>({
                        from: 'task',
                        field: 'title'
                    }),
                    ui: {
                        label: 'Title'
                    }
                })
            },
            ui: {
                label: 'Tasks'
            }
        })
    },
    layout: {
        rows: [
            {
                columns: [
                    {
                        widgets: [
                            dataFormFieldWidget({
                                name: 'projectField',
                                field: 'project'
                            }),
                            dynamicTableWidget({
                                name: 'tasksTable',
                                data: (model: DashboardModel) => {
                                    return model.tasks;
                                }
                            }),
                        ]
                    }
                ]
            }
        ]
    },
    events: {
        onShow: (model: DashboardModel) => {
            model.project = dataSources.mainDb.projects.findById('...');
        },
        onChange: (model: DashboardModel) => {
            if (model.project) {
                const table = model.widgets['tasksTable'];
                table.refresh();
            }
        }
    }
})


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
// Libs
///////////////////////////////////////////////////////////////////////////////////////////////////

function test() {
    const users = dataSources.mainDb.users;
    let user = users.findById('...');
    users.save(user);
    users.remove(user);
    let cursor = users.find({});
    cursor = users.find({email: {$in: [email1, email2]}});
    let result = users.aggregate([]);
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// App Init
///////////////////////////////////////////////////////////////////////////////////////////////////

initApp();

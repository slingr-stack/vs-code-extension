import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    context as ctx,
    ui, mongo, api, } from 'slingr';
import { defaultUserRelationshipWidgets, User, userRepository, userSchema } from '../user/user';
import { format } from 'date-fns';

export const taskNoteSchema = m.model({
    label: t.text({
        calculation: (taskNote: TaskNote) => {
            return `${taskNote.addedByFullName} wrote on ${format(taskNote.timestamp, 'ddd MMM, yyyy')} at ${format(taskNote.timestamp, 'HH:mm')})}`;
        }
    }),
    note: t.longText({
        required: m.required.always
    }),
    addedBy: t.relationship({
        target: userSchema,
        required: m.required.always,
        defaultValue: (taskNote: TaskNote) => {
            const currentUser = ctx.getCurrentUser();
            return currentUser.id;
        }
    }),
    addedByFullName: t.text(),
    timestamp: t.datetime({
        defaultValue: () => new Date()
    })
});

ui.defaultUiForSchema<TaskNote>({
    label: 'Task Notes',
    recordLabelField: 'label',
    fields: {
        note: {
            label: 'Note',
            visibility: ui.visibility.always,
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.textAreaWidget()
            }]
        },
        addedBy: {
            label: 'Added By',
            visibility: ui.visibility.always,
            dataWidget: defaultUserRelationshipWidgets
        },
        timestamp: {
            label: 'Timestamp',
            visibility: ui.visibility.always,
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.datetimeWidget()
            }, {
                context: ui.context.edit,
                widget: w.datetimePickerWidget()
            }]
        }
    }
});

export const taskSchema = m.schema({
    title: t.text({
        required: m.required.always
    }),
    status: t.enum({
        required: m.required.always,
        values: ['open', 'inProgress', 'closed'],
        defaultValue: 'open'
    }),
    assignee: t.relationship({
        target: userSchema,
        required: m.required.always
    }),
    description: t.longText(),
    notes: t.array({
        items: taskNoteSchema
    })
});

export type Task = m.infer<typeof taskSchema>;

ui.defaultUiForSchema<Task>({
    label: 'Tasks',
    recordLabelField: 'title',
    sorting: {
        field: 'title',
        direction: 'asc'
    },
    fields: {
        title: {
            label: 'Title',
            visibility: ui.visibility.always,
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.inputWidget()
            }]
        },
        description: {
            label: 'Description',
            visibility: ui.visibility.always,
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.htmlWidget()
            }, {
                context: ui.context.edit,
                widget: w.htmlEditorWidget()
            }]
        },
        status: {
            label: 'Status',
            visibility: ui.visibility.always,
            values: {
                open: {
                    label: 'Open',
                    color: 'blue'
                },
                inProgress: {
                    label: 'In Progress',
                    color: 'orange'
                },
                closed: {
                    label: 'Closed',
                    color: 'green'
                }
            },
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.chipWidget()
            }, {
                context: ui.context.edit,
                widget: w.dropDownWidget()
            }]
        },
        assignee: {
            label: 'Assignee',
            visibility: ui.visibility.always,
            dataWidget: defaultUserRelationshipWidgets
        },
        notes: {
            label: 'Notes',
            visibility: ui.visibility.always,
        }
    }
});

export const taskRepository = mongo.repositoryForSchema<Task>({
    collectionName: 'tasks',
    managed: true,
    indexes: [
        mongo.regularIndex(['title']),
        mongo.regularIndex(['status']),
        mongo.regulatIndex(['assignee'])
    ],
    copiedFields: [
        mongo.copiedField({
            source: userSchema,
            sourceField: 'fullName',
            targetField: 'notes.assigneeFullName'
        })
    ]
});

export type TaskNote = t.TypeOf<typeof taskNoteSchema>;
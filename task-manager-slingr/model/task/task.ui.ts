import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    context as ctx,
    ui, mongo, api, } from 'slingr';
import { defaultUserRelationshipWidgets, User, userRepository, userSchema } from '../user/user';
import { format } from 'date-fns';
import { Tag, tagSchema } from '../tags/tag';
import { Task, TaskNote, TaskStatus } from './task.schema';

ui.defaultUiForSchema<TaskNote>({
    label: 'Task Notes',
    recordLabelField: 'label',
    fields: {
        note: {
            label: 'Note',
            visible: true,
            dataWidget: [{
                context: 'readOnly',
                widget: w.textWidget()
            }, {
                context: 'edit',
                widget: w.textAreaWidget()
            }]
        },
        addedBy: {
            label: 'Added By',
            visible: true,
            dataWidget: defaultUserRelationshipWidgets
        },
        timestamp: {
            label: 'Timestamp',
            visible: true,
            dataWidget: [{
                context: 'readOnly',
                widget: w.datetimeWidget()
            }, {
                context: 'edit',
                widget: w.datetimePickerWidget()
            }]
        }
    }
});

ui.defaultUiForSchema<Task>({
    label: 'Tasks',
    instanceLabelField: 'title',
    sorting: {
        field: 'title',
        direction: 'asc'
    },
    fields: {
        number: ui.fields.autoIncrement({
            label: 'Number'
        }),
        title: ui.fields.text({
            label: 'Title'
        }),
        description: ui.fields.htmlText({
            label: 'Description'
        }),
        status: ui.fields.enum<TaskStatus>({
            label: 'Status',
            values: {
                open: {
                    label: 'Open',
                    color: 'blue'
                },
                inProgress: {
                    label: 'In Progress',
                    color: 'orange'
                },
                completed: {
                    label: 'Completed',
                    color: 'green'
                },
                archived: {
                    label: 'Archived',
                    color: 'gray'
                }
            }
        }),
        tags: ui.fields.relationshipArray<Tag>({
            label: 'Tags'
        }),
        createdAt: ui.fields.datetime({
            label: 'Created At'
        }),
        createdBy: ui.fields.relationship<User>({
            label: 'Created By'
        }),
        closedAt: ui.fields.datetime({
            label: 'Closed At'
        }),
        assignees: ui.fields.relationshipArray<User>({            
            label: 'Assignees'
        }),
        notes: ui.fields.objectArray<TaskNote>({
            label: 'Notes'
        })
    }
});
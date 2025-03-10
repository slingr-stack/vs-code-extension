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

export const taskNoteSchema = m.schema({
    label: t.text({
        calculation: (taskNote: TaskNote) => {
            return `${taskNote.addedByFullName} wrote on ${format(taskNote.timestamp, 'ddd MMM, yyyy')} at ${format(taskNote.timestamp, 'HH:mm')})}`;
        }
    }),
    note: t.longText({
        required: true
    }),
    addedBy: t.relationship<User>({
        required: true,
        defaultValue: (taskNote: TaskNote) => {
            const currentUser = ctx.getCurrentUser();
            return currentUser.id;
        }
    }),
    timestamp: t.datetime({
        defaultValue: () => new Date()
    })
});

export type TaskNote = t.TypeOf<typeof taskNoteSchema>;

export type TaskStatus = 'open' | 'inProgress' | 'completed' | 'archived';

export const taskSchema = mongo.documentSchema.extend({
    number: t.number({
        validators: [v.integer()]
    }),
    title: t.text({
        required: true
    }),
    status: t.enum<TaskStatus>({
        required: true,
        defaultValue: 'open'
    }),
    tags: t.array({
        items: t.relationship<Tag>()
    }),
    createdAt: t.datetime({
        required: true,
        defaultValue: () => new Date()
    }),
    createdBy: t.relationship<User>({
        required: true,
        defaultValue: (task: Task) => {
            const currentUser = ctx.getCurrentUser();
            return currentUser.id;
        }
    }),
    closedAt: t.datetime({
        availability: (task: Task) => {
            return task.status === 'completed';
        }
    }),
    assignees: t.array({
        items: t.relationship<User>()
    }),    
    description: t.longText(),
    notes: t.array({
        items: taskNoteSchema
    })
});

export type Task = m.infer<typeof taskSchema>;

export const taskRepository = mongo.repositoryForSchema<Task>({
    collectionName: 'tasks',
    managed: true,
    autoIncrement: [
        mongo.autoIncrementField('number', 1)
    ],
    indexes: [
        mongo.regularIndex(['title']),
        mongo.regularIndex(['status']),
        mongo.regularIndex(['assignees'])
    ]
});

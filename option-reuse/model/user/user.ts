import { z } from 'zod';
import { widgets as w, ui, db, api } from 'slingr';

export const userSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    age: z.number().int().positive(),
    password: z.string().min(8).max(16),
    notes: z.string().optional()
});

export type User = z.infer<typeof userSchema>;

const userRepresentation = ui.defaultUiForObject<User>({
    label: 'Users',
    recordLabelField: 'fullName',
    sorting: {
        field: 'fullName',
        direction: 'asc'
    },
    fields: {
        firstName: {
            label: 'First Name',
            visibility: ui.visibility.always,
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.inputWidget()
            }]
        },
        lastName: {
            label: 'Last Name',
            visibility: {type: 'always'},
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.inputWidget()
            }]
        },
        fullName: {
            label: 'Last Name',
            dataWidget: [{
                context: ui.context.all,
                widget: w.textWidget()
            }]
        },
        email: {
            label: 'Email',
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.emailWidget()
            }, {
                context: ui.context.edit,
                widget: w.inputWidget()
            }]
        },
        age: {
            label: 'Age',
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.inputWidget()
            }]
        },
        password: {
            label: 'Password',
            visibility: ui.visibility.never
        },
        notes: {
            label: 'Notes',
            dataWidget: [{
                context: ui.context.readOnly,
                widget: w.textWidget()
            }, {
                context: ui.context.edit,
                widget: w.textAreaWidget()
            }]
        }
    }
});

const userRepository = db.repositoryForObject<User>({
    collectionName: 'users',
    schema: userSchema,
    indexes: [
        db.regularIndex(['email']),
        db.regulatIndex(['fullName'])
    ],
    encrypt: ['password']
});


const userApi = api.dataApiForObject<User>({
    repository: userRepository
});

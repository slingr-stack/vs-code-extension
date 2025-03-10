import * as s from '../../framework/backend/schemas';
import * as ui from '../../framework/frontend/ui';
import * as w from '../../framework/frontend/widgets';
import { 
    model as m, 
    types as t, 
    validators as v, 
    mongo, api, } from 'slingr';

export const userSchema = s.schema({
    firstName: s.string({
        required: true
    }),
    lastName: s.string({
        required: true
    }),
    fullName: s.string({
        calculation: (user: User) => {
            return `${user.firstName} ${user.lastName}`;
        }
    }),
    email: s.email({
        required: true
    }),
    age: s.number({
        integer: true,
        min: 0,
        max: 150
    }),
    password: s.string({        
        required: true,
        min: 8,
        max: 16
    }),
    notes: s.string({})
});

export type User = s.infer<typeof userSchema>;

ui.defaultUiForSchema<User>({
    label: 'Users',
    recordLabelField: 'fullName',
    sorting: {
        field: 'fullName',
        direction: 'asc'
    },
    fields: {
        firstName: {
            label: 'First Name',
            visibility: 'always',
            dataWidget: [{
                context: 'readOnly',
                widget: w.textWidget()
            }, {
                context: 'edit',
                widget: w.inputWidget()
            }]
        },
        lastName: {
            label: 'Last Name',
            visibility: 'always',
            dataWidget: [{
                context: 'readOnly',
                widget: w.textWidget()
            }, {
                context: 'edit',
                widget: w.inputWidget()
            }]
        },
        fullName: {
            label: 'Last Name',
            dataWidget: [{
                context: 'all',
                widget: w.textWidget()
            }]
        },
        email: {
            label: 'Email',
            dataWidget: [{
                context: 'readOnly',
                widget: w.emailWidget()
            }, {
                context: 'edit',
                widget: w.inputWidget()
            }]
        },
        age: {
            label: 'Age',
            dataWidget: [{
                context: 'readOnly',
                widget: w.textWidget()
            }, {
                context: 'edit',
                widget: w.inputWidget()
            }]
        },
        password: {
            label: 'Password',
            visibility: 'never'
        },
        notes: {
            label: 'Notes',
            dataWidget: [{
                context: 'readOnly',
                widget: w.textWidget()
            }, {
                context: 'edit',
                widget: w.textAreaWidget()
            }]
        }
    }
});

export const defaultUserRelationshipWidgets = [{
    context: ui.context.readOnly,
    widget: w.relationshipLabelWidget<User>({
        labelField: 'fullName'
    })
}, {
    context: ui.context.edit,
    widget: w.relationshipDropDownWidget<User>({
        labelField: 'fullName'
    })
}];

export const userRepository = mongo.repositoryForSchema<User>({
    collectionName: 'users',
    managed: true,
    indexes: [
        mongo.regularIndex(['email']),
        mongo.regulatIndex(['fullName'])
    ],
    encrypt: ['password']
});

api.addSchema(userSchema, userRepository);
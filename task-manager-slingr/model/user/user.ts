import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    ui, mongo, api, } from 'slingr';

export const userSchema = m.schema({
    firstName: t.text({
        required: m.required.always
    }),
    lastName: t.text({
        required: m.required.always
    }),
    fullName: t.text({
        calculation: (user: User) => {
            return `${user.firstName} ${user.lastName}`;
        }
    }),
    email: t.email({
        required: m.required.always,
        validators: [v.email()]
    }),
    age: t.number({
        validators: [v.integer(), v.positive(), v.lessThan(150)]
    }),
    password: t.text({
        required: m.required.always,
        validators: [v.minLength(8), v.maxLength(16)]
    }),
    notes: t.longText()
});

export type User = m.infer<typeof userSchema>;

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
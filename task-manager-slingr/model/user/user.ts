import * as s from '../../framework/backend/schemas';
import * as m from '../../framework/helpers/models';
import * as ui from '../../framework/frontend/ui';

export const userSchema = m.model({
    fields: {
        firstName: m.fields.string({
            required: true,
            defaultUi: ui.fields.text({label: 'First Name'})
        }),
        lastName: m.fields.string({
            required: true,
            defaultUi: ui.fields.text({label: 'Last Name'})
        }),
        fullName: m.fields.string({
            calculation: (user: User) => {
                return `${user.firstName} ${user.lastName}`;
            },
            defaultUi: ui.fields.text({label: 'Full Name'})
        }),
        email: m.fields.email({
            required: true,
            defaultUi: ui.fields.email({label: 'Email'})
        }),
        status: m.fields.enumeration({
            required: true,
            defaultValue: (data: User) => 'active',
            values: ['active', 'inactive'],
            defaultUi: ui.fields.enumeration({
                options: [
                    {
                        value: 'active',
                        label: 'Active',
                        color: 'green'
                    },
                    {
                        value: 'inactive',
                        label: 'Inactive',
                        color: 'red'
                    }
                ]
            })
        }),
        age: m.fields.number({
            integer: true,
            min: 0,
            max: 150,
            defaultUi: ui.fields.number({label: 'Age'})
        }),
        password: m.fields.text({        
            required: true,
            min: 8,
            max: 16,
            defaultUi: ui.fields.password({label: 'Password'})
        }),
        notes: m.fields.html({})
    }
});

export type User = s.InferType<typeof userSchema>;

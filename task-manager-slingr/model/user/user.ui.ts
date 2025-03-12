import { User } from "./user.schema";
import * as ui from '../../framework/frontend/ui';

ui.defaultUiForSchema<User>({
    label: 'Users',
    objectLabelField: 'fullName',
    sorting: {
        field: 'fullName',
        direction: 'asc'
    },
    fields: {
        firstName: ui.fields.text({label: 'First Name'}),
        lastName: ui.fields.text({label: 'Last Name'}),
        fullName: ui.fields.text({label: 'Full Name'}),
        email: ui.fields.text({label: 'Email'}),
        status: ui.fields.enumeration({
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
        }),
        age: ui.fields.number({label: 'Age'}),
        password: ui.fields.password({
            label: 'Password',
            visible: false
        }),
        notes: ui.fields.text({label: 'Notes'})
    }
});

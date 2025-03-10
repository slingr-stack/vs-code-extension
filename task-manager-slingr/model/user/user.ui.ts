import { User } from "./user.schema";
import * as ui from '../../framework/frontend/ui';

ui.defaultUiForSchema<User>({
    label: 'Users',
    recordLabelField: 'fullName',
    sorting: {
        field: 'fullName',
        direction: 'asc'
    },
    fields: {
        firstName: ui.fields.text({label: 'First Name'}),
        lastName: ui.fields.text({label: 'Last Name'}),
        fullName: ui.fields.text({label: 'Full Name'}),
        email: ui.fields.text({label: 'Email'}),
        age: ui.fields.number({label: 'Age'}),
        password: ui.fields.password({
            label: 'Password',
            visible: false
        }),
        notes: ui.fields.text({label: 'Notes'})
    }
});

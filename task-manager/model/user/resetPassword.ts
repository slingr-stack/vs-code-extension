import { User } from './user';
import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    ui, mongo, api, } from 'slingr';

const resetPasswordSchema = m.schema({
    newPassword: t.text({
        required: m.required.always
    }),
    confirmNewPassword: t.text({
        required: m.required.always
    })
}).validate((data: ResetPassword) => {
    if (data.newPassword != data.confirmNewPassword) {
        return {
            message: "Passwords don't match",
            path: ['confirmNewPassword']
        }
    }
});

type ResetPassword = m.infer<typeof resetPasswordSchema>;

ui.defaultUiForSchema<ResetPassword>({
    newPassword: {
        label: 'New Password',
        dataWidget: [{
            context: ui.context.all, 
            widget: w.passwordWidget()
        }]
    },
    confirmNewPassword: {
        label: 'Confirm New Password',
        dataWidget: [{
            context: ui.context.all, 
            widget: w.passwordWidget()
        }]
    }
});

export const resetPasswordAction = m.recordAction<User, ResetPassword>({
    precondition: (record: User) => {
        return record.status == 'active';
    },
    script: (record: User, params: ResetPassword) => {
        // do something
    }
});

api.addAction(resetPasswordAction);
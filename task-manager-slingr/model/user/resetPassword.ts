import { User } from './user.schema';
import * as s from '../../framework/backend/schemas';
import * as a from '../../framework/backend/actions';
import * as ui from '../../framework/frontend/ui';

const resetPasswordSchema = s.schema({
    newPassword: s.string({
        required: true
    }),
    confirmNewPassword: s.string({
        required: true
    })
}, (data: ResetPassword) => {
    if (data.newPassword != data.confirmNewPassword) {
        return [{
            message: "Passwords don't match",
            path: 'confirmNewPassword'
        }];
    }
    return [];
});

type ResetPassword = s.InferType<typeof resetPasswordSchema>;

ui.defaultUiForSchema<ResetPassword>({
    fields: {
        newPassword: ui.fields.password({label: 'New Password'}),
        confirmNewPassword: ui.fields.password({label: 'Confirm New Password'})
    }
});

export const resetPasswordAction = a.recordAction<User, ResetPassword>({
    precondition: (data: User) => {
        return data.status == 'active';
    },
    script: (record: User, params: ResetPassword) => {
        // do something
    }
});

api.addAction(resetPasswordAction);
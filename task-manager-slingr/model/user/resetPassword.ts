import { User } from './user.schema';
import * as s from '../../framework/backend/schemas';

const resetPasswordSchema = s.schema({
    newPassword: s.string({
        required: true
    }),
    confirmNewPassword: s.string({
        required: true
    })
}).validate((data: ResetPassword) => {
    if (data.newPassword != data.confirmNewPassword) {
        return [{
            message: "Passwords don't match",
            path: 'confirmNewPassword'
        }];
    }
});

type ResetPassword = s.InferType<typeof resetPasswordSchema>;

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
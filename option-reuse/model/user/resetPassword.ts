import { z } from 'zod';
import {User} from 'user';
import { widgets as w, model as m, ui, db, api } from 'slingr';

const resetPasswordSchema = z.object({
    newPassword: z.string(),
    confirmNewPassword: z.string()
}).refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don't match",
    path: ["confirmNewPassword"]
});

type ResetPassword = z.infer<typeof resetPasswordSchema>;

const resetPasswordRepresentation = ui.defaultUiForObject<ResetPassword>({
    newPassword: {
        label: 'New Password',
        dataWidget: [{context: ui.context.edit, widget: w.passwordWidget()}]
    },
    confirmNewPassword: {
        label: 'Confirm New Password',
        dataWidget: [{context: ui.context.edit, widget: w.passwordWidget()}]
    }
});

export const resetPasswordAction = m.recordAction<User, ResetPassword>({
    script: (record: User, params: ResetPassword) => {
        // do something
    }
}); 
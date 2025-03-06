import { z } from 'zod';
import { userSchema } from 'user';
import { widgets as w, model as m, ui, db, api } from 'slingr';
import { resetPasswordAction } from './resetPassword';

const userCompactDetailsModel = z.object({
    picture: z.string(),
    user: userSchema
});

type UserCompactDetailsModel = z.infer<typeof userCompactDetailsModel>;

const userCompactDetailsView = ui.viewForObject<UserCompactDetailsModel>({
    name: 'User Details',
    model: userCompactDetailsModel,
    layout: {
        type: 'vertical',
        widgets: [
            w.columns([
                //w.formField().field('picture').label('Picture').widget(w.imageWidget()),
                w.imageWidget((model: UserCompactDetailsModel) => model.picture),
                w.defaultWidget().field('user').field('fullName'),
            ]),
            w.defaultWidget().field('user').field('email'),
            w.defaultWidget().field('user').field('notes'),
            w.toolbarWidget().action(resetPasswordAction)
        ]
    },
    toolbar: {}
});

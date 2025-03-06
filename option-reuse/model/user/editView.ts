import { z } from 'zod';
import { User, userSchema } from 'user';
import { widgets as w, model as m, ui, db, api } from 'slingr';

const userCompactDetailsView = ui.simpleViewForObject<User>({
    name: 'User Edit',
    model: userSchema,
    managed: true,
    toolbar: {
        actionsToInclude: 'all'
    }
});

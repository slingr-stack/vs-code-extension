import { defaultUserRelationshipWidgets, User, userRepository, userSchema } from '../user/user';
import { Task } from './task.schema';
import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    ui, mongo, api, concurrency} from 'slingr';

export const startTaskSchema = m.schema({
    assignees: t.array({
        required: true,
        items: t.relationship<User>({
            defaultValue: (task: Task, startTask: StartTask) => {
                return task.assignees;
            }
        })
    })
});

type StartTask = m.infer<typeof startTaskSchema>;

ui.defaultUiForSchema<StartTask>({
    assignees: ui.fields.relationshipArray<User>({
        label: 'Assignees'
    })
});

export const startTaskAction = m.recordAction<Task, StartTask>({
    precondition: (task: Task) => {
        return task.status == 'open';
    },
    script: (task: Task, params: StartTask) => {
        userRepository.lock(task).then((task: Task) => {
            task.status = 'inProgress';
            task.assignees = params.assignees;
            userRepository.save(task);
        });
    }
});

api.addAction(startTaskAction);

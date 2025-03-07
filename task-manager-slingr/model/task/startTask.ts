import { defaultUserRelationshipWidgets, userSchema } from '../user/user';
import { Task } from './task';
import { 
    model as m, 
    types as t, 
    validators as v, 
    widgets as w, 
    ui, mongo, api, concurrency} from 'slingr';

export const startTaskSchema = m.schema({
    assignee: t.relationship({
        target: userSchema,
        required: m.required.always,
        defaultValue: (task: Task, startTask: StartTask) => {
            return task.assignee;
        }
    })
});

type StartTask = m.infer<typeof startTaskSchema>;

ui.defaultUiForSchema<StartTask>({
    assignee: {
        label: 'Assignee',
        dataWidget: defaultUserRelationshipWidgets
    }
});

export const startTaskAction = m.recordAction<Task, StartTask>({
    precondition: (record: Task) => {
        return record.status == 'open';
    },
    script: (record: Task, params: StartTask) => {
        concurrency.lock(record).then((record: Task) => {
            record.status = 'inProgress';
            record.assignee = params.assignee;
            mongo.save(record);    
        });
    }
});

api.addAction(startTaskAction);

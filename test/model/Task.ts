import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { Choice, Text } from "@/model/types";

export enum TaskStatus {
    ToDo = 'toDo',
    InProgress = 'inProgress',
    Done = 'done'
}

export enum Priority {
    Low = 1,
    Medium = 2,
    High = 3
}

@Model({
    docs: "Represents a task",
})
export class Task extends BaseModel {
    @Field({
        required: true,
    })
    @Text({
        minLength: 1,
        maxLength: 100,
    })
    title!: string;

    @Field({})
    @Choice()
    status: TaskStatus = TaskStatus.ToDo;

    @Field({})
    @Choice()
    priority: Priority = Priority.Medium;
}

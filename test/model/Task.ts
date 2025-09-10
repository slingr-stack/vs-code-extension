import { Field } from "../../src/model/Field";
import { Model } from "../../src/model/Model";
import { BaseModel } from "../../src/model/BaseModel";
import { Choice, Text, Relationship, HTML } from "../../src/model/types";
import { Project } from "./Project";

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

    @Field({required: true})
    @Choice()
    status: TaskStatus = TaskStatus.ToDo;

    @Field({required: true})
    @Choice()
    priority: Priority = Priority.Medium;

    @Field({
        required: false,
    })
    @Relationship({
        type: 'reference'
    })
    project!: Project;

    @Field({
        required: false
    })
    @HTML()
    notes!: string[];

    @Field({
        required: false
    })
    @Text()
    sponsors!: string[];
}

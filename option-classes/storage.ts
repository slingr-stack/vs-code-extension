import { Field } from "./backend";

export class MongoRecord {
    @Field({
        type: 'id'
    })
    id: string;
}
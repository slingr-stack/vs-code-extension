import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { Text } from "@/model/types";

@Model({
    docs: "Represents a customer",
})
export class Customer extends BaseModel {
    @Field({
        required: true,
    })
    @Text({
        minLength: 1,
        maxLength: 100,
    })
    name!: string;

    @Field({
        required: false,
    })
    @Text()
    email!: string;
}

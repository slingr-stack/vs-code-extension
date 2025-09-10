import { BaseModel, Field, Model, Text } from "../../index";

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

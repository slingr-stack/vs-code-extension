import { Field, Model, BaseModel, Number, Integer } from "../../src";

@Model({
    docs: "A model for testing number and integer validations",
})
export class NumberIntegerModel extends BaseModel {
    @Field({})
    @Number({
        min: 10.5,
        max: 100.5,
    })
    decimalNumber!: number;

    @Field({})
    @Number({
        positive: true,
    })
    positiveNumber!: number;

    @Field({})
    @Number({
        negative: true,
    })
    negativeNumber!: number;

    @Field({})
    @Integer({
        min: 0,
        max: 100,
    })
    quantity!: number;

    @Field({})
    @Integer({
        positive: true,
    })
    positiveInteger!: number;

    @Field({})
    @Integer({
        negative: true,
    })
    negativeInteger!: number;
}
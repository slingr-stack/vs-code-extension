import { BaseModel } from "@/model/BaseModel";
import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { Decimal } from "@/model/types/Decimal";

@Model(
    {
        docs: 'Represents a product for testing'
    }
)
@Model()
export class Product extends BaseModel {
    @Field({ required: true })
    name!: string;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfToEven', // "Bankers Rounding"
        positive: true,
        min: '0.01',
        max: '1000.00'
    })
    price!: Decimal;

    @Field({})
    @Decimal({
        decimals: 4,
        roundingType: 'Error'
    })
    interestRate!: Decimal;
}
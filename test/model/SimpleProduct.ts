import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { Decimal } from "@/model/types/Decimal";

@Model({
    docs: "Represents a product",
})
export class SimpleProduct extends BaseModel {
    @Field({
    })
    name!: string;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'truncate',
        min: '0.01',
        max: '1000.00',
        positive: true,
    })
    priceTruncate!: Decimal;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfToEven',
    })
    priceHalfToEven!: Decimal;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundAwayFromZero',
    })
    priceHalfToEvenRoundAwayFromZero!: Decimal;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfTowardsZero',
    })
    priceHalfToEvenRoundHalfTowardsZero!: Decimal;

}

import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { Decimal } from "@/model/types/Decimal";
import { Money } from "@/model/types/Money";

@Model({
    docs: "Represents a product",
})
export class SimpleProduct extends BaseModel {
    @Field({
        required: true,
    })
    name!: string;

    @Field({
    })
    @Decimal({
        decimals: 2,
        roundingType: 'truncate',
        min: '0.01',
        max: '1000.00',
        positive: true,
    })
    priceTruncate!: Decimal;

    @Field({
    })
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfToEven', 
    })
    priceRound!: Decimal;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfToEven',
        negative: true
    })
    priceNegative!: Decimal;

    @Field({})
    @Money({
        decimals: 2,
        roundingType: 'roundHalfToEven',
        positive: true,
        min: '0.01',
        max: '1000.00'
    })
    priceMoney!: Money;
}
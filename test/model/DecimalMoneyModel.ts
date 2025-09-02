import { Field, Model, BaseModel, Money, Decimal } from '../../index';

@Model({
    docs: "Represents a product",
})
export class DecimalMoneyModel extends BaseModel {
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
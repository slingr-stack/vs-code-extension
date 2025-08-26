import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { Decimal } from "@/model/types/Decimal";

@Model({
    docs: "Represents a product",
})
export class Product extends BaseModel {
    @Field({
        required: true,
    })
    name!: string;

    @Field({
        required: true,
    })
    description!: string;

    @Field({
        required: true,
    })
    price!: number;

    @Field({
        required: true,
    })
    quantity!: number;

    @Field({
        required: true,
        calculation: "manual",
    })
    get total(): number {
        return this.quantity * this.price;
    }

    @Field({
        required: true,
    })
    get stringifyDoublePrice(): string {
        return JSON.stringify({ double: this.doublePrice });
    }

    @Field({
        required: true,
    })
    get doublePrice(): number {
        return this.price * 2;
    }

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'roundHalfToEven', // "Bankers Rounding"
        positive: true,
        min: '0.01',
        max: '1000.00'
    })
    interestRate!: Decimal;
}

import { BaseModel, Field, Model } from "../../index";

@Model({
    docs: "Represents a line item in an order",
})
export class LineItem extends BaseModel {
    @Field({
        required: true,
    })
    price!: number;

    @Field({
        required: true,
    })
    quantity!: number;

    @Field({
        required: false,
        calculation: 'manual'
    })
    get total(): number {
        return this.price * this.quantity;
    }
}

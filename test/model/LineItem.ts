import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";

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

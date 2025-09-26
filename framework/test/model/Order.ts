import { BaseModel, Field, Model, Relationship, DateTime } from "../../index";
import { Customer } from "./Customer";
import { LineItem } from "./LineItem";

@Model({
    docs: "Represents an order with customer and line items",
})
export class Order extends BaseModel {
    @Field({
        required: true,
    })
    @Relationship({
        type: 'reference'
    })
    customer!: Customer;

    @Field({
        required: true,
    })
    @DateTime()
    date!: Date;

    @Field({
        required: false,
    })
    @Relationship({
        type: 'composition',
        elementType: () => LineItem
    })
    lineItems!: LineItem[];
}

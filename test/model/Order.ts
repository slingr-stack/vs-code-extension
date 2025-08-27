import { Field } from "@/model/Field";
import { Model } from "@/model/Model";
import { BaseModel } from "@/model/BaseModel";
import { DateTime, Relationship } from "@/model/types";
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

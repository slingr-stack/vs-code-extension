import { Field } from "../../src/model/Field";
import { Model } from "../../src/model/Model";
import { BaseModel } from "../../src/model/BaseModel";

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
}

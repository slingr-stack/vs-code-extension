import { PersistentModel, Field, Model, Text, Embedded } from "../../index";
import { Address } from "./Address";

@Model({
  docs: "Represents a customer with embedded address",
})
export class CustomerWithAddress extends PersistentModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 100,
  })
  name!: string;

  @Embedded({
    docs: "Customer's address"
  })
  address!: Address;
}

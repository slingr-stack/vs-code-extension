import { BaseModel, Field, Model, Text, Embedded } from "../../index";

@Model({
  docs: "Represents an address",
})
export class Address extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 1,
    maxLength: 100,
  })
  addressLine1!: string;

  @Field()
  @Text({
    maxLength: 100,
  })
  addressLine2!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 1,
    maxLength: 50,
  })
  city!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 5,
    maxLength: 10,
  })
  zipCode!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 50,
  })
  state!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 50,
  })
  country!: string;
}

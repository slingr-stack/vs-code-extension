import { Field, Model, Text, Email } from "../../index";
import { PersonBase } from "./PersonBase";

@Model({
  docs: "Contact person with email and phone",
})
export class Contact extends PersonBase {
  @Field({
    required: true,
  })
  @Email()
  email!: string;

  @Field()
  @Text({
    minLength: 10,
    maxLength: 20,
  })
  phoneNumber!: string;
}

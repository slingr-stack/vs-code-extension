import { Field } from "../../src/model/Field";
import { Model } from "../../src/model/Model";
import { BaseModel } from "../../src/model/BaseModel";
import { IsEmail } from "class-validator";

@Model({
  docs: "Represents a person",
})
export class Person extends BaseModel {
  @Field({
    required: true,
  })
  firstName!: string;

  @Field({
    required: true,
  })
  lastName!: string;

  @Field({})
  @IsEmail()
  email!: string;

  @Field({
    validation: (_: number, person: Person) => {
      let errors = [];
      if (person.age < 0 || person.age > 120) {
        errors.push({
          constraint: "invalidAge",
          message: "Age must be between 0 and 120",
        });
      }
      return errors;
    },
    required: true,
  })
  age!: number;

  @Field({
    required: (person: Person) => {
      return (person.age < 18);
    },
  })
  parentEmail!: string;

  @Field({
    available: false, // This field should be excluded from JSON operations
    docs: "Internal identifier not exposed in JSON"
  })
  internalId!: string;

  @Field({
    required: false,
    available: (person: Person) => {
      return person.age >= 18;
    },
  })
  phoneNumber!: string;
}

import { Field } from "../../model/Field";
import { Model } from "../../model/Model";
import { BaseModel } from "../../model/BaseModel";
import { IsEmail } from "class-validator";
import { Number, NumberOptions } from "../../model/types/Number";

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
          code: "invalidAge",
          message: "Age must be between 0 and 120",
        });
      }
      return errors;
    },
    required: true,
  })
  age!: number;

  @Field({})
  @Number({
    min: 1900,
    max: new Date().getFullYear(),
  })
  birthYear!: number;

  @Field({
    required: (person: Person) => {
      return (person.age < 18);
    },
  })
  parentEmail!: string;

  @Field({})
  @Number({
    positive: true,
  })
  height!: number;
}

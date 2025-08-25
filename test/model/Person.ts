import { Field } from "../../src/model/Field";
import { Model } from "../../src/model/Model";
import { BaseModel } from "../../src/model/BaseModel";
import { IsEmail } from "class-validator";
import { Text, Email, HTML } from "../../src/model/types/Text";

@Model({
  docs: "Represents a person",
})
export class Person extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 30,
    regex: /^[a-zA-Z]+$/,
    regexMessage: "firstName must contain only letters",
  })
  firstName!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 30,
    regex: /^[a-zA-Z]+$/,
    regexMessage: "lastName must contain only letters",
  })
  lastName!: string;

  @Field({})
  @Email()
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
  @Email()
  parentEmail!: string;

  @Field({})
  @HTML()
  additionalInfo!: string;

}

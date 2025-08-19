import { Field } from "../framework/decorators/FieldDecorator";
import { Model } from "../framework/decorators/ModelDecorator";
import { BaseModel } from "../framework/model/Model";

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

  @Field({
    validation: (value: string, person: Person) => {
      const errors = [];
      if (person.age < 18 && (!value || value.trim() === "")) {
        errors.push({
          code: "requiredParentEmail",
          message: "Parent email is required if age is under 18",
        });
      }
      return errors;
    },
  })
  parentEmail!: string;
}

import { Field, Model, Text, Reference } from "../../index";
import { PersonBase } from "./PersonBase";

// Placeholder for Department model - simplified for testing
class Department {
  id!: string;
  name!: string;
}

@Model({
  docs: "Employee with SSN and department reference",
})
export class Employee extends PersonBase {
  @Field({
    required: true,
  })
  @Text({
    minLength: 9,
    maxLength: 11,
  })
  ssn!: string;

  // Note: Reference decorator would be used here in full implementation
  @Field()
  @Text()
  departmentId!: string;
}

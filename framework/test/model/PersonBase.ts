import { PersistentModel, Field, Model, Text } from "../../index";

@Model({
  docs: "Abstract base class for person entities",
})
export abstract class PersonBase extends PersistentModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 50,
  })
  firstName!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 50,
  })
  lastName!: string;

  @Field()
  @Text({
    minLength: 2,
    maxLength: 100,
  })
  fullName!: string;
}

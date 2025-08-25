import { Field } from "../../src/model/Field";
import { Model } from "../../src/model/Model";
import { BaseModel } from "../../src/model/BaseModel";
import { Text } from "../../src/model/types/Text";
import { DateTime, DateTimeRange, DateTimeRangeClass } from "../../src/model/types/DateTime";

@Model({
  docs: "Represents a project with date-related fields",
})
export class Project extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 100,
  })
  name!: string;


  @Field({
    required: true,
  })
  @DateTime({
    min: new Date('2020-01-01'),
    max: new Date('2030-12-31'),
  })
  startDate!: Date;


  @Field({
    required: false,
  })
  @DateTime()
  endDate?: Date;


  @Field({
    required: true,
  })
  @DateTimeRange({
    openStart: false,
    openEnd: false,
  })
  activeRange!: DateTimeRangeClass;


  @Field({
    required: false,
  })
  @DateTimeRange({
    openStart: true,
    openEnd: true,
  })
  flexibleRange?: DateTimeRangeClass;


  @Field({
    required: false,
  })
  @Text({
    maxLength: 500,
  })
  description!: string;
}

import { BaseModel, Boolean, Email, Field, HTML, Model, Text } from "slingr-framework";

@Model({
    docs: "Represents a person",
})
export class Person extends BaseModel {
    @Field({})
    @HTML()
    additionalInfo!: string;
@Field({
        required: true,
        validation(_: number, person: Person) {
            const errors = [];
            if (person.age < 0 || person.age > 120) {
                errors.push({
                    constraint: "invalidAge",
                    message: "Age must be between 0 and 120",
                });
            }

            return errors;
        },
    })
    age!: number;
@Email()
    @Field({})
    email!: string;
@Field({
        required: true,
    })
    @Text({
        maxLength: 30,
        minLength: 2,
        regex: /^[a-zA-Z]+$/,
        regexMessage: "firstName must contain only letters",
    })
    firstName!: string;
@Field({
        available: false, // This field should be excluded from JSON operations
        docs: "Internal identifier not exposed in JSON"
    })
    internalId!: string;
@Boolean()
    @Field({
        required: false,
    })
    isActive!: boolean;
@Field({
        required: true,
    })
    @Text({
        maxLength: 30,
        minLength: 2,
        regex: /^[a-zA-Z]+$/,
        regexMessage: "lastName must contain only letters",
    })
    lastName!: string;
@Email()
    @Field({
        required(person: Person) {
            return (person.age < 18);
        },
    })
    parentEmail!: string;
@Field({
        available(person: Person) {
            return person.age >= 18;
        },
        required: false,
    })
    phoneNumber!: string;

}
import { Person } from "./model/Person";
import type { ValidationError } from "class-validator";

/**
 * Converts an array of class-validator ValidationError objects into a stable, plain summary.
 *
 * @param {ValidationError[]} errors - Array of ValidationError objects from class-validator.
 * @returns {Array<{field: string, codes: string[], messages: string[]}>} An array of summary objects with field, codes, and messages.
 */
function summarizeErrors(errors: ValidationError[]) {
  return errors.map((e) => ({
    field: e.property,
    codes: e.constraints ? Object.keys(e.constraints) : [],
    messages: e.constraints ? Object.values(e.constraints) : [],
  }));
}

describe("Person Model Validation", () => {
  it("should pass validation for a valid person", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });

  it("should fail validation when required fields are missing", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    // Missing lastName, and email

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "lastName", codes: ["isNotEmpty"], messages: ["lastName should not be empty"] },
      { field: "age", codes: ["isNotEmpty"], messages: ["age should not be empty"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should not fail validation when mail is missing", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.age = 30;
    // Missing email

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });

  it("should fail validation for invalid age", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 130; // Invalid age

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "age", codes: ["invalidAge"], messages: ["Age must be between 0 and 120"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should pass validation without parent email", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 18; // Valid age
    // Missing parent email

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });

  it("should fail validation without parent email", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 17; // Invalid age
    // Missing parent email

    const errors = await invalidUser.validate();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should fail validation with incorrect email format", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "email", codes: ["isEmail"], messages: ["email must be an email"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with too short first name", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "J";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "firstName", codes: ["minLength"], messages: ["firstName must be longer than or equal to 2 characters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with too short last name", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "D";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "lastName", codes: ["minLength"], messages: ["lastName must be longer than or equal to 2 characters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with too long first name", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "A".repeat(31); // Too long
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "firstName", codes: ["maxLength"], messages: ["firstName must be shorter than or equal to 30 characters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with too long last name", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "D".repeat(31); // Too long
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "lastName", codes: ["maxLength"], messages: ["lastName must be shorter than or equal to 30 characters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with invalid first name characters", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John123";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "firstName", codes: ["matches"], messages: ["firstName must contain only letters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail validation with invalid last name characters", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe123";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "lastName", codes: ["matches"], messages: ["lastName must contain only letters"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should pass with valid HTML", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;
    validUser.additionalInfo = "<p>This is a valid HTML string.</p>";

    const errors = await validUser.validate();
    const summary = summarizeErrors(errors);
    expect(summary).toStrictEqual([]);
  });
});

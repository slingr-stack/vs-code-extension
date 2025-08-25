
import type { ValidationError } from "class-validator";
import { Person } from "./model/Person";

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

  it("should fail validation for invalid height", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;
    invalidUser.height = -1; // Invalid height

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "height", codes: ["isPositive"], messages: ["height must be a positive number"] },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should fail for invalid birth year", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 30;
    invalidUser.height = 180;
    invalidUser.birthYear = 1800; // Invalid birth year

    const errors = await invalidUser.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "birthYear", codes: ["min"], messages: ["birthYear must not be less than 1900"] },
    ];
    expect(summary).toStrictEqual(expected);
  });
});

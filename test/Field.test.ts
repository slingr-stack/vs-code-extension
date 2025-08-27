import { App } from "./model/App";
import { Person } from "./model/Person";
import { Product } from "./model/Product";

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
      {
        field: "lastName",
        codes: ["minLength", "maxLength", "matches", "isNotEmpty"],
        messages: [
          "lastName must be longer than or equal to 2 characters",
          "lastName must be shorter than or equal to 30 characters",
          "lastName must contain only letters",
          "lastName should not be empty"
        ],
      },
      {
        field: "age",
        codes: ["isNotEmpty"],
        messages: ["age should not be empty"],
      },
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
      {
        field: "age",
        codes: ["invalidAge"],
        messages: ["Age must be between 0 and 120"],
      },
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

  it("should pass validation with Boolean field set to true", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;
    validUser.isActive = true;

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });

  it("should pass validation with Boolean field set to false", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;
    validUser.isActive = false;

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });

  it("should pass validation with Boolean field undefined (optional)", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;
    // isActive is undefined (optional field)

    const errors = await validUser.validate();
    expect(errors).toStrictEqual([]);
  });
});

describe("Product Model Validation", () => {
  it("should not calculate total if calculation is not called", async () => {
    const product = new Product();
    product.name = "Test Product";
    product.price = 100;
    product.quantity = 2;

    const total = product.total;
    expect(total).toBe(undefined);
  });

  it("should calculate total when calculation is called", async () => {
    const product = new Product();
    product.name = "Test Product";
    product.price = 100;
    product.quantity = 2;

    product.calculate();
    const total = product.total;
    expect(total).toBe(200);
  });

  it("should output double the price when requested", async () => {
    const product = new Product();
    product.name = "Test Product";
    product.price = 100;
    product.quantity = 2;

    const doublePrice = product.doublePrice;
    expect(doublePrice).toBe(200);
  });

  it("should output the stringified double when requested", async () => {
    const product = new Product();
    product.name = "Test Product";
    product.price = 100;
    product.quantity = 2;

    const stringifyDoublePrice = product.stringifyDoublePrice;
    expect(stringifyDoublePrice).toBe(JSON.stringify({ double: 200 }));
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

describe("App Model Validation", () => {
  it("should return isNotEmpty and other errors for missing name", async () => {
    const invalidApp = new App();
    invalidApp.version = "01.00.00";
    invalidApp.description = "A sample application";
    invalidApp.author = "JohnDoe";

    const errors = await invalidApp.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { 
        field: "name", 
        codes: ["minLength", "maxLength", "matches", "isNotEmpty"], 
        messages: [
          "name must be longer than or equal to 4 characters",
          "name must be shorter than or equal to 20 characters",
          "Name must contain only letters and dots (no underscores, no consecutive dots, no dot at start/end)",
          "name should not be empty"
        ] 
      },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should return errors for invalid version length and format", async () => {
    const invalidApp = new App();
    invalidApp.name = "MyApp";
    invalidApp.version = "1.0"; // Invalid format
    invalidApp.description = "A sample application";
    invalidApp.author = "JohnDoe";

    const errors = await invalidApp.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "version", codes: ["minLength", "matches"], messages: [
          "version must be longer than or equal to 5 characters",
          "Version must be in the format AA.BB.CC, where AA, BB, and CC are two-digit numbers"
        ] 
      },
    ];
    expect(summary).toStrictEqual(expected);
  });

  it("should not return error for non-required but empty fields", async () => {
    const validApp = new App();
    validApp.name = "MyApp";
    validApp.version = "01.00.00";
    validApp.description = "A sample application";
    // validApp.author = undefined;

    const errors = await validApp.validate();
    const summary = summarizeErrors(errors);
    expect(summary).toStrictEqual([]);
  });

  it("should return errors for invalid author name", async () => {
    const invalidApp = new App();
    invalidApp.name = "MyApp";
    invalidApp.version = "01.00.00";
    invalidApp.description = "A sample application";
    invalidApp.author = "JohnDoe123"; // Invalid author name

    const errors = await invalidApp.validate();
    const summary = summarizeErrors(errors);
    const expected = [
      { field: "author", codes: ["matches"], messages: [
          "Author must contain only letters, numbers, dots, underscores, and hyphens"
        ] 
      },
    ];
    expect(summary).toStrictEqual(expected);
  });
});
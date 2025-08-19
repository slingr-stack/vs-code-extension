import { Person } from "../model/Person";

describe("Person Model Validation", () => {
  it("should pass validation for a valid person", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 30;

    const errors = await validUser.validate();
    expect(errors.length).toBe(0);
  });

  it("should fail validation when required fields are missing", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    // Missing lastName, and email

    const errors = await invalidUser.validate();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should not fail validation when mail is missing", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.age = 30;
    // Missing email

    const errors = await validUser.validate();
    expect(errors.length).toBe(0);
  });

  it("should fail validation for invalid age", async () => {
    const invalidUser = new Person();
    invalidUser.firstName = "John";
    invalidUser.lastName = "Doe";
    invalidUser.email = "john.doe@example.com";
    invalidUser.age = 130; // Invalid age

    const errors = await invalidUser.validate();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should pass validation without parent email", async () => {
    const validUser = new Person();
    validUser.firstName = "John";
    validUser.lastName = "Doe";
    validUser.email = "john.doe@example.com";
    validUser.age = 18; // Valid age
    // Missing parent email

    const errors = await validUser.validate();
    expect(errors.length).toBe(0);
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

});

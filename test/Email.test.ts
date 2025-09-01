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

describe("Email Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid email format", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation with invalid email format", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example"; // Invalid email
      person.age = 30;

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      const expected = [
        { field: "email", codes: ["isEmail"], messages: ["email must be an email"] },
      ];
      expect(summary).toStrictEqual(expected);
    });
  });

  describe("required-tests", () => {
    it("should pass validation when optional email is missing", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.age = 30;
      // Missing optional email

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should require parentEmail when age is under 18", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 17; // Under 18
      // Missing parentEmail

      const errors = await person.validate();
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should not require parentEmail when age is 18 or over", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 18; // 18 or over
      // Missing parentEmail

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should include email fields in JSON output", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const json = person.toJSON();
      expect(json.email).toBe("john.doe@example.com");
    });

    it("should include parent email when set", () => {
      const person = new Person();
      person.firstName = "Young";
      person.lastName = "Person";
      person.age = 16;
      person.parentEmail = "parent@example.com";

      const json = person.toJSON();
      expect(json.parentEmail).toBe("parent@example.com");
    });

    it("should handle undefined email values", () => {
      const person = new Person();
      person.firstName = "Jane";
      person.lastName = "Smith";
      person.age = 25;
      // email not set

      const json = person.toJSON();
      expect(json).not.toHaveProperty("email");
    });
  });
});

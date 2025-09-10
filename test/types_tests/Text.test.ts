import { App } from "../model/App";
import { Person } from "../model/Person";

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

describe("Text Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid text values", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation with too short text", async () => {
      const person = new Person();
      person.firstName = "J"; // Too short
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      const expected = [
        { field: "firstName", codes: ["minLength"], messages: ["firstName must be longer than or equal to 2 characters"] },
      ];
      expect(summary).toStrictEqual(expected);
    });

    it("should fail validation with too long text", async () => {
      const person = new Person();
      person.firstName = "A".repeat(31); // Too long
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      const expected = [
        { field: "firstName", codes: ["maxLength"], messages: ["firstName must be shorter than or equal to 30 characters"] },
      ];
      expect(summary).toStrictEqual(expected);
    });

    it("should fail validation with invalid regex pattern", async () => {
      const person = new Person();
      person.firstName = "John123"; // Contains numbers
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      const expected = [
        { field: "firstName", codes: ["matches"], messages: ["firstName must contain only letters"] },
      ];
      expect(summary).toStrictEqual(expected);
    });

    it("should validate app name with complex regex", async () => {
      const app = new App();
      app.name = "My.App"; // Valid format
      app.version = "01.00.00";
      app.description = "A sample application";

      const errors = await app.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation with invalid app name format", async () => {
      const app = new App();
      app.name = ".InvalidApp"; // Starts with dot
      app.version = "01.00.00";
      app.description = "A sample application";

      const errors = await app.validate();
      const summary = summarizeErrors(errors);
      expect(summary.some(error => error.field === "name" && error.codes.includes("matches"))).toBe(true);
    });

    it("should validate version format correctly", async () => {
      const app = new App();
      app.name = "MyApp";
      app.version = "1.0"; // Invalid format
      app.description = "A sample application";

      const errors = await app.validate();
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

    it("should validate author format correctly", async () => {
      const app = new App();
      app.name = "MyApp";
      app.version = "01.00.00";
      app.description = "A sample application";
      app.author = "JohnDoe123"; // Invalid characters

      const errors = await app.validate();
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

  describe("required-tests", () => {
    it("should fail validation when required text fields are missing", async () => {
      const person = new Person();
      person.firstName = "John";
      // Missing lastName
      person.age = 30;

      const errors = await person.validate();
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
      ];
      expect(summary).toStrictEqual(expected);
    });

    it("should fail validation for missing app name", async () => {
      const app = new App();
      // Missing name
      app.version = "01.00.00";
      app.description = "A sample application";

      const errors = await app.validate();
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

    it("should pass validation when optional text fields are missing", async () => {
      const app = new App();
      app.name = "MyApp";
      app.version = "01.00.00";
      app.description = "A sample application";
      // author is optional

      const errors = await app.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should include text fields in JSON output", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const json = person.toJSON();
      expect(json.firstName).toBe("John");
      expect(json.lastName).toBe("Doe");
    });

    it("should create model from JSON with text fields", () => {
      const jsonData = {
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@example.com",
        age: 28,
      };

      const person = Person.fromJSON(jsonData);
      expect(person.firstName).toBe("Alice");
      expect(person.lastName).toBe("Johnson");
      expect(person instanceof Person).toBe(true);
    });

    it("should maintain text data integrity through round-trip conversion", () => {
      const original = new Person();
      original.firstName = "Test";
      original.lastName = "User";
      original.email = "test@example.com";
      original.age = 29;

      const json = original.toJSON();
      const restored = Person.fromJSON(json);

      expect(restored.firstName).toBe(original.firstName);
      expect(restored.lastName).toBe(original.lastName);
      expect(restored instanceof Person).toBe(true);
    });
  });
});

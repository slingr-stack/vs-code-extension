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

describe("Number Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid number values", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30; // Valid number

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation with custom number validation", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 130; // Invalid age (over 120)

      const errors = await person.validate();
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

    it("should fail validation with negative age", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = -5; // Invalid negative age

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      
      // Find the age-specific error
      const ageError = summary.find(error => error.field === "age");
      expect(ageError).toBeDefined();
      expect(ageError?.codes).toContain("invalidAge");
      expect(ageError?.messages).toContain("Age must be between 0 and 120");
    });
  });

  describe("required-tests", () => {
    it("should fail validation when required number field is missing", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      // Missing age (required)

      const errors = await person.validate();
      const summary = summarizeErrors(errors);
      const expected = [
        {
          field: "age",
          codes: ["isNotEmpty"],
          messages: ["age should not be empty"],
        },
      ];
      expect(summary).toStrictEqual(expected);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should include number fields in JSON output", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;

      const json = person.toJSON();
      expect(json.age).toBe(30);
      expect(typeof json.age).toBe("number");
    });

    it("should handle number type coercion from string in fromJSON", () => {
      const jsonData = {
        firstName: "Bob",
        lastName: "Wilson",
        email: "bob@example.com",
        age: "35", // String that should be converted to number
      };

      const person = Person.fromJSON(jsonData);
      expect(person.age).toBe(35);
      expect(typeof person.age).toBe("number");
    });

    it("should maintain number data integrity through round-trip conversion", () => {
      const original = new Product();
      original.name = "Test Product";
      original.description = "Test Description";
      original.price = 100.50;
      original.quantity = 3;

      const json = original.toJSON();
      const restored = Product.fromJSON(json);

      expect(restored.price).toBe(original.price);
      expect(restored.quantity).toBe(original.quantity);
      expect(typeof restored.price).toBe("number");
      expect(typeof restored.quantity).toBe("number");
    });
  });

  describe("calculation-tests", () => {
    it("should not calculate total if calculation is not called", () => {
      const product = new Product();
      product.name = "Test Product";
      product.description = "Test Description";
      product.price = 100;
      product.quantity = 2;

      const total = product.total;
      expect(total).toBe(undefined);
    });

    it("should calculate total when calculation is called", () => {
      const product = new Product();
      product.name = "Test Product";
      product.description = "Test Description";
      product.price = 100;
      product.quantity = 2;

      product.calculate();
      const total = product.total;
      expect(total).toBe(200);
    });

    it("should calculate double price correctly", () => {
      const product = new Product();
      product.name = "Test Product";
      product.description = "Test Description";
      product.price = 100;
      product.quantity = 2;

      const doublePrice = product.doublePrice;
      expect(doublePrice).toBe(200);
    });

    it("should stringify double price correctly", () => {
      const product = new Product();
      product.name = "Test Product";
      product.description = "Test Description";
      product.price = 100;
      product.quantity = 2;

      const stringifyDoublePrice = product.stringifyDoublePrice;
      expect(stringifyDoublePrice).toBe(JSON.stringify({ double: 200 }));
    });

    it("should handle calculated fields in JSON conversion", () => {
      const product = new Product();
      product.name = "Test Product";
      product.description = "Test Description";
      product.price = 100;
      product.quantity = 2;

      // Calculate the total
      product.calculate();

      const json = product.toJSON();
      
      // Should include calculated field
      expect(json.total).toBe(200);
      expect(json.doublePrice).toBe(200);
      expect(json.stringifyDoublePrice).toBe(JSON.stringify({ double: 200 }));
    });
  });
});

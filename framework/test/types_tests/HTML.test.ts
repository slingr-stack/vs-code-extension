import { Person } from "../model/Person";

describe("HTML Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with valid HTML content", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.additionalInfo = "<p>This is a valid HTML string.</p>";

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation with undefined HTML content", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      // additionalInfo is undefined

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("required-tests", () => {
    it("should pass validation when optional HTML field is missing", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      // additionalInfo is optional

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should include HTML field in JSON output when set", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.additionalInfo = "<p>HTML content</p>";

      const json = person.toJSON();
      expect(json.additionalInfo).toBe("<p>HTML content</p>");
    });

    it("should handle undefined HTML values in JSON", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      // additionalInfo not set

      const json = person.toJSON();
      expect(json).not.toHaveProperty("additionalInfo");
    });
  });
});

import { Person } from "../model/Person";

describe("Boolean Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation with Boolean field set to true", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.isActive = true;

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation with Boolean field set to false", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.isActive = false;

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should pass validation with Boolean field undefined (optional)", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      // isActive is undefined (optional field)

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("required-tests", () => {
    it("should pass validation when optional Boolean field is missing", async () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      // isActive is optional

      const errors = await person.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should include Boolean field in JSON output when set to true", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.isActive = true;

      const json = person.toJSON();
      expect(json.isActive).toBe(true);
    });

    it("should include Boolean field in JSON output when set to false", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.isActive = false;

      const json = person.toJSON();
      expect(json.isActive).toBe(false);
    });

    it("should create model instance from JSON with Boolean field", () => {
      const jsonData = {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@example.com",
        age: 25,
        isActive: true
      };

      const person = Person.fromJSON(jsonData);
      expect(person.isActive).toBe(true);
    });

    it("should handle Boolean field coercion from string", () => {
      const jsonData = {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@example.com",
        age: 25,
        isActive: "true" // String that should be coerced
      };

      const person = Person.fromJSON(jsonData);
      expect(person.isActive).toBe(true);
    });

    it("should store correct metadata for Boolean field", () => {
      const person = new Person();
      const fieldType = Reflect.getMetadata('field:type', person, 'isActive');
      expect(fieldType).toBe('boolean');
    });
  });
});

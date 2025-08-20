import { Person } from "./model/Person";

describe("BaseModel JSON Conversion", () => {
  describe("toJSON", () => {
    it("should convert a model instance to JSON", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john.doe@example.com";
      person.age = 30;
      person.internalId = "secret-123";

      const json = person.toJSON();

      expect(json).toEqual({
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        age: 30,
        // internalId should be excluded because available: false
      });

      // Verify that internalId is not in the JSON
      expect(json).not.toHaveProperty("internalId");
    });

    it("should handle undefined and null values", () => {
      const person = new Person();
      person.firstName = "Jane";
      person.lastName = "Smith";
      person.age = 25;
      // email and parentEmail are not set

      const json = person.toJSON();

      expect(json).toEqual({
        firstName: "Jane",
        lastName: "Smith",
        age: 25,
      });
    });

    it("should include parent email when set", () => {
      const person = new Person();
      person.firstName = "Young";
      person.lastName = "Person";
      person.age = 16;
      person.parentEmail = "parent@example.com";

      const json = person.toJSON();

      expect(json).toEqual({
        firstName: "Young",
        lastName: "Person",
        age: 16,
        parentEmail: "parent@example.com",
      });
    });
  });

  describe("fromJSON", () => {
    it("should create a model instance from JSON", () => {
      const jsonData = {
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@example.com",
        age: 28,
      };

      const person = Person.fromJSON(jsonData);

      expect(person).toBeInstanceOf(Person);
      expect(person.firstName).toBe("Alice");
      expect(person.lastName).toBe("Johnson");
      expect(person.email).toBe("alice@example.com");
      expect(person.age).toBe(28);
    });

    it("should enable type coercion for compatible values", () => {
      const jsonData = {
        firstName: "Bob",
        lastName: "Wilson",
        email: "bob@example.com",
        age: "35", // String that should be converted to number
      };

      const person = Person.fromJSON(jsonData);

      expect(person).toBeInstanceOf(Person);
      expect(person.firstName).toBe("Bob");
      expect(person.lastName).toBe("Wilson");
      expect(person.email).toBe("bob@example.com");
      expect(person.age).toBe(35); // Should be converted to number
      expect(typeof person.age).toBe("number");
    });

    it("should ignore fields marked as unavailable", () => {
      const jsonData = {
        firstName: "Charlie",
        lastName: "Brown",
        email: "charlie@example.com",
        age: 22,
        internalId: "should-be-ignored", // This should be ignored
      };

      const person = Person.fromJSON(jsonData);

      expect(person).toBeInstanceOf(Person);
      expect(person.firstName).toBe("Charlie");
      expect(person.lastName).toBe("Brown");
      expect(person.email).toBe("charlie@example.com");
      expect(person.age).toBe(22);
      
      // internalId should not be set from JSON
      expect(person.internalId).toBeUndefined();
    });

    it("should handle missing optional fields", () => {
      const jsonData = {
        firstName: "David",
        lastName: "Miller",
        age: 40,
        // email and parentEmail are missing
      };

      const person = Person.fromJSON(jsonData);

      expect(person).toBeInstanceOf(Person);
      expect(person.firstName).toBe("David");
      expect(person.lastName).toBe("Miller");
      expect(person.age).toBe(40);
      expect(person.email).toBeUndefined();
      expect(person.parentEmail).toBeUndefined();
    });

    it("should handle extra fields not defined in the model", () => {
      const jsonData = {
        firstName: "Eve",
        lastName: "Davis",
        age: 33,
        extraField: "should-be-ignored",
        anotherExtra: 123,
      };

      const person = Person.fromJSON(jsonData);

      expect(person).toBeInstanceOf(Person);
      expect(person.firstName).toBe("Eve");
      expect(person.lastName).toBe("Davis");
      expect(person.age).toBe(33);
      
      // Extra fields should be ignored
      expect((person as any).extraField).toBeUndefined();
      expect((person as any).anotherExtra).toBeUndefined();
    });
  });

  describe("round-trip conversion", () => {
    it("should maintain data integrity through toJSON and fromJSON", () => {
      // Create original instance
      const original = new Person();
      original.firstName = "Test";
      original.lastName = "User";
      original.email = "test@example.com";
      original.age = 29;
      original.parentEmail = "parent@example.com";
      original.internalId = "internal-secret";

      // Convert to JSON
      const json = original.toJSON();

      // Convert back to instance
      const restored = Person.fromJSON(json);

      // Check that all available fields are preserved
      expect(restored.firstName).toBe(original.firstName);
      expect(restored.lastName).toBe(original.lastName);
      expect(restored.email).toBe(original.email);
      expect(restored.age).toBe(original.age);
      expect(restored.parentEmail).toBe(original.parentEmail);
      
      // Check that unavailable fields are not restored
      expect(restored.internalId).toBeUndefined();
      
      // Verify it's a proper instance
      expect(restored).toBeInstanceOf(Person);
    });
  });

  describe("validation after JSON conversion", () => {
    it("should validate correctly after fromJSON", async () => {
      const jsonData = {
        firstName: "Valid",
        lastName: "Person",
        email: "valid@example.com",
        age: 25,
      };

      const person = Person.fromJSON(jsonData);
      const errors = await person.validate();

      expect(errors).toStrictEqual([]);
    });

    it("should fail validation if required fields are missing after fromJSON", async () => {
      const jsonData = {
        firstName: "Incomplete",
        // lastName is missing
        email: "incomplete@example.com",
        age: 25,
      };

      const person = Person.fromJSON(jsonData);
      const errors = await person.validate();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === "lastName")).toBe(true);
    });

    it("should fail validation with invalid data after fromJSON", async () => {
      const jsonData = {
        firstName: "Invalid",
        lastName: "Person",
        email: "invalid@example.com",
        age: 150, // Invalid age
      };

      const person = Person.fromJSON(jsonData);
      const errors = await person.validate();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === "age")).toBe(true);
    });
  });
});

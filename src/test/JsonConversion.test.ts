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

    it("should exclude phoneNumber when age is under 18", () => {
      const person = new Person();
      person.firstName = "Young";
      person.lastName = "Person";
      person.age = 16;
      person.phoneNumber = "123-456-7890";

      const json = person.toJSON();

      expect(json).toEqual({
        firstName: "Young",
        lastName: "Person",
        age: 16,
        // phoneNumber should be excluded because available: (person: Person) => person.age >= 18
      });

      // Verify that phoneNumber is not in the JSON
      expect(json).not.toHaveProperty("phoneNumber");
    });

    it("should include phoneNumber when age is 18 or older", () => {
      const person = new Person();
      person.firstName = "Adult";
      person.lastName = "Person";
      person.age = 18;
      person.phoneNumber = "123-456-7890";

      const json = person.toJSON();

      expect(json).toEqual({
        firstName: "Adult",
        lastName: "Person",
        age: 18,
        phoneNumber: "123-456-7890",
      });
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

  describe("@Exclude and @Expose behavior", () => {
    it("should exclude fields marked with available: false (@Exclude applied)", () => {
      const person = new Person();
      person.firstName = "John";
      person.lastName = "Doe";
      person.email = "john@example.com";
      person.age = 30;
      person.internalId = "secret-internal-123";

      const json = person.toJSON();

      // Should include exposed fields
      expect(json).toHaveProperty("firstName", "John");
      expect(json).toHaveProperty("lastName", "Doe");
      expect(json).toHaveProperty("email", "john@example.com");
      expect(json).toHaveProperty("age", 30);

      // Should exclude field marked with available: false
      expect(json).not.toHaveProperty("internalId");
      expect(Object.keys(json)).not.toContain("internalId");
    });

    it("should expose fields marked with available: true (@Expose applied)", () => {
      const person = new Person();
      person.firstName = "Jane";
      person.lastName = "Smith";
      person.email = "jane@example.com";
      person.age = 25;

      const json = person.toJSON();

      // All these fields should be exposed (available: true or default)
      expect(json).toHaveProperty("firstName", "Jane");
      expect(json).toHaveProperty("lastName", "Smith");
      expect(json).toHaveProperty("email", "jane@example.com");
      expect(json).toHaveProperty("age", 25);
    });

    it("should conditionally expose fields based on function (@Transform + @Expose applied)", () => {
      // Test case 1: Adult should have phoneNumber exposed
      const adult = new Person();
      adult.firstName = "Adult";
      adult.lastName = "Person";
      adult.email = "adult@example.com";
      adult.age = 25; // >= 18
      adult.phoneNumber = "555-1234";

      const adultJson = adult.toJSON();
      expect(adultJson).toHaveProperty("phoneNumber", "555-1234");

      // Test case 2: Minor should NOT have phoneNumber exposed
      const minor = new Person();
      minor.firstName = "Young";
      minor.lastName = "Person";
      minor.email = "young@example.com";
      minor.age = 16; // < 18
      minor.phoneNumber = "555-5678";

      const minorJson = minor.toJSON();
      expect(minorJson).not.toHaveProperty("phoneNumber");
      expect(Object.keys(minorJson)).not.toContain("phoneNumber");
    });

    it("should handle multiple conditional fields correctly", () => {
      // Test with adult (phoneNumber should be available)
      const adult = new Person();
      adult.firstName = "Test";
      adult.lastName = "Adult";
      adult.age = 20;
      adult.phoneNumber = "555-0000";
      adult.internalId = "should-never-appear";

      const adultJson = adult.toJSON();
      
      expect(adultJson).toEqual({
        firstName: "Test",
        lastName: "Adult",
        age: 20,
        phoneNumber: "555-0000"
      });

      // Test with minor (phoneNumber should NOT be available)
      const minor = new Person();
      minor.firstName = "Test";
      minor.lastName = "Minor";
      minor.age = 15;
      minor.phoneNumber = "555-1111";
      minor.internalId = "should-never-appear";

      const minorJson = minor.toJSON();
      
      expect(minorJson).toEqual({
        firstName: "Test",
        lastName: "Minor",
        age: 15
      });
    });

    it("should handle edge cases in conditional availability", () => {
      // Test exactly at the boundary (age = 18)
      const eighteenYearOld = new Person();
      eighteenYearOld.firstName = "Boundary";
      eighteenYearOld.lastName = "Case";
      eighteenYearOld.age = 18; // exactly 18
      eighteenYearOld.phoneNumber = "555-1818";

      const json = eighteenYearOld.toJSON();
      
      // phoneNumber should be available since age >= 18
      expect(json).toHaveProperty("phoneNumber", "555-1818");
    });

    it("should handle undefined values in conditionally available fields", () => {
      const person = new Person();
      person.firstName = "Test";
      person.lastName = "Person";
      person.age = 25;
      // phoneNumber is undefined but person is adult

      const json = person.toJSON();
      
      // phoneNumber should NOT be in the JSON if it's undefined, 
      // even though the condition allows it (this is the expected behavior)
      expect(json).not.toHaveProperty("phoneNumber");
      expect(json).toEqual({
        firstName: "Test",
        lastName: "Person",
        age: 25
      });
    });
  });

  describe("fromJSON with @Exclude and @Expose behavior", () => {
    it("should ignore excluded fields in fromJSON input", () => {
      const jsonData = {
        firstName: "Test",
        lastName: "User",
        age: 30,
        internalId: "this-should-be-ignored", // Field marked with available: false
        email: "test@example.com"
      };

      const person = Person.fromJSON(jsonData);

      expect(person.firstName).toBe("Test");
      expect(person.lastName).toBe("User");
      expect(person.age).toBe(30);
      expect(person.email).toBe("test@example.com");
      
      // internalId should be ignored during deserialization
      expect(person.internalId).toBeUndefined();
    });

    it("should properly handle conditional fields in fromJSON", () => {
      const jsonData = {
        firstName: "Test",
        lastName: "User",
        age: 25,
        phoneNumber: "555-9999",
        email: "test@example.com"
      };

      const person = Person.fromJSON(jsonData);

      expect(person.firstName).toBe("Test");
      expect(person.lastName).toBe("User");
      expect(person.age).toBe(25);
      expect(person.email).toBe("test@example.com");
      
      // phoneNumber should be set since it's provided in JSON
      expect(person.phoneNumber).toBe("555-9999");
    });
  });

  describe("metadata and decorator application", () => {
    it("should store availability function in metadata for conditional fields", () => {
      const person = new Person();
      
      // Check that the availability function metadata is stored
      const availabilityFn = Reflect.getMetadata('field:available', person, 'phoneNumber');
      expect(typeof availabilityFn).toBe('function');
      
      // Test the function with different ages
      const youngPerson = { age: 16 } as Person;
      const adultPerson = { age: 25 } as Person;
      
      expect(availabilityFn(youngPerson)).toBe(false);
      expect(availabilityFn(adultPerson)).toBe(true);
    });

    it("should verify that @Exclude is applied to fields with available: false", () => {
      const person = new Person();
      person.internalId = "test-id";
      
      // The field should be excluded from JSON serialization
      const json = person.toJSON();
      expect(json).not.toHaveProperty("internalId");
      
      // But the field should still exist on the instance
      expect(person.internalId).toBe("test-id");
    });

    it("should verify that @Expose is applied by default and to available: true fields", () => {
      const person = new Person();
      person.firstName = "Test";
      person.lastName = "User";
      person.email = "test@example.com";
      person.age = 30;
      
      const json = person.toJSON();
      
      // All these fields should be exposed
      expect(json).toHaveProperty("firstName", "Test");
      expect(json).toHaveProperty("lastName", "User");
      expect(json).toHaveProperty("email", "test@example.com");
      expect(json).toHaveProperty("age", 30);
    });
  });

});

import { BaseModel, Field, Model, Text, Email, Relationship } from "../../index";
import type { ValidationError } from "class-validator";

/**
 * Converts an array of class-validator ValidationError objects into a stable, plain summary.
 * This version handles nested errors properly.
 */
function summarizeErrors(errors: ValidationError[]) {
  const result: { field: string; codes: string[]; messages: string[] }[] = [];
  
  function processError(error: ValidationError, parentField: string = '') {
    const fieldPath = parentField ? `${parentField}.${error.property}` : error.property;
    
    if (error.constraints) {
      result.push({
        field: fieldPath,
        codes: Object.keys(error.constraints),
        messages: Object.values(error.constraints),
      });
    }
    
    // Process nested errors (children)
    if (error.children && error.children.length > 0) {
      error.children.forEach(childError => {
        processError(childError, fieldPath);
      });
    }
  }
  
  errors.forEach(error => processError(error));
  return result;
}

// Test models for complex object validation

@Model({
  docs: "Address model for testing nested validation",
})
class Address extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 5,
    maxLength: 100,
  })
  street!: string;

  @Field({
    required: true,
  })
  @Text({
    minLength: 2,
    maxLength: 50,
  })
  city!: string;

  @Field({
    required: true,
  })
  @Text({
    regex: /^\d{5}(-\d{4})?$/,
    regexMessage: "zipCode must be in format 12345 or 12345-6789",
  })
  zipCode!: string;
}

@Model({
  docs: "Contact model for testing array validation",
})
class Contact extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 1,
    maxLength: 50,
  })
  name!: string;

  @Field({
    required: true,
  })
  @Email()
  email!: string;

  @Field({
    validation: (value: string) => {
      const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;
      if (!phoneRegex.test(value)) {
        return [{
          constraint: "invalidPhoneFormat",
          message: "Phone must be in format (123) 456-7890"
        }];
      }
      return [];
    },
  })
  phone!: string;
}

@Model({
  docs: "Company model for testing nested objects and arrays",
})
class Company extends BaseModel {
  @Field({
    required: true,
  })
  @Text({
    minLength: 1,
    maxLength: 100,
  })
  name!: string;

  @Field({
    required: true,
  })
  @Relationship({
    type: 'composition'
  })
  address!: Address;

  @Field({
    required: false,
  })
  @Relationship({
    type: 'composition',
    elementType: () => Contact
  })
  contacts!: Contact[];

  @Field({
    required: false,
  })
  @Relationship({
    type: 'composition',
    elementType: () => Address
  })
  branches!: Address[];
}

describe("Complex Objects Validation", () => {
  describe("Nested Object Validation", () => {
    it("should validate nested objects with Model decorator", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid address
      const address = new Address();
      address.street = "123 Main Street";
      address.city = "Springfield";
      address.zipCode = "12345";
      company.address = address;

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation when nested object is invalid", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create an invalid address
      const address = new Address();
      address.street = "123"; // Too short
      address.city = "S"; // Too short
      address.zipCode = "123"; // Invalid format
      company.address = address;

      const errors = await company.validate();
      const summary = summarizeErrors(errors);
      
      // Should have validation errors for the nested address fields
      expect(summary.length).toBeGreaterThan(0);
      
      // Check that we have errors for address properties
      const addressErrors = summary.filter(err => err.field.startsWith('address'));
      expect(addressErrors.length).toBeGreaterThan(0);
    });

    it("should fail validation when nested object is missing required field", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create address with missing required fields
      const address = new Address();
      address.street = "123 Main Street";
      // Missing city and zipCode
      company.address = address;

      const errors = await company.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.length).toBeGreaterThan(0);
      
      // Should have validation errors for missing required fields
      const cityError = summary.find(err => err.field === 'address.city');
      const zipError = summary.find(err => err.field === 'address.zipCode');
      
      expect(cityError).toBeDefined();
      expect(zipError).toBeDefined();
      expect(cityError?.codes).toContain('isNotEmpty');
      expect(zipError?.codes).toContain('isNotEmpty');
    });

    it("should pass validation when nested object is optional and not provided", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a minimal address for the required field
      const address = new Address();
      address.street = "123 Main Street";
      address.city = "Springfield";
      address.zipCode = "12345";
      company.address = address;
      
      // Don't set optional contacts array

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Array Validation", () => {
    it("should validate each item in an array", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid address
      const address = new Address();
      address.street = "123 Main Street";
      address.city = "Springfield";
      address.zipCode = "12345";
      company.address = address;

      // Create valid contacts array
      const contact1 = new Contact();
      contact1.name = "John Doe";
      contact1.email = "john@example.com";
      contact1.phone = "(555) 123-4567";

      const contact2 = new Contact();
      contact2.name = "Jane Smith";
      contact2.email = "jane@example.com";
      contact2.phone = "(555) 987-6543";

      company.contacts = [contact1, contact2];

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation when array contains invalid items", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid address
      const address = new Address();
      address.street = "123 Main Street";
      address.city = "Springfield";
      address.zipCode = "12345";
      company.address = address;

      // Create contacts array with invalid items
      const contact1 = new Contact();
      contact1.name = ""; // Invalid: empty name
      contact1.email = "invalid-email"; // Invalid: not a proper email
      contact1.phone = "123-456"; // Invalid: wrong phone format

      const contact2 = new Contact();
      contact2.name = "Jane Smith";
      contact2.email = "jane@example.com";
      contact2.phone = "(555) 987-6543"; // Valid

      company.contacts = [contact1, contact2];

      const errors = await company.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.length).toBeGreaterThan(0);
      
      // Should have validation errors for the invalid contact items
      const contactErrors = summary.filter(err => err.field.includes('contacts'));
      expect(contactErrors.length).toBeGreaterThan(0);
    });

    it("should validate multiple arrays of nested objects", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid main address
      const mainAddress = new Address();
      mainAddress.street = "123 Main Street";
      mainAddress.city = "Springfield";
      mainAddress.zipCode = "12345";
      company.address = mainAddress;

      // Create valid branch addresses
      const branch1 = new Address();
      branch1.street = "456 Oak Avenue";
      branch1.city = "Portland";
      branch1.zipCode = "97201";

      const branch2 = new Address();
      branch2.street = "789 Pine Street";
      branch2.city = "Seattle";
      branch2.zipCode = "98101-1234"; // Extended zip format

      company.branches = [branch1, branch2];

      // Create valid contacts
      const contact = new Contact();
      contact.name = "Manager";
      contact.email = "manager@example.com";
      contact.phone = "(555) 000-0000";
      company.contacts = [contact];

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should fail validation when multiple arrays contain invalid items", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid main address
      const mainAddress = new Address();
      mainAddress.street = "123 Main Street";
      mainAddress.city = "Springfield";
      mainAddress.zipCode = "12345";
      company.address = mainAddress;

      // Create invalid branch addresses
      const invalidBranch = new Address();
      invalidBranch.street = "Bad"; // Too short
      invalidBranch.city = ""; // Empty
      invalidBranch.zipCode = "invalid"; // Wrong format

      company.branches = [invalidBranch];

      // Create invalid contacts
      const invalidContact = new Contact();
      invalidContact.name = ""; // Empty name
      invalidContact.email = "not-an-email"; // Invalid email
      invalidContact.phone = "wrong"; // Invalid phone

      company.contacts = [invalidContact];

      const errors = await company.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.length).toBeGreaterThan(0);
      
      // Should have validation errors for both arrays
      const branchErrors = summary.filter(err => err.field.includes('branches'));
      const contactErrors = summary.filter(err => err.field.includes('contacts'));
      
      expect(branchErrors.length).toBeGreaterThan(0);
      expect(contactErrors.length).toBeGreaterThan(0);
    });

    it("should pass validation with empty arrays when arrays are optional", async () => {
      const company = new Company();
      company.name = "Tech Corp";
      
      // Create a valid main address
      const address = new Address();
      address.street = "123 Main Street";
      address.city = "Springfield";
      address.zipCode = "12345";
      company.address = address;

      // Set empty arrays for optional fields
      company.contacts = [];
      company.branches = [];

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("Combined Nested and Array Validation", () => {
    it("should validate complex nested structures with arrays", async () => {
      const company = new Company();
      company.name = "Global Tech Solutions";
      
      // Main address
      const mainAddress = new Address();
      mainAddress.street = "1000 Technology Drive";
      mainAddress.city = "San Francisco";
      mainAddress.zipCode = "94102";
      company.address = mainAddress;

      // Multiple branch offices
      const branch1 = new Address();
      branch1.street = "2000 Innovation Blvd";
      branch1.city = "Austin";
      branch1.zipCode = "73301";

      const branch2 = new Address();
      branch2.street = "3000 Research Way";
      branch2.city = "Boston";
      branch2.zipCode = "02101-5555";

      company.branches = [branch1, branch2];

      // Multiple contacts
      const ceo = new Contact();
      ceo.name = "Alice Johnson";
      ceo.email = "alice.johnson@globaltech.com";
      ceo.phone = "(415) 555-0001";

      const cto = new Contact();
      cto.name = "Bob Smith";
      cto.email = "bob.smith@globaltech.com";
      cto.phone = "(415) 555-0002";

      const hr = new Contact();
      hr.name = "Carol Williams";
      hr.email = "carol.williams@globaltech.com";
      hr.phone = "(415) 555-0003";

      company.contacts = [ceo, cto, hr];

      const errors = await company.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should detect validation errors in complex nested structures", async () => {
      const company = new Company();
      company.name = ""; // Invalid: empty name
      
      // Invalid main address
      const mainAddress = new Address();
      mainAddress.street = "12"; // Too short
      mainAddress.city = "SF"; // Valid but short
      mainAddress.zipCode = "941"; // Invalid format
      company.address = mainAddress;

      // Mix of valid and invalid branches
      const validBranch = new Address();
      validBranch.street = "2000 Innovation Blvd";
      validBranch.city = "Austin";
      validBranch.zipCode = "73301";

      const invalidBranch = new Address();
      invalidBranch.street = ""; // Empty
      invalidBranch.city = ""; // Empty
      invalidBranch.zipCode = ""; // Empty

      company.branches = [validBranch, invalidBranch];

      // Mix of valid and invalid contacts
      const validContact = new Contact();
      validContact.name = "Alice Johnson";
      validContact.email = "alice@company.com";
      validContact.phone = "(415) 555-0001";

      const invalidContact = new Contact();
      invalidContact.name = ""; // Empty
      invalidContact.email = "invalid"; // Invalid email
      invalidContact.phone = "555"; // Invalid phone

      company.contacts = [validContact, invalidContact];

      const errors = await company.validate();
      const summary = summarizeErrors(errors);
      
      expect(summary.length).toBeGreaterThan(0);
      
      // Should have errors from company name, address, branches, and contacts
      const companyNameErrors = summary.filter(err => err.field === 'name');
      const addressErrors = summary.filter(err => err.field.includes('address'));
      const branchErrors = summary.filter(err => err.field.includes('branches'));
      const contactErrors = summary.filter(err => err.field.includes('contacts'));
      
      expect(companyNameErrors.length).toBeGreaterThan(0);
      expect(addressErrors.length).toBeGreaterThan(0);
      expect(branchErrors.length).toBeGreaterThan(0);
      expect(contactErrors.length).toBeGreaterThan(0);
    });
  });
});
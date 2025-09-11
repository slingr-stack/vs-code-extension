import { TypeORMSqlDataSource } from '../../src/datasources';
import { 
  Person, 
  Address, 
  GeoLocation, 
  Employee, 
  Department, 
  Company, 
  ContactInfo 
} from '../model/NestedEmbeddingModels';

describe('Multiple Nested Embedded Models', () => {
  let dataSource: TypeORMSqlDataSource;

  beforeAll(async () => {
    dataSource = new TypeORMSqlDataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: false,
      managed: true
    });

    // Configure all models with the data source
    const models = [Person, Employee];
    
    for (const ModelClass of models) {
      const modelOptions = { dataSource };
      Reflect.defineMetadata("model:dataSource", dataSource, ModelClass);
      dataSource.configureModel(ModelClass, modelOptions);

      // Configure all fields with the data source
      const fieldNames = Reflect.getMetadata('model:fields', ModelClass) || [];
      fieldNames.forEach((fieldName: string) => {
        const fieldType = Reflect.getMetadata('field:type', ModelClass.prototype, fieldName);
        const fieldTypeOptions = Reflect.getMetadata('field:type:options', ModelClass.prototype, fieldName);
        const fieldRequired = Reflect.getMetadata('field:required', ModelClass.prototype, fieldName);
        const isEmbedded = Reflect.getMetadata('field:embedded', ModelClass.prototype, fieldName);

        if (isEmbedded) {
          // For embedded fields, pass a special type indicator
          dataSource.configureField(ModelClass.prototype, fieldName, 'embedded', {
            required: fieldRequired
          });
        } else if (fieldType) {
          const allFieldOptions = {
            ...fieldTypeOptions,
            required: fieldRequired
          };
          dataSource.configureField(ModelClass.prototype, fieldName, fieldType, allFieldOptions);
        }
      });
    }

    // Initialize the data source
    await dataSource.initialize(dataSource.getOptions());
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.disconnect();
    }
  });

  describe('Simple Nested Embedding (Person -> Address -> GeoLocation)', () => {
    test('should store nested embedded model metadata correctly', () => {
      // Check Person -> Address embedding
      const isPersonAddressEmbedded = Reflect.getMetadata('field:embedded', Person.prototype, 'address');
      expect(isPersonAddressEmbedded).toBe(true);

      const personAddressType = Reflect.getMetadata('field:embedded:type', Person.prototype, 'address');
      expect(personAddressType).toBe(Address);

      // Check Address -> GeoLocation embedding
      const isAddressGeoEmbedded = Reflect.getMetadata('field:embedded', Address.prototype, 'geo');
      expect(isAddressGeoEmbedded).toBe(true);

      const addressGeoType = Reflect.getMetadata('field:embedded:type', Address.prototype, 'geo');
      expect(addressGeoType).toBe(GeoLocation);
    });

    test('should save and load simple nested objects correctly', async () => {
      // Create nested objects
      const geo = new GeoLocation();
      geo.lat = "40.7128";
      geo.lng = "-74.0060";

      const address = new Address();
      address.street = "123 Broadway";
      address.city = "New York";
      address.geo = geo;

      const person = new Person();
      person.name = "John Doe";
      person.address = address;

      // Save the person
      const savedPerson = await dataSource.save(person);
      expect(savedPerson.id).toBeDefined();

      // Load the person back from the database
      const loadedPerson = await dataSource.findOneBy(Person, { id: savedPerson.id });
      
      expect(loadedPerson).not.toBeNull();
      expect(loadedPerson!.name).toBe("John Doe");
      expect(loadedPerson!.address).toBeDefined();
      expect(loadedPerson!.address.street).toBe("123 Broadway");
      expect(loadedPerson!.address.city).toBe("New York");
      expect(loadedPerson!.address.geo).toBeDefined();
      expect(loadedPerson!.address.geo.lat).toBe("40.7128");
      expect(loadedPerson!.address.geo.lng).toBe("-74.0060");
    });
  });

  describe('Complex Multiple Nested Embedding (Employee with Multiple Embedded Objects)', () => {
    test('should store complex nested embedded model metadata correctly', () => {
      // Check Employee -> PersonalAddress embedding
      const isPersonalAddressEmbedded = Reflect.getMetadata('field:embedded', Employee.prototype, 'personalAddress');
      expect(isPersonalAddressEmbedded).toBe(true);

      // Check Employee -> Department embedding
      const isDepartmentEmbedded = Reflect.getMetadata('field:embedded', Employee.prototype, 'department');
      expect(isDepartmentEmbedded).toBe(true);

      // Check Employee -> Company embedding
      const isCompanyEmbedded = Reflect.getMetadata('field:embedded', Employee.prototype, 'company');
      expect(isCompanyEmbedded).toBe(true);

      // Check Employee -> EmergencyContact embedding
      const isEmergencyContactEmbedded = Reflect.getMetadata('field:embedded', Employee.prototype, 'emergencyContact');
      expect(isEmergencyContactEmbedded).toBe(true);

      // Check Department -> Location (Address) embedding
      const isDepartmentLocationEmbedded = Reflect.getMetadata('field:embedded', Department.prototype, 'location');
      expect(isDepartmentLocationEmbedded).toBe(true);

      // Check Company -> Headquarters (Address) embedding
      const isCompanyHeadquartersEmbedded = Reflect.getMetadata('field:embedded', Company.prototype, 'headquarters');
      expect(isCompanyHeadquartersEmbedded).toBe(true);

      // Check Company -> Contact embedding
      const isCompanyContactEmbedded = Reflect.getMetadata('field:embedded', Company.prototype, 'contact');
      expect(isCompanyContactEmbedded).toBe(true);
    });

    test('should save and load complex nested objects correctly', async () => {
      // Create deeply nested objects
      
      // Personal address with geo location
      const personalGeo = new GeoLocation();
      personalGeo.lat = "40.7589";
      personalGeo.lng = "-73.9851";

      const personalAddress = new Address();
      personalAddress.street = "456 Park Ave";
      personalAddress.city = "New York";
      personalAddress.geo = personalGeo;

      // Department with location
      const departmentGeo = new GeoLocation();
      departmentGeo.lat = "40.7505";
      departmentGeo.lng = "-73.9934";

      const departmentAddress = new Address();
      departmentAddress.street = "789 Corporate Blvd";
      departmentAddress.city = "New York";
      departmentAddress.geo = departmentGeo;

      const department = new Department();
      department.name = "Engineering";
      department.code = "ENG";
      department.location = departmentAddress;

      // Company with headquarters and contact
      const headquartersGeo = new GeoLocation();
      headquartersGeo.lat = "40.7614";
      headquartersGeo.lng = "-73.9776";

      const headquarters = new Address();
      headquarters.street = "1 Corporate Plaza";
      headquarters.city = "New York";
      headquarters.geo = headquartersGeo;

      const companyContact = new ContactInfo();
      companyContact.email = "info@techcorp.com";
      companyContact.phone = "555-0100";

      const company = new Company();
      company.name = "TechCorp Inc";
      company.headquarters = headquarters;
      company.contact = companyContact;

      // Emergency contact
      const emergencyContact = new ContactInfo();
      emergencyContact.email = "emergency@example.com";
      emergencyContact.phone = "555-0911";

      // Employee with all nested objects
      const employee = new Employee();
      employee.name = "Jane Smith";
      employee.employeeId = "EMP001";
      employee.personalAddress = personalAddress;
      employee.department = department;
      employee.company = company;
      employee.emergencyContact = emergencyContact;

      // Save the employee
      const savedEmployee = await dataSource.save(employee);
      expect(savedEmployee.id).toBeDefined();

      // Load the employee back from the database
      const loadedEmployee = await dataSource.findOneBy(Employee, { id: savedEmployee.id });
      
      expect(loadedEmployee).not.toBeNull();
      expect(loadedEmployee!.name).toBe("Jane Smith");
      expect(loadedEmployee!.employeeId).toBe("EMP001");

      // Verify personal address nesting
      expect(loadedEmployee!.personalAddress).toBeDefined();
      expect(loadedEmployee!.personalAddress.street).toBe("456 Park Ave");
      expect(loadedEmployee!.personalAddress.city).toBe("New York");
      expect(loadedEmployee!.personalAddress.geo).toBeDefined();
      expect(loadedEmployee!.personalAddress.geo.lat).toBe("40.7589");
      expect(loadedEmployee!.personalAddress.geo.lng).toBe("-73.9851");

      // Verify department nesting (Department -> Address -> GeoLocation)
      expect(loadedEmployee!.department).toBeDefined();
      expect(loadedEmployee!.department.name).toBe("Engineering");
      expect(loadedEmployee!.department.code).toBe("ENG");
      expect(loadedEmployee!.department.location).toBeDefined();
      expect(loadedEmployee!.department.location.street).toBe("789 Corporate Blvd");
      expect(loadedEmployee!.department.location.city).toBe("New York");
      expect(loadedEmployee!.department.location.geo).toBeDefined();
      expect(loadedEmployee!.department.location.geo.lat).toBe("40.7505");
      expect(loadedEmployee!.department.location.geo.lng).toBe("-73.9934");

      // Verify company nesting (Company -> Address + ContactInfo -> GeoLocation)
      expect(loadedEmployee!.company).toBeDefined();
      expect(loadedEmployee!.company.name).toBe("TechCorp Inc");
      expect(loadedEmployee!.company.headquarters).toBeDefined();
      expect(loadedEmployee!.company.headquarters.street).toBe("1 Corporate Plaza");
      expect(loadedEmployee!.company.headquarters.city).toBe("New York");
      expect(loadedEmployee!.company.headquarters.geo).toBeDefined();
      expect(loadedEmployee!.company.headquarters.geo.lat).toBe("40.7614");
      expect(loadedEmployee!.company.headquarters.geo.lng).toBe("-73.9776");
      expect(loadedEmployee!.company.contact).toBeDefined();
      expect(loadedEmployee!.company.contact.email).toBe("info@techcorp.com");
      expect(loadedEmployee!.company.contact.phone).toBe("555-0100");

      // Verify emergency contact
      expect(loadedEmployee!.emergencyContact).toBeDefined();
      expect(loadedEmployee!.emergencyContact.email).toBe("emergency@example.com");
      expect(loadedEmployee!.emergencyContact.phone).toBe("555-0911");
    });
  });

  describe('JSON Serialization with Multiple Nested Embedded Objects', () => {
    test('should serialize and deserialize complex nested objects correctly', () => {
      // Create complex nested objects
      const geo = new GeoLocation();
      geo.lat = "40.7128";
      geo.lng = "-74.0060";

      const address = new Address();
      address.street = "123 Broadway";
      address.city = "New York";
      address.geo = geo;

      const person = new Person();
      person.name = "John Doe";
      person.address = address;

      // Test JSON serialization
      const json = person.toJSON();
      expect(json.name).toBe("John Doe");
      expect(json.address).toBeDefined();
      expect(json.address.street).toBe("123 Broadway");
      expect(json.address.city).toBe("New York");
      expect(json.address.geo).toBeDefined();
      expect(json.address.geo.lat).toBe("40.7128");
      expect(json.address.geo.lng).toBe("-74.0060");

      // Test JSON deserialization
      const restored = Person.fromJSON(json);
      expect(restored.name).toBe("John Doe");
      expect(restored.address).toBeDefined();
      expect(restored.address.street).toBe("123 Broadway");
      expect(restored.address.city).toBe("New York");
      expect(restored.address.geo).toBeDefined();
      expect(restored.address.geo.lat).toBe("40.7128");
      expect(restored.address.geo.lng).toBe("-74.0060");
    });

    test('should serialize and deserialize employee with multiple nested objects', () => {
      // Create complex employee object (similar to previous test but for JSON)
      const personalGeo = new GeoLocation();
      personalGeo.lat = "40.7589";
      personalGeo.lng = "-73.9851";

      const personalAddress = new Address();
      personalAddress.street = "456 Park Ave";
      personalAddress.city = "New York";
      personalAddress.geo = personalGeo;

      const departmentGeo = new GeoLocation();
      departmentGeo.lat = "40.7505";
      departmentGeo.lng = "-73.9934";

      const departmentAddress = new Address();
      departmentAddress.street = "789 Corporate Blvd";
      departmentAddress.city = "New York";
      departmentAddress.geo = departmentGeo;

      const department = new Department();
      department.name = "Engineering";
      department.code = "ENG";
      department.location = departmentAddress;

      const emergencyContact = new ContactInfo();
      emergencyContact.email = "emergency@example.com";
      emergencyContact.phone = "555-0911";

      const employee = new Employee();
      employee.name = "Jane Smith";
      employee.employeeId = "EMP001";
      employee.personalAddress = personalAddress;
      employee.department = department;
      employee.emergencyContact = emergencyContact;

      // Test JSON serialization
      const json = employee.toJSON();
      expect(json.name).toBe("Jane Smith");
      expect(json.employeeId).toBe("EMP001");
      expect(json.personalAddress.street).toBe("456 Park Ave");
      expect(json.personalAddress.geo.lat).toBe("40.7589");
      expect(json.department.name).toBe("Engineering");
      expect(json.department.location.street).toBe("789 Corporate Blvd");
      expect(json.department.location.geo.lat).toBe("40.7505");
      expect(json.emergencyContact.email).toBe("emergency@example.com");

      // Test JSON deserialization
      const restored = Employee.fromJSON(json);
      expect(restored.name).toBe("Jane Smith");
      expect(restored.employeeId).toBe("EMP001");
      expect(restored.personalAddress.street).toBe("456 Park Ave");
      expect(restored.personalAddress.geo.lat).toBe("40.7589");
      expect(restored.department.name).toBe("Engineering");
      expect(restored.department.location.street).toBe("789 Corporate Blvd");
      expect(restored.department.location.geo.lat).toBe("40.7505");
      expect(restored.emergencyContact.email).toBe("emergency@example.com");
    });
  });

  describe('Validation with Multiple Nested Embedded Objects', () => {
    test('should validate all nested embedded objects correctly', async () => {
      const geo = new GeoLocation();
      geo.lat = "40.7128";
      geo.lng = "-74.0060";

      const address = new Address();
      address.street = "123 Broadway";
      address.city = "New York";
      address.geo = geo;

      const person = new Person();
      person.name = "John Doe";
      person.address = address;

      const errors = await person.validate();
      expect(errors).toHaveLength(0);
    });

    test('should report validation errors in nested embedded objects', async () => {
      const geo = new GeoLocation();
      geo.lat = ""; // Invalid - empty
      geo.lng = "-74.0060";

      const address = new Address();
      address.street = ""; // Invalid - empty
      address.city = "New York";
      address.geo = geo;

      const person = new Person();
      person.name = ""; // Invalid - empty
      person.address = address;

      const errors = await person.validate();
      expect(errors.length).toBeGreaterThan(0);
      
      // Should have errors for person.name and address (with nested errors)
      const errorProperties = errors.map(error => error.property);
      expect(errorProperties).toContain('name');
      expect(errorProperties).toContain('address');
      
      // Check that the address error has nested children errors
      const addressError = errors.find(error => error.property === 'address');
      expect(addressError).toBeDefined();
      if (addressError && addressError.children) {
        expect(addressError.children.length).toBeGreaterThan(0);
        
        // Check that we have street validation error in address children
        const streetError = addressError.children.find(child => child.property === 'street');
        expect(streetError).toBeDefined();
        
        // Check that we have geo validation error in address children
        const geoError = addressError.children.find(child => child.property === 'geo');
        expect(geoError).toBeDefined();
        
        // Check that geo has its own nested children errors (for lat field)
        if (geoError && geoError.children) {
          expect(geoError.children.length).toBeGreaterThan(0);
          const latError = geoError.children.find(child => child.property === 'lat');
          expect(latError).toBeDefined();
        }
      }
    });
  });
});

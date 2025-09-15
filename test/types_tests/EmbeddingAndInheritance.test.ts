import { TypeORMSqlDataSource } from '../../src/datasources';
import { Model } from '../../src/model';
import { Address } from '../model/Address';
import { CustomerWithAddress } from '../model/CustomerWithAddress';
import { PersonBase } from '../model/PersonBase';
import { Contact } from '../model/Contact';
import { Employee } from '../model/Employee';
import { 
  MODEL_FIELDS, 
  FIELD_TYPE, 
  FIELD_TYPE_OPTIONS, 
  FIELD_REQUIRED, 
  FIELD_EMBEDDED, 
  FIELD_EMBEDDED_TYPE,
  DATASOURCE_EMBEDDED_CONFIGURED,
  TYPEORM_ENTITY,
  MODEL_DATASOURCE
} from '../../src/model/metadata/MetadataKeys';

describe('Embedding and Inheritance', () => {
  let dataSource: TypeORMSqlDataSource;

  beforeAll(async () => {
    dataSource = new TypeORMSqlDataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: false,
      managed: true
    });

    // Configure the CustomerWithAddress model with the data source
    const modelOptions = { dataSource };
    Reflect.defineMetadata(MODEL_DATASOURCE, dataSource, CustomerWithAddress);
    dataSource.configureModel(CustomerWithAddress, modelOptions);

    // Configure all fields with the data source
    const fieldNames = Reflect.getMetadata(MODEL_FIELDS, CustomerWithAddress) || [];
    fieldNames.forEach((fieldName: string) => {
      const fieldType = Reflect.getMetadata(FIELD_TYPE, CustomerWithAddress.prototype, fieldName);
      const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, CustomerWithAddress.prototype, fieldName);
      const fieldRequired = Reflect.getMetadata(FIELD_REQUIRED, CustomerWithAddress.prototype, fieldName);
      const isEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, CustomerWithAddress.prototype, fieldName);

      if (isEmbedded) {
        // For embedded fields, pass a special type indicator
        dataSource.configureField(CustomerWithAddress.prototype, fieldName, 'embedded', {
          required: fieldRequired
        });
      } else if (fieldType) {
        const allFieldOptions = {
          ...fieldTypeOptions,
          required: fieldRequired
        };
        dataSource.configureField(CustomerWithAddress.prototype, fieldName, fieldType, allFieldOptions);
      }
    });

    // Configure Contact and Employee models for inheritance testing
    Reflect.defineMetadata(MODEL_DATASOURCE, dataSource, Contact);
    dataSource.configureModel(Contact, modelOptions);
    
    Reflect.defineMetadata(MODEL_DATASOURCE, dataSource, Employee);
    dataSource.configureModel(Employee, modelOptions);

    // Configure Contact fields
    const contactFields = Reflect.getMetadata(MODEL_FIELDS, Contact) || [];
    contactFields.forEach((fieldName: string) => {
      const fieldType = Reflect.getMetadata(FIELD_TYPE, Contact.prototype, fieldName);
      const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, Contact.prototype, fieldName);
      const fieldRequired = Reflect.getMetadata(FIELD_REQUIRED, Contact.prototype, fieldName);

      if (fieldType) {
        const allFieldOptions = {
          ...fieldTypeOptions,
          required: fieldRequired
        };
        dataSource.configureField(Contact.prototype, fieldName, fieldType, allFieldOptions);
      }
    });

    // Configure Employee fields
    const employeeFields = Reflect.getMetadata(MODEL_FIELDS, Employee) || [];
    employeeFields.forEach((fieldName: string) => {
      const fieldType = Reflect.getMetadata(FIELD_TYPE, Employee.prototype, fieldName);
      const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, Employee.prototype, fieldName);
      const fieldRequired = Reflect.getMetadata(FIELD_REQUIRED, Employee.prototype, fieldName);

      if (fieldType) {
        const allFieldOptions = {
          ...fieldTypeOptions,
          required: fieldRequired
        };
        dataSource.configureField(Employee.prototype, fieldName, fieldType, allFieldOptions);
      }
    });

    // Initialize the data source
    await dataSource.initialize(dataSource.getOptions());
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.disconnect();
    }
  });

  describe('Embedded Fields', () => {
    test('should store embedded model metadata correctly', () => {
      // Check that the embedded field is marked as such
      const isEmbedded = Reflect.getMetadata(FIELD_EMBEDDED, CustomerWithAddress.prototype, 'address');
      expect(isEmbedded).toBe(true);

      // Check that the embedded type is stored
      const embeddedType = Reflect.getMetadata(FIELD_EMBEDDED_TYPE, CustomerWithAddress.prototype, 'address');
      expect(embeddedType).toBe(Address);

      // Check that the Address model has its fields registered
      const addressFields = Reflect.getMetadata(MODEL_FIELDS, Address);
      expect(addressFields).toEqual(expect.arrayContaining(['addressLine1', 'addressLine2', 'city', 'zipCode', 'state', 'country']));
    });

    test('should configure embedded fields correctly in TypeORM', () => {
      // Check that the embedded field is marked as configured
      const isConfigured = Reflect.getMetadata(DATASOURCE_EMBEDDED_CONFIGURED, CustomerWithAddress.prototype, 'address');
      expect(isConfigured).toBe(true);

      // Check that column metadata exists for embedded fields
      const addressFields = ['addressLine1', 'addressLine2', 'city', 'zipCode', 'state', 'country'];
      
      for (const fieldName of addressFields) {
        const embeddedMetadata = Reflect.getMetadata(`embedded:address:${fieldName}`, CustomerWithAddress.prototype);
        expect(embeddedMetadata).toBeDefined();
        expect(embeddedMetadata.columnName).toBe(`address_${fieldName}`);
      }
    });

    // TODO: Add tests for persistence when data transformation is implemented
    test('should save and load embedded objects correctly', async () => {
      // Create a customer with an embedded address
      const customer = new CustomerWithAddress();
      customer.name = "John Doe";
      
      const address = new Address();
      address.addressLine1 = "123 Main St";
      address.addressLine2 = "Apt 4B";
      address.city = "New York";
      address.zipCode = "10001";
      address.state = "NY";
      address.country = "USA";
      
      customer.address = address;

      // Save the customer
      const savedCustomer = await dataSource.save(customer);
      expect(savedCustomer.id).toBeDefined();

      // Load the customer back from the database
      const loadedCustomer = await dataSource.findOneBy(CustomerWithAddress, { id: savedCustomer.id });
      
      expect(loadedCustomer).not.toBeNull();
      expect(loadedCustomer!.name).toBe("John Doe");
      expect(loadedCustomer!.address).toBeDefined();
      expect(loadedCustomer!.address.addressLine1).toBe("123 Main St");
      expect(loadedCustomer!.address.addressLine2).toBe("Apt 4B");
      expect(loadedCustomer!.address.city).toBe("New York");
      expect(loadedCustomer!.address.zipCode).toBe("10001");
      expect(loadedCustomer!.address.state).toBe("NY");
      expect(loadedCustomer!.address.country).toBe("USA");
    });
  });

  describe('Inheritance', () => {
    test('should create separate tables for inherited models', () => {
      // Check that Contact has TypeORM entity metadata
      const contactEntityMetadata = Reflect.getMetadata(TYPEORM_ENTITY, Contact);
      expect(contactEntityMetadata).toBe(true);

      // Check that Employee has TypeORM entity metadata  
      const employeeEntityMetadata = Reflect.getMetadata(TYPEORM_ENTITY, Employee);
      expect(employeeEntityMetadata).toBe(true);

      // The abstract PersonBase should not have entity metadata since it's not configured
      const personBaseEntityMetadata = Reflect.getMetadata(TYPEORM_ENTITY, PersonBase);
      expect(personBaseEntityMetadata).toBeUndefined();
    });

    test('should inherit fields from base class', () => {
      // Check that Contact has inherited fields from PersonBase
      const contactFields = Reflect.getMetadata(MODEL_FIELDS, Contact) || [];
      expect(contactFields).toEqual(expect.arrayContaining(['firstName', 'lastName', 'fullName', 'email', 'phoneNumber']));

      // Check that Employee has inherited fields from PersonBase
      const employeeFields = Reflect.getMetadata(MODEL_FIELDS, Employee) || [];
      expect(employeeFields).toEqual(expect.arrayContaining(['firstName', 'lastName', 'fullName', 'ssn', 'departmentId']));
    });

    test('should save and load inherited models correctly', async () => {
      // Create and save a Contact
      const contact = new Contact();
      contact.firstName = "Jane";
      contact.lastName = "Smith";
      contact.fullName = "Jane Smith";
      contact.email = "jane.smith@example.com";
      contact.phoneNumber = "555-1234";

      const savedContact = await dataSource.save(contact);
      expect(savedContact.id).toBeDefined();

      // Load the contact back
      const loadedContact = await dataSource.findOneBy(Contact, { id: savedContact.id });
      expect(loadedContact).not.toBeNull();
      expect(loadedContact!.firstName).toBe("Jane");
      expect(loadedContact!.lastName).toBe("Smith");
      expect(loadedContact!.email).toBe("jane.smith@example.com");

      // Create and save an Employee
      const employee = new Employee();
      employee.firstName = "John";
      employee.lastName = "Doe";
      employee.fullName = "John Doe";
      employee.ssn = "123-45-6789";
      employee.departmentId = "IT";

      const savedEmployee = await dataSource.save(employee);
      expect(savedEmployee.id).toBeDefined();

      // Load the employee back
      const loadedEmployee = await dataSource.findOneBy(Employee, { id: savedEmployee.id });
      expect(loadedEmployee).not.toBeNull();
      expect(loadedEmployee!.firstName).toBe("John");
      expect(loadedEmployee!.lastName).toBe("Doe");
      expect(loadedEmployee!.ssn).toBe("123-45-6789");

      // Verify that Contact and Employee have different IDs (separate tables)
      expect(savedContact.id).not.toBe(savedEmployee.id);
    });
  });
});

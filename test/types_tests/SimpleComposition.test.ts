import { BaseModel, Field, Model, PersistentModel } from "../../index";
import { Composition } from "../../index";
import { TypeORMSqlDataSource } from "../../src/datasources";
import { Text, HTML } from "../../index";

// Test models for simple composition (single, not array)
@Model()
class Address extends PersistentModel {
  @Field({ required: true })
  @Text()
  street!: string;

  @Field({ required: true })
  @Text()
  city!: string;

  @Field({ required: false })
  @Text()
  zipCode!: string;
}

@Model()
class Company extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;

  @Field({ required: false })
  @Composition({ elementType: () => Address })
  headquarters!: Address;

  @Field({ required: false })
  @HTML()
  description!: string;
}

describe('Simple Composition (OneToOne)', () => {
  let dataSource: TypeORMSqlDataSource;

  beforeAll(() => {
    dataSource = new TypeORMSqlDataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: false,
      managed: true
    });
  });

  beforeEach(async () => {
    // Configure models with the data source
    const models = [Address, Company];
    for (const modelClass of models) {
      dataSource.configureModel(modelClass);
      
      // Get all field names and configure them
      const fieldNames = Reflect.getMetadata('model:fields', modelClass) || [];
      for (const fieldName of fieldNames) {
        const fieldType = Reflect.getMetadata('field:type', modelClass.prototype, fieldName);
        const fieldTypeOptions = Reflect.getMetadata('field:type:options', modelClass.prototype, fieldName);
        const fieldRequired = Reflect.getMetadata('field:required', modelClass.prototype, fieldName);

        if (fieldType) {
          const allFieldOptions = {
            ...fieldTypeOptions,
            required: fieldRequired
          };
          dataSource.configureField(modelClass.prototype, fieldName, fieldType, allFieldOptions);
        }
      }
    }

    await dataSource.initialize({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: false,
      managed: true
    } as any);
  });

  afterEach(async () => {
    if (dataSource && dataSource.isConnected()) {
      await dataSource.disconnect();
    }
  });

  describe('Metadata Configuration', () => {
    it('should configure single composition as OneToOne relationship', () => {
      // Check that the relationship metadata is stored correctly
      const relationshipType = Reflect.getMetadata('field:relationship:type', Company.prototype, 'headquarters');
      const fieldType = Reflect.getMetadata('field:type', Company.prototype, 'headquarters');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('composition');
    });

    it('should create TypeORM OneToOne metadata after configuration', () => {
      // Configure the field first
      dataSource.configureField(
        Company.prototype, 
        'headquarters', 
        'relationship', 
        { required: false }
      );
      
      const relationshipMetadata = Reflect.getMetadata('typeorm:relationship', Company.prototype, 'headquarters');
      const relationshipType = Reflect.getMetadata('typeorm:relationship:type', Company.prototype, 'headquarters');
      
      expect(relationshipMetadata).toBe(true);
      expect(relationshipType).toBe('composition');
    });
  });

  describe('Single Composition Persistence', () => {
    it('should persist a company with a single composed address', async () => {
      // Create an address
      const address = new Address();
      address.street = '123 Main St';
      address.city = 'Anytown';
      address.zipCode = '12345';

      // Create a company with the composed address
      const company = new Company();
      company.name = 'Acme Corp';
      company.headquarters = address;
      company.description = '<p>Leading provider of anvils</p>';

      // Save the company (should cascade save the address)
      const savedCompany = await dataSource.save(company);

      expect(savedCompany.id).toBeDefined();
      expect(savedCompany.headquarters).toBeDefined();
      expect(savedCompany.headquarters.id).toBeDefined();
      expect(savedCompany.headquarters.street).toBe('123 Main St');
      expect(savedCompany.headquarters.city).toBe('Anytown');
      expect(savedCompany.headquarters.zipCode).toBe('12345');
    });

    it('should handle company without headquarters address', async () => {
      // Create a company without headquarters
      const company = new Company();
      company.name = 'Remote Corp';
      company.description = '<p>Fully remote company</p>';

      const savedCompany = await dataSource.save(company);

      expect(savedCompany.id).toBeDefined();
      expect(savedCompany.headquarters).toBeNull();
      expect(savedCompany.name).toBe('Remote Corp');
    });

    it('should retrieve company with composed address', async () => {
      // Create and save a company with address
      const address = new Address();
      address.street = '456 Oak Ave';
      address.city = 'Somewhere';
      address.zipCode = '67890';

      const company = new Company();
      company.name = 'Tech Solutions';
      company.headquarters = address;

      const savedCompany = await dataSource.save(company);

      // Retrieve the company by ID
      const retrievedCompany = await dataSource.findOneById(Company, savedCompany.id!);

      expect(retrievedCompany).toBeDefined();
      expect(retrievedCompany!.headquarters).toBeDefined();
      expect(retrievedCompany!.headquarters.street).toBe('456 Oak Ave');
      expect(retrievedCompany!.headquarters.city).toBe('Somewhere');
      expect(retrievedCompany!.headquarters.zipCode).toBe('67890');
    });

    it('should update composed address when company is updated', async () => {
      // Create and save a company with address
      const address = new Address();
      address.street = '789 Pine St';
      address.city = 'Oldtown';
      address.zipCode = '11111';

      const company = new Company();
      company.name = 'Evolving Corp';
      company.headquarters = address;

      const savedCompany = await dataSource.save(company);

      // Update the address
      savedCompany.headquarters.street = '999 New Blvd';
      savedCompany.headquarters.city = 'Newtown';
      savedCompany.headquarters.zipCode = '22222';

      const updatedCompany = await dataSource.save(savedCompany);

      expect(updatedCompany.headquarters.street).toBe('999 New Blvd');
      expect(updatedCompany.headquarters.city).toBe('Newtown');
      expect(updatedCompany.headquarters.zipCode).toBe('22222');

      // Verify persistence by retrieving again
      const retrievedCompany = await dataSource.findOneById(Company, updatedCompany.id!);
      expect(retrievedCompany!.headquarters.street).toBe('999 New Blvd');
      expect(retrievedCompany!.headquarters.city).toBe('Newtown');
    });
  });

  describe('Validation with Single Composition', () => {
    it('should validate composed objects', async () => {
      const address = new Address();
      address.street = ''; // Invalid - required field
      address.city = 'Test City';

      const company = new Company();
      company.name = 'Test Company';
      company.headquarters = address;

      const errors = await company.validate();
      
      // Should have validation errors from the composed address
      expect(errors.length).toBeGreaterThan(0);
      
      // Find the street validation error
      const streetError = errors.find(error => 
        error.property === 'headquarters' && 
        error.children && 
        error.children.some(child => child.property === 'street')
      );
      expect(streetError).toBeDefined();
    });

    it('should pass validation with valid composed object', async () => {
      const address = new Address();
      address.street = 'Valid Street';
      address.city = 'Valid City';
      address.zipCode = '12345';

      const company = new Company();
      company.name = 'Valid Company';
      company.headquarters = address;

      const errors = await company.validate();
      expect(errors).toHaveLength(0);
    });
  });

  describe('JSON Serialization with Single Composition', () => {
    it('should serialize composed object to JSON', () => {
      const address = new Address();
      address.street = 'JSON Street';
      address.city = 'JSON City';
      address.zipCode = '98765';

      const company = new Company();
      company.name = 'JSON Corp';
      company.headquarters = address;

      const json = company.toJSON();

      expect(json.name).toBe('JSON Corp');
      expect(json.headquarters).toBeDefined();
      expect(json.headquarters.street).toBe('JSON Street');
      expect(json.headquarters.city).toBe('JSON City');
      expect(json.headquarters.zipCode).toBe('98765');
    });

    it('should deserialize composed object from JSON', () => {
      const json = {
        name: 'Restored Corp',
        description: '<p>From JSON</p>',
        headquarters: {
          street: 'Restored Street',
          city: 'Restored City',
          zipCode: '54321'
        }
      };

      const company = Company.fromJSON(json);

      expect(company.name).toBe('Restored Corp');
      expect(company.headquarters).toBeDefined();
      expect(company.headquarters).toBeInstanceOf(Address);
      expect(company.headquarters.street).toBe('Restored Street');
      expect(company.headquarters.city).toBe('Restored City');
      expect(company.headquarters.zipCode).toBe('54321');
    });

    it('should handle round-trip JSON conversion', () => {
      const address = new Address();
      address.street = 'Round Trip Street';
      address.city = 'Round Trip City';

      const company = new Company();
      company.name = 'Round Trip Corp';
      company.headquarters = address;

      const json = company.toJSON();
      const restored = Company.fromJSON(json);

      expect(restored.name).toBe(company.name);
      expect(restored.headquarters.street).toBe(company.headquarters.street);
      expect(restored.headquarters.city).toBe(company.headquarters.city);
    });
  });
});

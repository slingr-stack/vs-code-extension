import {
  PersistentModel,
  Model,
  Field,
  Text,
  Email,
  DateTime,
  Integer,
  TypeORMSqlDataSource
} from '../../index';
import { DATASOURCE_TYPE, MODEL_DATASOURCE, TYPEORM_COLUMN, TYPEORM_ENTITY } from '../../src/model/metadata';

describe('Data Source Integration', () => {

  beforeEach(() => {
    const dataSource = new TypeORMSqlDataSource({
      type: 'sqlite',
      managed: true,
      filename: ':memory:',
      logging: false,
      synchronize: true,
    });
  });

  describe('PersistentModel', () => {
    it('should extend BaseModel and include id field', () => {
      @Model()
      class TestPersistentModel extends PersistentModel {
        @Field({ required: true })
        @Text()
        name!: string;
      }

      const instance = new TestPersistentModel();
      instance.name = 'Test';
      instance.id = '123';

      expect(instance.id).toBe('123');
      expect(instance.name).toBe('Test');
      expect(instance).toBeInstanceOf(PersistentModel);
    });

    it('should validate with id field optional', async () => {
      @Model()
      class TestPersistentModel extends PersistentModel {
        @Field({ required: true })
        @Text()
        name!: string;
      }

      const instance = new TestPersistentModel();
      instance.name = 'Test';
      // id is not set, but should still validate since it's optional

      const errors = await instance.validate();
      expect(errors).toHaveLength(0);
    });

    it('should include id in JSON serialization', () => {
      @Model()
      class TestPersistentModel extends PersistentModel {
        @Field({ required: true })
        @Text()
        name!: string;
      }

      const instance = new TestPersistentModel();
      instance.name = 'Test';
      instance.id = '123';

      const json = instance.toJSON();
      expect(json).toEqual({
        id: '123',
        name: 'Test'
      });
    });
  });

  describe('Model with DataSource', () => {
    it('should configure model with TypeORM when dataSource is provided', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
      
      @Model({
        dataSource: dataSource,
        docs: 'Test user model'
      })
      class User extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Email()
        email!: string;
      }

      // Check that the model has been configured with TypeORM metadata
      const isEntity = Reflect.getMetadata(TYPEORM_ENTITY, User);
      const dataSourceType = Reflect.getMetadata(DATASOURCE_TYPE, User);
      const storedDataSource = Reflect.getMetadata(MODEL_DATASOURCE, User);

      expect(isEntity).toBe(true);
      expect(dataSourceType).toBe('typeorm-sql');
      expect(storedDataSource).toBe(dataSource);
    });

    it('should configure fields with TypeORM column metadata', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });

      @Model({
        dataSource: dataSource
      })
      class User extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Integer()
        age!: number;

        @Field({ required: false })
        @DateTime()
        createdAt?: Date;
      }

      // Check field configurations
      const nameColumn = Reflect.getMetadata(TYPEORM_COLUMN, User.prototype, 'name');
      const ageColumn = Reflect.getMetadata(TYPEORM_COLUMN, User.prototype, 'age');
      const createdAtColumn = Reflect.getMetadata(TYPEORM_COLUMN, User.prototype, 'createdAt');

      expect(nameColumn).toEqual({
        type: 'varchar',
        length: 50,
        nullable: false  // Required field should not be nullable
      });

      expect(ageColumn).toEqual({
        type: 'int',
        nullable: true  // Optional field should be nullable
      });

      expect(createdAtColumn).toEqual({
        type: 'datetime',
        nullable: true  // Optional field should be nullable
      });
    });

    it('should not configure fields when no dataSource is provided', () => {
      @Model()
      class User extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;
      }

      // Check that no TypeORM metadata was added
      const isEntity = Reflect.getMetadata(TYPEORM_ENTITY, User);
      const nameColumn = Reflect.getMetadata(TYPEORM_COLUMN, User.prototype, 'name');

      expect(isEntity).toBeUndefined();
      expect(nameColumn).toBeUndefined();
    });
  });

  describe('TypeOrmSqlDataSource', () => {
    it('should map different field types to appropriate column types', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
      
      @Model({
        dataSource: dataSource
      })
      class TestEntity extends PersistentModel {
        @Field({})
        @Text({ maxLength: 100 })
        shortText!: string;

        @Field({})
        @Text({ maxLength: 1000 })
        longText!: string;

        @Field({})
        @Integer()
        count!: number;

        @Field({})
        @DateTime()
        timestamp!: Date;
      }

      const shortTextColumn = Reflect.getMetadata(TYPEORM_COLUMN, TestEntity.prototype, 'shortText');
      const longTextColumn = Reflect.getMetadata(TYPEORM_COLUMN, TestEntity.prototype, 'longText');
      const countColumn = Reflect.getMetadata(TYPEORM_COLUMN, TestEntity.prototype, 'count');
      const timestampColumn = Reflect.getMetadata(TYPEORM_COLUMN, TestEntity.prototype, 'timestamp');

      expect(shortTextColumn.type).toBe('varchar');
      expect(shortTextColumn.length).toBe(100);

      expect(longTextColumn.type).toBe('text');
      expect(longTextColumn.length).toBeUndefined();

      expect(countColumn.type).toBe('int');
      expect(timestampColumn.type).toBe('datetime');
    });

    it('should handle fields without type metadata gracefully', () => {

      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
      // Create a field without any type decorator
      @Model({
        dataSource: dataSource
      })
      class TestEntity extends PersistentModel {
        @Field({})
        plainField!: any;
      }

      // The field should not have TypeORM column metadata since there's no type info
      const plainFieldColumn = Reflect.getMetadata(TYPEORM_COLUMN, TestEntity.prototype, 'plainField');
      expect(plainFieldColumn).toBeUndefined();
    });
  });

  describe('Integration with existing functionality', () => {
    it('should maintain validation functionality with data source', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
      
      @Model({
        dataSource: dataSource
      })
      class User extends PersistentModel {
        @Field({ required: true })
        @Text({ minLength: 2, maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Email()
        email!: string;
      }

      const user = new User();

      // Should fail validation without required name
      let errors = await user.validate();
      expect(errors.length).toBeGreaterThan(0);

      // Should pass validation with valid data
      user.name = 'John Doe';
      user.email = 'john@example.com';
      errors = await user.validate();
      expect(errors).toHaveLength(0);
    });

    it('should maintain JSON serialization with data source', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
      
      @Model({
        dataSource: dataSource
      })
      class User extends PersistentModel {
        @Field({ required: true })
        @Text()
        name!: string;

        @Field({ available: false })
        @Text()
        internalField!: string;
      }

      const user = new User();
      user.id = '123';
      user.name = 'John';
      user.internalField = 'secret';

      const json = user.toJSON();

      // Should include id and name, but not internalField
      expect(json).toEqual({
        id: '123',
        name: 'John'
      });
      expect(json.internalField).toBeUndefined();
    });
  });

  describe('SQLite Database Operations', () => {
    let dataSource: TypeORMSqlDataSource;

    beforeEach(async () => {
      dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });
    });

    afterEach(async () => {
      if (dataSource && dataSource.isConnected()) {
        await dataSource.disconnect();
      }
    });

    it('should save and retrieve a simple entity', async () => {
      @Model({
        dataSource: dataSource
      })
      class TestUser extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Email()
        email!: string;
      }

      // Initialize the data source after model is configured
      await dataSource.initialize(dataSource.getOptions());

      // Create and save a user
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';

      // Validate before saving
      const errors = await user.validate();
      expect(errors).toHaveLength(0);

      // Save the user
      const savedUser = await dataSource.save(user);
      expect(savedUser).toBeDefined();
      expect(savedUser.id).toBeDefined();
      expect(savedUser.name).toBe('John Doe');
      expect(savedUser.email).toBe('john@example.com');

      // Find the user by id
      const foundUser = await dataSource.findOneById(TestUser, savedUser.id);
      expect(foundUser).toBeDefined();
      expect(foundUser!.name).toBe('John Doe');
      expect(foundUser!.email).toBe('john@example.com');
    });

    it('should find all entities', async () => {
      @Model({
        dataSource: dataSource
      })
      class TestUser extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Integer()
        age!: number;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Create and save multiple users
      const user1 = new TestUser();
      user1.name = 'Alice';
      user1.age = 25;

      const user2 = new TestUser();
      user2.name = 'Bob';
      user2.age = 30;

      const savedUser1 = await dataSource.save(user1);
      const savedUser2 = await dataSource.save(user2);

      // Find all users
      const allUsers = await dataSource.find(TestUser);
      expect(allUsers).toHaveLength(2);
      
      const names = allUsers.map(u => u.name).sort();
      expect(names).toEqual(['Alice', 'Bob']);
    });

    it('should find entities by criteria', async () => {
      @Model({
        dataSource: dataSource
      })
      class TestUser extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Integer()
        age!: number;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Create and save users with different ages
      const youngUser = new TestUser();
      youngUser.name = 'Alice';
      youngUser.age = 20;

      const oldUser = new TestUser();
      oldUser.name = 'Bob';
      oldUser.age = 50;

      await dataSource.save(youngUser);
      await dataSource.save(oldUser);

      // Find users by age criteria
      const youngUsers = await dataSource.find(TestUser, { age: 20 });
      expect(youngUsers).toHaveLength(1);
      expect(youngUsers[0]).toBeDefined();
      expect(youngUsers[0]!.name).toBe('Alice');

      const oldUsers = await dataSource.find(TestUser, { age: 50 });
      expect(oldUsers).toHaveLength(1);
      expect(oldUsers[0]).toBeDefined();
      expect(oldUsers[0]!.name).toBe('Bob');
    });

    it('should delete entities', async () => {
      @Model({
        dataSource: dataSource
      })
      class TestUser extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Create and save a user
      const user = new TestUser();
      user.name = 'John Doe';
      const savedUser = await dataSource.save(user);

      // Verify user exists
      let foundUser = await dataSource.findOneById(TestUser, savedUser.id);
      expect(foundUser).toBeDefined();

      // Delete the user
      await dataSource.delete(TestUser, savedUser.id);

      // Verify user is deleted
      foundUser = await dataSource.findOneById(TestUser, savedUser.id);
      expect(foundUser).toBeNull();
    });

    it('should count entities', async () => {
      @Model({
        dataSource: dataSource
      })
      class TestUser extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 50 })
        name!: string;

        @Field({ required: false })
        @Text()
        category!: string;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Create and save users with different categories
      const user1 = new TestUser();
      user1.name = 'Alice';
      user1.category = 'admin';

      const user2 = new TestUser();
      user2.name = 'Bob';
      user2.category = 'user';

      const user3 = new TestUser();
      user3.name = 'Charlie';
      user3.category = 'admin';

      await dataSource.save(user1);
      await dataSource.save(user2);
      await dataSource.save(user3);

      // Count all users
      const totalCount = await dataSource.count(TestUser);
      expect(totalCount).toBe(3);

      // Count admin users
      const adminCount = await dataSource.count(TestUser, { category: 'admin' });
      expect(adminCount).toBe(2);

      // Count regular users
      const userCount = await dataSource.count(TestUser, { category: 'user' });
      expect(userCount).toBe(1);
    });

    it('should handle complex models with different field types', async () => {
      @Model({
        dataSource: dataSource
      })
      class ComplexModel extends PersistentModel {
        @Field({ required: true })
        @Text({ maxLength: 100 })
        title!: string;

        @Field({ required: false })
        @Integer()
        count!: number;

        @Field({ required: false })
        @DateTime()
        createdAt!: Date;

        @Field({ required: false })
        @Email()
        contact!: string;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Create and save a complex model
      const model = new ComplexModel();
      model.title = 'Test Record';
      model.count = 42;
      model.createdAt = new Date('2023-01-15T10:30:00Z');
      model.contact = 'test@example.com';

      // Validate and save
      const errors = await model.validate();
      expect(errors).toHaveLength(0);

      const savedModel = await dataSource.save(model);
      expect(savedModel.id).toBeDefined();

      // Retrieve and verify
      const foundModel = await dataSource.findOneById(ComplexModel, savedModel.id);
      expect(foundModel).toBeDefined();
      expect(foundModel!.title).toBe('Test Record');
      expect(foundModel!.count).toBe(42);
      expect(foundModel!.contact).toBe('test@example.com');
      
      // Note: Date comparison might need special handling depending on how TypeORM handles dates
      expect(foundModel!.createdAt).toBeInstanceOf(Date);
    });

    it('should maintain validation when working with the database', async () => {
      @Model({
        dataSource: dataSource
      })
      class ValidatedUser extends PersistentModel {
        @Field({ required: true })
        @Text({ minLength: 2, maxLength: 50 })
        name!: string;

        @Field({ required: true })
        @Email()
        email!: string;

        @Field({ required: false })
        @Integer()
        age!: number;
      }

      await dataSource.initialize(dataSource.getOptions());

      // Try to save an invalid user
      const invalidUser = new ValidatedUser();
      invalidUser.name = 'A'; // Too short
      invalidUser.email = 'invalid-email'; // Invalid email format

      const errors = await invalidUser.validate();
      expect(errors.length).toBeGreaterThan(0);

      // Should not save invalid data - but this depends on framework validation
      // For now, we'll test that valid data works correctly

      // Create a valid user
      const validUser = new ValidatedUser();
      validUser.name = 'John Doe';
      validUser.email = 'john@example.com';
      validUser.age = 30;

      const validationErrors = await validUser.validate();
      expect(validationErrors).toHaveLength(0);

      const savedUser = await dataSource.save(validUser);
      expect(savedUser.id).toBeDefined();
      expect(savedUser.name).toBe('John Doe');
    });
  });
});
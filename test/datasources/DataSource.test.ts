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
      const isEntity = Reflect.getMetadata('typeorm:entity', User);
      const dataSourceType = Reflect.getMetadata('datasource:type', User);
      const storedDataSource = Reflect.getMetadata('model:dataSource', User);

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
      const nameColumn = Reflect.getMetadata('typeorm:column', User.prototype, 'name');
      const ageColumn = Reflect.getMetadata('typeorm:column', User.prototype, 'age');
      const createdAtColumn = Reflect.getMetadata('typeorm:column', User.prototype, 'createdAt');

      expect(nameColumn).toEqual({
        type: 'varchar',
        length: 50,
        nullable: true
      });

      expect(ageColumn).toEqual({
        type: 'int',
        nullable: true
      });

      expect(createdAtColumn).toEqual({
        type: 'timestamp',
        nullable: true
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
      const isEntity = Reflect.getMetadata('typeorm:entity', User);
      const nameColumn = Reflect.getMetadata('typeorm:column', User.prototype, 'name');

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

      const shortTextColumn = Reflect.getMetadata('typeorm:column', TestEntity.prototype, 'shortText');
      const longTextColumn = Reflect.getMetadata('typeorm:column', TestEntity.prototype, 'longText');
      const countColumn = Reflect.getMetadata('typeorm:column', TestEntity.prototype, 'count');
      const timestampColumn = Reflect.getMetadata('typeorm:column', TestEntity.prototype, 'timestamp');

      expect(shortTextColumn.type).toBe('varchar');
      expect(shortTextColumn.length).toBe(100);

      expect(longTextColumn.type).toBe('text');
      expect(longTextColumn.length).toBeUndefined();

      expect(countColumn.type).toBe('int');
      expect(timestampColumn.type).toBe('timestamp');
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
      const plainFieldColumn = Reflect.getMetadata('typeorm:column', TestEntity.prototype, 'plainField');
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
});
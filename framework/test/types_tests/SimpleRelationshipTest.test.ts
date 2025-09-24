import { PersistentModel, Field, Model, Reference, TypeORMSqlDataSource, Text } from "../../index";
import { 
  MODEL_FIELDS, 
  FIELD_TYPE, 
  FIELD_TYPE_OPTIONS, 
  FIELD_REQUIRED, 
  FIELD_RELATIONSHIP_TYPE,
  FIELD_RELATIONSHIP_LOAD 
} from "../../src/model/metadata/MetadataKeys";

// Simple test models
@Model()
class SimpleUser extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;
}

@Model()
class SimpleTask extends PersistentModel {
  @Field({ required: true })
  @Text()
  title!: string;

  @Field({ required: false })
  @Reference({ load: true }) // Explicitly set load to true
  assignedUser?: SimpleUser;
}

describe('Simple Relationship Test', () => {
  let dataSource: TypeORMSqlDataSource;

  beforeEach(async () => {
    dataSource = new TypeORMSqlDataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: true, // Enable logging to see SQL
      managed: true
    });

    // Configure models
    const models = [SimpleUser, SimpleTask];
    for (const modelClass of models) {
      dataSource.configureModel(modelClass);
      
      const fieldNames = Reflect.getMetadata(MODEL_FIELDS, modelClass) || [];
      for (const fieldName of fieldNames) {
        const fieldType = Reflect.getMetadata(FIELD_TYPE, modelClass.prototype, fieldName);
        const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, modelClass.prototype, fieldName);
        const fieldRequired = Reflect.getMetadata(FIELD_REQUIRED, modelClass.prototype, fieldName);

        if (fieldType) {
          const allFieldOptions = {
            ...fieldTypeOptions,
            required: fieldRequired
          };
          console.log(`Configuring field ${modelClass.name}.${fieldName} with type ${fieldType}`, allFieldOptions);
          dataSource.configureField(modelClass.prototype, fieldName, fieldType, allFieldOptions);
          
          // Check if it's a relationship field and log additional info
          if (fieldType === 'relationship') {
            const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, modelClass.prototype, fieldName);
            const load = Reflect.getMetadata(FIELD_RELATIONSHIP_LOAD, modelClass.prototype, fieldName);
            console.log(`  Relationship details: type=${relationshipType}, load=${load}`);
          }
        }
      }
    }

    await dataSource.initialize({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: true,
      managed: true
    } as any);
  });

  afterEach(async () => {
    if (dataSource && dataSource.isConnected()) {
      await dataSource.disconnect();
    }
  });

  it('should persist and load a simple reference relationship', async () => {
    // Create and save a user
    const user = new SimpleUser();
    user.name = 'Test User';
    const savedUser = await dataSource.save(user);
    console.log('Saved user:', savedUser);

    // Create and save a task with user reference
    const task = new SimpleTask();
    task.title = 'Test Task';
    task.assignedUser = savedUser;
    const savedTask = await dataSource.save(task);
    console.log('Saved task:', savedTask);

    // Check if the relationship was persisted and loaded
    expect(savedTask.id).toBeDefined();
    console.log('Task assignedUser:', savedTask.assignedUser);
    
    expect(savedTask.assignedUser?.name).toBe('Test User');
  });
});

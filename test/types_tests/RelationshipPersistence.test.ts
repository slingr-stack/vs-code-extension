import { BaseModel, Field, Model, PersistentModel, PersistentComponentModel } from "../../index";
import { Reference, Composition, SharedComposition } from "../../index";
import { TypeORMSqlDataSource } from "../../src/datasources";
import { Text, HTML, DateTime } from "../../index";

// Test models for relationship persistence
@Model()
class User extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;

  @Field({ required: true })
  @Text()
  email!: string;
}

@Model()
class Project extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;
}

@Model()
class TaskNote extends PersistentComponentModel<Task> {
  @Field({ required: false })
  @Reference()
  user!: User;

  @Field({ required: false })
  @DateTime()
  timestamp!: Date;

  @Field({ required: false })
  @HTML()
  note!: string;
}

@Model()
class Task extends PersistentModel {
  @Field({ required: false })
  @Reference({ onDelete: 'delete' })
  project!: Project;

  @Field({ required: true })
  @Text()
  title!: string;

  @Field({ required: false })
  @Reference({ elementType: () => User })
  assignees!: User[];

  @Field({ required: false })
  @HTML()
  description!: string;

  @Field({ required: false })
  @Composition({ elementType: () => TaskNote })
  notes!: TaskNote[];
}

@Model()
class Note extends PersistentModel {
  @Field({ required: false })
  @Reference()
  user!: User;

  @Field({ required: false })
  @DateTime()
  timestamp!: Date;

  @Field({ required: false })
  @HTML()
  content!: string;
}

@Model()
class Epic extends PersistentModel {
  @Field({ required: true })
  @Text()
  title!: string;

  @Field({ required: false })
  @SharedComposition({ elementType: () => Note })
  notes!: Note[];
}

@Model()
class Story extends PersistentModel {
  @Field({ required: true })
  @Text()
  title!: string;

  @Field({ required: false })
  @SharedComposition({ elementType: () => Note })
  notes!: Note[];
}

describe('Relationship Persistence', () => {
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
    const models = [User, Project, Task, TaskNote, Note, Epic, Story];
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

  describe('Shortcut Decorators', () => {
    it('should store relationship metadata for @Reference', () => {
      const relationshipType = Reflect.getMetadata('field:relationship:type', Task.prototype, 'project');
      const fieldType = Reflect.getMetadata('field:type', Task.prototype, 'project');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('reference');
    });

    it('should store relationship metadata for @Composition', () => {
      const relationshipType = Reflect.getMetadata('field:relationship:type', Task.prototype, 'notes');
      const fieldType = Reflect.getMetadata('field:type', Task.prototype, 'notes');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('composition');
    });

    it('should store relationship metadata for @SharedComposition', () => {
      const relationshipType = Reflect.getMetadata('field:relationship:type', Epic.prototype, 'notes');
      const fieldType = Reflect.getMetadata('field:type', Epic.prototype, 'notes');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('sharedComposition');
    });

    it('should store relationship metadata for parent relationship in PersistentComponentModel', () => {
      const relationshipType = Reflect.getMetadata('field:relationship:type', TaskNote.prototype, 'owner');
      const fieldType = Reflect.getMetadata('field:type', TaskNote.prototype, 'owner');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('parent');
    });

    it('should create TypeORM relationship metadata after configuration', () => {
      // Configure the field first
      dataSource.configureField(
        Task.prototype, 
        'project', 
        'relationship', 
        { required: false }
      );
      
      const relationshipMetadata = Reflect.getMetadata('typeorm:relationship', Task.prototype, 'project');
      const relationshipType = Reflect.getMetadata('typeorm:relationship:type', Task.prototype, 'project');
      
      expect(relationshipMetadata).toBe(true);
      expect(relationshipType).toBe('reference');
    });
  });

  describe('Basic Persistence', () => {
    it('should persist reference relationships', async () => {
      // Create and save a project
      const project = new Project();
      project.name = 'Test Project';
      const savedProject = await dataSource.save(project);

      // Create and save a task with project reference
      const task = new Task();
      task.title = 'Test Task';
      task.project = savedProject;
      task.assignees = [];
      task.notes = [];
      
      const savedTask = await dataSource.save(task);
      
      expect(savedTask.id).toBeDefined();
      expect(savedTask.project).toBeDefined();
      expect(savedTask.project.id).toBe(savedProject.id);
    });

    it('should persist composition relationships', async () => {
      // Create a user for the note
      const user = new User();
      user.name = 'Test User';
      user.email = 'test@example.com';
      const savedUser = await dataSource.save(user);

      // Create a task
      const task = new Task();
      task.title = 'Test Task';
      task.assignees = [];
      task.notes = [];

      // Save the task first to get an ID
      const savedTask = await dataSource.save(task);

      // Create a note for the task
      const note = new TaskNote();
      note.user = savedUser;
      note.timestamp = new Date();
      note.note = 'Test note content';
      note.owner = savedTask; // Set the parent relationship

      // Update the task with the note
      savedTask.notes = [note];
      const updatedTask = await dataSource.save(savedTask);

      expect(updatedTask.notes).toHaveLength(1);
      expect(updatedTask.notes[0]!.note).toBe('Test note content');
      expect(updatedTask.notes[0]!.user.name).toBe('Test User');
    });
  });

  describe('Array Relationships', () => {
    it('should handle many-to-many reference relationships', async () => {
      // Create users
      const user1 = new User();
      user1.name = 'User 1';
      user1.email = 'user1@example.com';
      const savedUser1 = await dataSource.save(user1);

      const user2 = new User();
      user2.name = 'User 2';
      user2.email = 'user2@example.com';
      const savedUser2 = await dataSource.save(user2);

      // Create task with multiple assignees
      const task = new Task();
      task.title = 'Multi-assignee Task';
      task.assignees = [savedUser1, savedUser2];
      task.notes = [];

      const savedTask = await dataSource.save(task);

      expect(savedTask.assignees).toHaveLength(2);
      expect(savedTask.assignees.map(u => u.name)).toContain('User 1');
      expect(savedTask.assignees.map(u => u.name)).toContain('User 2');
    });
  });

  describe('Complex Relationships', () => {
    it('should handle nested composition and reference relationships', async () => {
      // Create a user
      const user = new User();
      user.name = 'Task Creator';
      user.email = 'creator@example.com';
      const savedUser = await dataSource.save(user);

      // Create a project
      const project = new Project();
      project.name = 'Complex Project';
      const savedProject = await dataSource.save(project);

      // Create a task
      const task = new Task();
      task.title = 'Complex Task';
      task.project = savedProject;
      task.assignees = [savedUser];
      task.notes = [];

      // Save the task first
      const savedTask = await dataSource.save(task);

      // Create a note
      const note = new TaskNote();
      note.user = savedUser;
      note.timestamp = new Date();
      note.note = 'Complex task note';
      note.owner = savedTask;

      // Update task with note
      savedTask.notes = [note];
      const finalTask = await dataSource.save(savedTask);

      expect(finalTask.project.name).toBe('Complex Project');
      expect(finalTask.assignees).toHaveLength(1);
      expect(finalTask.assignees[0]!.name).toBe('Task Creator');
      expect(finalTask.notes).toHaveLength(1);
      expect(finalTask.notes[0]!.note).toBe('Complex task note');
      expect(finalTask.notes[0]!.user.name).toBe('Task Creator');
    });
  });
});

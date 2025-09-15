import { BaseModel, Field, Model, PersistentModel, PersistentComponentModel } from "../../index";
import { Reference, Composition, SharedComposition } from "../../index";
import { TypeORMSqlDataSource } from "../../src/datasources";
import { Text, HTML, DateTime } from "../../index";
import { 
  MODEL_FIELDS, 
  FIELD_TYPE, 
  FIELD_TYPE_OPTIONS, 
  FIELD_REQUIRED, 
  FIELD_RELATIONSHIP_TYPE,
  TYPEORM_RELATIONSHIP,
  TYPEORM_RELATIONSHIP_TYPE
} from "../../src/model/metadata/MetadataKeys";

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
      const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, Task.prototype, 'project');
      const fieldType = Reflect.getMetadata(FIELD_TYPE, Task.prototype, 'project');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('reference');
    });

    it('should store relationship metadata for @Composition', () => {
      const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, Task.prototype, 'notes');
      const fieldType = Reflect.getMetadata(FIELD_TYPE, Task.prototype, 'notes');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('composition');
    });

    it('should store relationship metadata for @SharedComposition', () => {
      const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, Epic.prototype, 'notes');
      const fieldType = Reflect.getMetadata(FIELD_TYPE, Epic.prototype, 'notes');
      
      expect(fieldType).toBe('relationship');
      expect(relationshipType).toBe('sharedComposition');
    });

    it('should store relationship metadata for parent relationship in PersistentComponentModel', () => {
      const relationshipType = Reflect.getMetadata(FIELD_RELATIONSHIP_TYPE, TaskNote.prototype, 'owner');
      const fieldType = Reflect.getMetadata(FIELD_TYPE, TaskNote.prototype, 'owner');
      
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
      
      const relationshipMetadata = Reflect.getMetadata(TYPEORM_RELATIONSHIP, Task.prototype, 'project');
      const relationshipType = Reflect.getMetadata(TYPEORM_RELATIONSHIP_TYPE, Task.prototype, 'project');
      
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

  describe('Relationship Querying', () => {
    let savedUser: User;
    let savedProject: Project;
    let savedTask: Task;

    beforeEach(async () => {
      // Setup test data
      const user = new User();
      user.name = 'Query Test User';
      user.email = 'query@example.com';
      savedUser = await dataSource.save(user);

      const project = new Project();
      project.name = 'Query Test Project';
      savedProject = await dataSource.save(project);

      const task = new Task();
      task.title = 'Query Test Task';
      task.project = savedProject;
      task.assignees = [savedUser];
      task.notes = [];
      savedTask = await dataSource.save(task);

      // Add a note to the task
      const note = new TaskNote();
      note.user = savedUser;
      note.timestamp = new Date();
      note.note = 'Query test note';
      note.owner = savedTask;

      savedTask.notes = [note];
      await dataSource.save(savedTask);
    });

    it('should find tasks by project reference', async () => {
      const tasks = await dataSource.findBy(Task, { project: { id: savedProject.id } });
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Query Test Task');
      expect(tasks[0]!.project.id).toBe(savedProject.id);
    });

    it('should find tasks by assignee reference', async () => {
      const tasks = await dataSource.findWithOptions(Task, {
        where: { assignees: { id: savedUser.id } }
      });
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Query Test Task');
      expect(tasks[0]!.assignees.some(u => u.id === savedUser.id)).toBe(true);
    });

    it('should find one task with relations loaded', async () => {
      const task = await dataSource.findOneBy(Task, { id: savedTask.id });
      
      expect(task).toBeDefined();
      expect(task!.title).toBe('Query Test Task');
      expect(task!.project).toBeDefined();
      expect(task!.project.name).toBe('Query Test Project');
      expect(task!.assignees).toHaveLength(1);
      expect(task!.assignees[0]!.name).toBe('Query Test User');
      expect(task!.notes).toHaveLength(1);
      expect(task!.notes[0]!.note).toBe('Query test note');
    });

    it('should find tasks with complex where conditions', async () => {
      const tasks = await dataSource.findWithOptions(Task, {
        where: {
          project: { name: 'Query Test Project' },
          assignees: { email: 'query@example.com' }
        }
      });
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Query Test Task');
    });

    it('should count tasks with relationships', async () => {
      const count = await dataSource.countBy(Task, { 
        project: { id: savedProject.id } 
      });
      
      expect(count).toBe(1);
    });

    it('should check existence of tasks with relationships', async () => {
      const exists = await dataSource.existsBy(Task, { 
        assignees: { id: savedUser.id } 
      });
      
      expect(exists).toBe(true);
    });
  });

  describe('Array Composition Operations', () => {
    let savedTask: Task;
    let savedUser1: User;
    let savedUser2: User;

    beforeEach(async () => {
      // Create users
      const user1 = new User();
      user1.name = 'Note User 1';
      user1.email = 'user1@notes.com';
      savedUser1 = await dataSource.save(user1);

      const user2 = new User();
      user2.name = 'Note User 2';
      user2.email = 'user2@notes.com';
      savedUser2 = await dataSource.save(user2);

      // Create task
      const task = new Task();
      task.title = 'Array Composition Test Task';
      task.assignees = [];
      task.notes = [];
      savedTask = await dataSource.save(task);
    });

    it('should add elements to composition array', async () => {
      // Add first note
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date();
      note1.note = 'First note';
      note1.owner = savedTask;

      savedTask.notes = [note1];
      const updatedTask1 = await dataSource.save(savedTask);

      expect(updatedTask1.notes).toHaveLength(1);
      expect(updatedTask1.notes[0]!.note).toBe('First note');

      // Add second note
      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date();
      note2.note = 'Second note';
      note2.owner = savedTask;

      updatedTask1.notes.push(note2);
      const updatedTask2 = await dataSource.save(updatedTask1);

      expect(updatedTask2.notes).toHaveLength(2);
      expect(updatedTask2.notes.map(n => n.note)).toContain('First note');
      expect(updatedTask2.notes.map(n => n.note)).toContain('Second note');
    });

    it('should remove elements from composition array', async () => {
      // Start with two notes
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date();
      note1.note = 'Note to keep';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date();
      note2.note = 'Note to remove';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      const taskWithTwoNotes = await dataSource.save(savedTask);

      expect(taskWithTwoNotes.notes).toHaveLength(2);

      // Get the note to remove and its ID
      const noteToRemove = taskWithTwoNotes.notes.find(n => n.note === 'Note to remove');
      expect(noteToRemove).toBeDefined();
      const noteToRemoveId = noteToRemove!.id;

      // First, manually delete the composition element from the database
      await dataSource.delete(TaskNote, noteToRemoveId!);

      // Then update the parent's array to reflect the removal
      taskWithTwoNotes.notes = taskWithTwoNotes.notes.filter(n => n.note !== 'Note to remove');
      const taskWithOneNote = await dataSource.save(taskWithTwoNotes);

      expect(taskWithOneNote.notes).toHaveLength(1);
      expect(taskWithOneNote.notes[0]!.note).toBe('Note to keep');

      // Verify the removed note was actually deleted from the database
      const deletedNote = await dataSource.findOneBy(TaskNote, { id: noteToRemoveId! });
      expect(deletedNote).toBeNull();
    });

    it('should modify elements in composition array', async () => {
      // Add a note
      const note = new TaskNote();
      note.user = savedUser1;
      note.timestamp = new Date();
      note.note = 'Original note content';
      note.owner = savedTask;

      savedTask.notes = [note];
      const taskWithNote = await dataSource.save(savedTask);

      expect(taskWithNote.notes[0]!.note).toBe('Original note content');

      // Modify the note
      taskWithNote.notes[0]!.note = 'Modified note content';
      const taskWithModifiedNote = await dataSource.save(taskWithNote);

      expect(taskWithModifiedNote.notes[0]!.note).toBe('Modified note content');
    });
  });

  describe('Composition Reading and Loading', () => {
    let taskId: string;
    let userId: string;

    beforeEach(async () => {
      // Create user
      const user = new User();
      user.name = 'Composition Reader';
      user.email = 'reader@composition.com';
      const savedUser = await dataSource.save(user);
      userId = savedUser.id!;

      // Create task with composition
      const task = new Task();
      task.title = 'Task with Compositions';
      task.assignees = [];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      // Add multiple notes
      const note1 = new TaskNote();
      note1.user = savedUser;
      note1.timestamp = new Date('2023-01-01');
      note1.note = 'First composition note';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser;
      note2.timestamp = new Date('2023-01-02');
      note2.note = 'Second composition note';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      await dataSource.save(savedTask);
      taskId = savedTask.id!;
    });

    it('should load task with all composition children', async () => {
      const task = await dataSource.findOneBy(Task, { id: taskId });
      
      expect(task).toBeDefined();
      expect(task!.notes).toHaveLength(2);
      expect(task!.notes[0]!.note).toBeDefined();
      expect(task!.notes[0]!.user).toBeDefined();
      expect(task!.notes[0]!.user.name).toBe('Composition Reader');
      expect(task!.notes[0]!.timestamp).toBeDefined();
    });

    it('should load compositions with nested references', async () => {
      const task = await dataSource.findOneBy(Task, { id: taskId });
      
      expect(task).toBeDefined();
      const firstNote = task!.notes[0]!;
      
      expect(firstNote.user).toBeDefined();
      expect(firstNote.user.id).toBe(userId);
      expect(firstNote.user.name).toBe('Composition Reader');
      expect(firstNote.user.email).toBe('reader@composition.com');
    });

    it('should find tasks by composition properties', async () => {
      const tasks = await dataSource.findWithOptions(Task, {
        where: { notes: { note: 'First composition note' } }
      });
      
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.id).toBe(taskId);
    });

    it('should handle empty composition arrays', async () => {
      const emptyTask = new Task();
      emptyTask.title = 'Empty Task';
      emptyTask.assignees = [];
      emptyTask.notes = [];
      const savedEmptyTask = await dataSource.save(emptyTask);

      const retrievedTask = await dataSource.findOneBy(Task, { id: savedEmptyTask.id });
      
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.notes).toHaveLength(0);
      expect(retrievedTask!.assignees).toHaveLength(0);
    });
  });

  describe('Cascade Deletion', () => {
    it('should delete composition children when parent is deleted', async () => {
      // Create user
      const user = new User();
      user.name = 'Deletion Test User';
      user.email = 'delete@test.com';
      const savedUser = await dataSource.save(user);

      // Create task with notes
      const task = new Task();
      task.title = 'Task to Delete';
      task.assignees = [];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      // Add notes
      const note1 = new TaskNote();
      note1.user = savedUser;
      note1.timestamp = new Date();
      note1.note = 'Note 1';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser;
      note2.timestamp = new Date();
      note2.note = 'Note 2';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      await dataSource.save(savedTask);

      // Verify notes exist
      const noteCount = await dataSource.countBy(TaskNote, { owner: { id: savedTask.id } });
      expect(noteCount).toBe(2);

      // Delete the task
      await dataSource.delete(Task, savedTask.id!);

      // Verify task is deleted
      const deletedTask = await dataSource.findOneBy(Task, { id: savedTask.id });
      expect(deletedTask).toBeNull();

      // Verify composition notes are also deleted (cascade)
      const remainingNotes = await dataSource.countBy(TaskNote, { owner: { id: savedTask.id } });
      expect(remainingNotes).toBe(0);
    });

    it('should handle onDelete cascade for reference relationships', async () => {
      // Create project
      const project = new Project();
      project.name = 'Project to Delete';
      const savedProject = await dataSource.save(project);

      // Create task with project reference (onDelete: 'delete')
      const task = new Task();
      task.title = 'Task with Project Reference';
      task.project = savedProject;
      task.assignees = [];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      // Verify task exists
      const taskExists = await dataSource.existsBy(Task, { id: savedTask.id });
      expect(taskExists).toBe(true);

      // Delete the project
      await dataSource.delete(Project, savedProject.id!);

      // Verify task is also deleted due to onDelete: 'delete'
      const deletedTask = await dataSource.findOneBy(Task, { id: savedTask.id });
      expect(deletedTask).toBeNull();
    });

    it('should NOT delete referenced entities for many-to-many relationships', async () => {
      // Create users
      const user1 = new User();
      user1.name = 'User 1';
      user1.email = 'user1@ref.com';
      const savedUser1 = await dataSource.save(user1);

      const user2 = new User();
      user2.name = 'User 2';
      user2.email = 'user2@ref.com';
      const savedUser2 = await dataSource.save(user2);

      // Create task with user references
      const task = new Task();
      task.title = 'Task with User References';
      task.assignees = [savedUser1, savedUser2];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      // Delete the task
      await dataSource.delete(Task, savedTask.id!);

      // Verify users still exist (should NOT be deleted)
      const user1Exists = await dataSource.existsBy(User, { id: savedUser1.id });
      const user2Exists = await dataSource.existsBy(User, { id: savedUser2.id });
      
      expect(user1Exists).toBe(true);
      expect(user2Exists).toBe(true);
    });
  });

  describe('Shared Composition Relationships', () => {
    let sharedNote: Note;
    let savedUser: User;

    beforeEach(async () => {
      // Create user
      const user = new User();
      user.name = 'Shared Note User';
      user.email = 'shared@note.com';
      savedUser = await dataSource.save(user);

      // Create shared note
      const note = new Note();
      note.user = savedUser;
      note.timestamp = new Date();
      note.content = 'This is a shared note';
      sharedNote = await dataSource.save(note);
    });

    it('should allow multiple parents to share the same composition', async () => {
      // Create epic with shared note
      const epic = new Epic();
      epic.title = 'Epic with Shared Note';
      epic.notes = [sharedNote];
      const savedEpic = await dataSource.save(epic);

      // Create story with the same shared note
      const story = new Story();
      story.title = 'Story with Shared Note';
      story.notes = [sharedNote];
      const savedStory = await dataSource.save(story);

      // Verify both parents have the shared note
      const retrievedEpic = await dataSource.findOneBy(Epic, { id: savedEpic.id });
      const retrievedStory = await dataSource.findOneBy(Story, { id: savedStory.id });

      expect(retrievedEpic!.notes).toHaveLength(1);
      expect(retrievedStory!.notes).toHaveLength(1);
      expect(retrievedEpic!.notes[0]!.id).toBe(sharedNote.id);
      expect(retrievedStory!.notes[0]!.id).toBe(sharedNote.id);
      expect(retrievedEpic!.notes[0]!.content).toBe('This is a shared note');
      expect(retrievedStory!.notes[0]!.content).toBe('This is a shared note');
    });

    it('should not delete shared composition when one parent is deleted', async () => {
      // Create epic and story both sharing the note
      const epic = new Epic();
      epic.title = 'Epic to Delete';
      epic.notes = [sharedNote];
      const savedEpic = await dataSource.save(epic);

      const story = new Story();
      story.title = 'Story to Keep';
      story.notes = [sharedNote];
      const savedStory = await dataSource.save(story);

      // Delete the epic
      await dataSource.delete(Epic, savedEpic.id!);

      // Verify note still exists
      const noteStillExists = await dataSource.existsBy(Note, { id: sharedNote.id });
      expect(noteStillExists).toBe(true);

      // Verify story still has the note
      const remainingStory = await dataSource.findOneBy(Story, { id: savedStory.id });
      expect(remainingStory!.notes).toHaveLength(1);
      expect(remainingStory!.notes[0]!.id).toBe(sharedNote.id);
    });

    it('should handle adding and removing shared compositions', async () => {
      // Create epic
      const epic = new Epic();
      epic.title = 'Epic for Shared Operations';
      epic.notes = [];
      const savedEpic = await dataSource.save(epic);

      // Add shared note
      savedEpic.notes = [sharedNote];
      const epicWithNote = await dataSource.save(savedEpic);

      expect(epicWithNote.notes).toHaveLength(1);
      expect(epicWithNote.notes[0]!.id).toBe(sharedNote.id);

      // Remove shared note
      epicWithNote.notes = [];
      const epicWithoutNote = await dataSource.save(epicWithNote);

      expect(epicWithoutNote.notes).toHaveLength(0);

      // Verify note still exists independently
      const noteStillExists = await dataSource.existsBy(Note, { id: sharedNote.id });
      expect(noteStillExists).toBe(true);
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle null reference relationships', async () => {
      const task = new Task();
      task.title = 'Task without Project';
      task.project = null as any;
      task.assignees = [];
      task.notes = [];
      
      const savedTask = await dataSource.save(task);
      const retrievedTask = await dataSource.findOneBy(Task, { id: savedTask.id });

      expect(retrievedTask!.project).toBeNull();
    });

    it('should handle empty arrays in relationships', async () => {
      const task = new Task();
      task.title = 'Task with Empty Arrays';
      task.assignees = [];
      task.notes = [];
      
      const savedTask = await dataSource.save(task);
      const retrievedTask = await dataSource.findOneBy(Task, { id: savedTask.id });

      expect(retrievedTask!.assignees).toHaveLength(0);
      expect(retrievedTask!.notes).toHaveLength(0);
    });

    it('should handle complex nested queries', async () => {
      // Setup complex data
      const user = new User();
      user.name = 'Complex User';
      user.email = 'complex@test.com';
      const savedUser = await dataSource.save(user);

      const project = new Project();
      project.name = 'Complex Project';
      const savedProject = await dataSource.save(project);

      const task = new Task();
      task.title = 'Complex Task';
      task.project = savedProject;
      task.assignees = [savedUser];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      const note = new TaskNote();
      note.user = savedUser;
      note.timestamp = new Date();
      note.note = 'Complex note';
      note.owner = savedTask;

      savedTask.notes = [note];
      await dataSource.save(savedTask);

      // Query with nested conditions
      const tasks = await dataSource.findWithOptions(Task, {
        where: {
          project: { name: 'Complex Project' },
          assignees: { email: 'complex@test.com' },
          notes: { note: 'Complex note' }
        }
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Complex Task');
    });

    it('should handle updating relationship references', async () => {
      // Create initial data
      const project1 = new Project();
      project1.name = 'Original Project';
      const savedProject1 = await dataSource.save(project1);

      const project2 = new Project();
      project2.name = 'New Project';
      const savedProject2 = await dataSource.save(project2);

      const task = new Task();
      task.title = 'Task to Update';
      task.project = savedProject1;
      task.assignees = [];
      task.notes = [];
      const savedTask = await dataSource.save(task);

      // Update project reference
      savedTask.project = savedProject2;
      const updatedTask = await dataSource.save(savedTask);

      expect(updatedTask.project.id).toBe(savedProject2.id);
      expect(updatedTask.project.name).toBe('New Project');

      // Verify the change persisted
      const retrievedTask = await dataSource.findOneBy(Task, { id: savedTask.id });
      expect(retrievedTask!.project.id).toBe(savedProject2.id);
    });

    it('should handle bulk operations on relationships', async () => {
      // Create multiple users
      const users = [];
      for (let i = 1; i <= 5; i++) {
        const user = new User();
        user.name = `Bulk User ${i}`;
        user.email = `bulk${i}@test.com`;
        users.push(await dataSource.save(user));
      }

      // Create task with all users
      const task = new Task();
      task.title = 'Bulk Assignment Task';
      task.assignees = users;
      task.notes = [];
      const savedTask = await dataSource.save(task);

      expect(savedTask.assignees).toHaveLength(5);

      // Remove some assignees
      savedTask.assignees = users.slice(0, 3);
      const updatedTask = await dataSource.save(savedTask);

      expect(updatedTask.assignees).toHaveLength(3);

      // Verify the removed users still exist
      const userCount = await dataSource.countBy(User, {});
      expect(userCount).toBe(5);
    });
  });
});

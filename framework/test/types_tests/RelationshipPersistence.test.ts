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

// Test models for eager loading relationships
@Model()
class Department extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;
}

@Model()
class Employee extends PersistentModel {
  @Field({ required: true })
  @Text()
  name!: string;

  @Field({ required: true })
  @Text()
  email!: string;

  @Field({ required: false })
  @Reference({ load: true })
  department!: Department;
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
    const models = [User, Project, Task, TaskNote, Note, Epic, Story, Department, Employee];
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

    await dataSource.initialize();
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

      await dataSource.save(task);

      const savedTask = await dataSource.findOne(Task, {
        where: { title: 'Test Task' }
      });

      expect(savedTask!.id).toBeDefined();
      expect(savedTask!.project).toBeUndefined();

      const retrievedTask = await dataSource.findOne(Task, {
        where: { id: savedTask!.id },
        relations: { project: true }
      });
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.project).toBeDefined();
      expect(retrievedTask!.project.id).toBe(savedProject.id);
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
      await dataSource.save(savedTask);

      const updatedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: { user: true } }
      });
      expect(updatedTask?.notes).toHaveLength(1);
      expect(updatedTask?.notes[0]!.note).toBe('Test note content');
      expect(updatedTask?.notes[0]!.user.name).toBe('Test User');
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

      await dataSource.save(task);

      const savedTask = await dataSource.findOne(Task, {
        where: { title: 'Multi-assignee Task' },
        relations: { assignees: true }
      });

      expect(savedTask).toBeDefined();
      expect(savedTask!.assignees).toHaveLength(2);
      expect(savedTask!.assignees.map(u => u.name)).toContain('User 1');
      expect(savedTask!.assignees.map(u => u.name)).toContain('User 2');
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
      await dataSource.save(savedTask);

      const finalTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id }
      });

      expect(finalTask!.project).toBeUndefined();

      const retrievedTask = await dataSource.findOne(Task, {
        where: { id: finalTask!.id },
        relations: { project: true, assignees: true, notes: { user: true } }
      });

      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.assignees).toHaveLength(1);
      expect(retrievedTask!.assignees[0]!.name).toBe('Task Creator');
      expect(retrievedTask!.notes).toHaveLength(1);
      expect(retrievedTask!.notes[0]!.note).toBe('Complex task note');
      expect(retrievedTask!.notes[0]!.user.name).toBe('Task Creator');
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
      const tasks = await dataSource.findWithOptions(Task, {
        where: { project: { id: savedProject.id } },
        relations: { project: true }
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Query Test Task');
      expect(tasks[0]!.project.id).toBe(savedProject.id);
    });

    it('should find tasks by assignee reference', async () => {
      const tasks = await dataSource.findWithOptions(Task, {
        where: { assignees: { id: savedUser.id } },
        relations: { assignees: true }
      });

      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.title).toBe('Query Test Task');
      expect(tasks[0]!.assignees.some(u => u.id === savedUser.id)).toBe(true);
    });

    it('should find one task with relations loaded', async () => {
      const task = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { project: true, assignees: true, notes: { user: true } }
      });

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

  describe('Parent-Centric Composition Operations', () => {
    let savedTask: Task;
    let savedUser1: User;
    let savedUser2: User;

    beforeEach(async () => {
      // Create users
      const user1 = new User();
      user1.name = 'Parent Operation User 1';
      user1.email = 'parent1@ops.com';
      savedUser1 = await dataSource.save(user1);

      const user2 = new User();
      user2.name = 'Parent Operation User 2';
      user2.email = 'parent2@ops.com';
      savedUser2 = await dataSource.save(user2);

      // Create task
      const task = new Task();
      task.title = 'Parent-Centric Operations Task';
      task.assignees = [];
      task.notes = [];
      savedTask = await dataSource.save(task);
    });

    it('should add composition elements by modifying parent array', async () => {
      // Initially empty
      expect(savedTask.notes).toHaveLength(0);

      // Add first note through parent
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date('2024-01-01');
      note1.note = 'First parent-added note';
      note1.owner = savedTask;

      savedTask.notes = [note1];
      const taskWithOneNote = await dataSource.save(savedTask);

      expect(taskWithOneNote.notes).toHaveLength(1);
      expect(taskWithOneNote.notes[0]!.note).toBe('First parent-added note');
      expect(taskWithOneNote.notes[0]!.id).toBeDefined();

      // Add second note through parent by extending array
      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date('2024-01-02');
      note2.note = 'Second parent-added note';
      note2.owner = savedTask;

      taskWithOneNote.notes.push(note2);
      const taskWithTwoNotes = await dataSource.save(taskWithOneNote);

      expect(taskWithTwoNotes.notes).toHaveLength(2);
      expect(taskWithTwoNotes.notes.map(n => n.note)).toContain('First parent-added note');
      expect(taskWithTwoNotes.notes.map(n => n.note)).toContain('Second parent-added note');

      // Verify both notes have IDs and exist in database
      expect(taskWithTwoNotes.notes.every(n => n.id !== undefined)).toBe(true);
      
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });
      expect(reloadedTask!.notes).toHaveLength(2);
    });

    it('should remove composition elements by explicit deletion then parent update', async () => {
      // Start with multiple notes
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date();
      note1.note = 'Keep this note';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date();
      note2.note = 'Remove this note';
      note2.owner = savedTask;

      const note3 = new TaskNote();
      note3.user = savedUser1;
      note3.timestamp = new Date();
      note3.note = 'Also keep this note';
      note3.owner = savedTask;

      savedTask.notes = [note1, note2, note3];
      await dataSource.save(savedTask);

      const taskWithThreeNotes = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(taskWithThreeNotes!.notes).toHaveLength(3);
      const noteToRemoveId = taskWithThreeNotes!.notes.find(n => n.note === 'Remove this note')!.id;

      await dataSource.delete(TaskNote, noteToRemoveId!);

      const resultAfterDeletion = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(resultAfterDeletion!.notes).toHaveLength(2);
      expect(resultAfterDeletion!.notes.map(n => n.note)).toEqual(['Keep this note', 'Also keep this note']);

      // Verify removed note was deleted from database
      const deletedNote = await dataSource.findOneBy(TaskNote, { id: noteToRemoveId! });
      expect(deletedNote).toBeNull();
    });

    it('should update composition elements through parent object properties', async () => {
      // Add initial note
      const note = new TaskNote();
      note.user = savedUser1;
      note.timestamp = new Date('2024-01-01');
      note.note = 'Original content';
      note.owner = savedTask;

      savedTask.notes = [note];
      const taskWithNote = await dataSource.save(savedTask);

      const originalNoteId = taskWithNote.notes[0]!.id;

      // Update through parent's note reference
      taskWithNote.notes[0]!.note = 'Updated content via parent';
      taskWithNote.notes[0]!.timestamp = new Date('2024-01-15');
      taskWithNote.notes[0]!.user = savedUser2; // Change reference too

     await dataSource.save(taskWithNote);

      const taskWithUpdatedNote = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: { user: true } }
      });

      expect(taskWithUpdatedNote!.notes[0]!.note).toBe('Updated content via parent');
      expect(taskWithUpdatedNote!.notes[0]!.timestamp).toEqual(new Date('2024-01-15'));
      expect(taskWithUpdatedNote!.notes[0]!.id).toBe(originalNoteId); // Same object, updated

      // Verify changes persisted
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: { user: true } }
      });

      expect(reloadedTask!.notes[0]!.note).toBe('Updated content via parent');
      expect(reloadedTask!.notes[0]!.user.id).toBe(savedUser2.id);
    });

    it('should handle mixed parent operations with explicit deletions', async () => {
      // Start with initial notes
      const initialNote1 = new TaskNote();
      initialNote1.user = savedUser1;
      initialNote1.timestamp = new Date('2024-01-01');
      initialNote1.note = 'Update me';
      initialNote1.owner = savedTask;

      const initialNote2 = new TaskNote();
      initialNote2.user = savedUser2;
      initialNote2.timestamp = new Date('2024-01-02');
      initialNote2.note = 'Delete me';
      initialNote2.owner = savedTask;

      savedTask.notes = [initialNote1, initialNote2];
      const taskWithInitialNotes = await dataSource.save(savedTask);

      expect(taskWithInitialNotes.notes).toHaveLength(2);
      const noteToDeleteId = taskWithInitialNotes.notes.find(n => n.note === 'Delete me')!.id;
      const noteToUpdateId = taskWithInitialNotes.notes.find(n => n.note === 'Update me')!.id;

      // 1. Update existing note
      const noteToUpdate = taskWithInitialNotes.notes.find(n => n.note === 'Update me')!;
      noteToUpdate.note = 'I was updated!';
      noteToUpdate.timestamp = new Date('2024-01-10');

      await dataSource.save(taskWithInitialNotes);
      
      // 2. Explicitly delete the note to be removed
      await dataSource.delete(TaskNote, noteToDeleteId!);
      
      
      const taskWithUpdatedNotes = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      // 4. Add two new notes
      const newNote1 = new TaskNote();
      newNote1.user = savedUser2;
      newNote1.timestamp = new Date('2024-01-03');
      newNote1.note = 'New note 1';
      newNote1.owner = savedTask;

      const newNote2 = new TaskNote();
      newNote2.user = savedUser1;
      newNote2.timestamp = new Date('2024-01-04');
      newNote2.note = 'New note 2';
      newNote2.owner = savedTask;

      taskWithUpdatedNotes!.notes.push(newNote1, newNote2);

      // Save all changes in one operation
      const finalTask = await dataSource.save(taskWithUpdatedNotes!);

      expect(finalTask.notes).toHaveLength(3);
      expect(finalTask.notes.map(n => n.note).sort()).toEqual([
        'I was updated!', 'New note 1', 'New note 2'
      ]);

      // Verify database state
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(reloadedTask!.notes).toHaveLength(3);
      
      // Verify update preserved ID
      const updatedNote = reloadedTask!.notes.find(n => n.note === 'I was updated!')!;
      expect(updatedNote.id).toBe(noteToUpdateId);

      // Verify deletion worked
      const deletedNote = await dataSource.findOneBy(TaskNote, { id: noteToDeleteId! });
      expect(deletedNote).toBeNull();

      // Verify new notes got IDs
      const newNotes = reloadedTask!.notes.filter(n => n.note.startsWith('New note'));
      expect(newNotes).toHaveLength(2);
      expect(newNotes.every(n => n.id !== undefined)).toBe(true);
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

    it('should remove elements from composition array with explicit deletion', async () => {
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

      // Get the note to remove and its ID for verification
      const noteToRemove = taskWithTwoNotes.notes.find(n => n.note === 'Note to remove');
      expect(noteToRemove).toBeDefined();
      const noteToRemoveId = noteToRemove!.id;

      // Current framework pattern: explicit deletion first
      await dataSource.delete(TaskNote, noteToRemoveId!);

      // Then update parent's array to reflect the removal
      taskWithTwoNotes.notes = taskWithTwoNotes.notes.filter(n => n.note !== 'Note to remove');
      const taskWithOneNote = await dataSource.save(taskWithTwoNotes);

      expect(taskWithOneNote.notes).toHaveLength(1);
      expect(taskWithOneNote.notes[0]!.note).toBe('Note to keep');

      // Verify the removed note was actually deleted from the database
      const deletedNote = await dataSource.findOneBy(TaskNote, { id: noteToRemoveId! });
      expect(deletedNote).toBeNull();
    });

    it('should modify elements in composition array through parent', async () => {
      // Add a note
      const note = new TaskNote();
      note.user = savedUser1;
      note.timestamp = new Date();
      note.note = 'Original note content';
      note.owner = savedTask;

      savedTask.notes = [note];
      const taskWithNote = await dataSource.save(savedTask);

      expect(taskWithNote.notes[0]!.note).toBe('Original note content');

      // Store the note ID for verification
      const noteId = taskWithNote.notes[0]!.id;

      // Modify the note through parent object
      taskWithNote.notes[0]!.note = 'Modified note content';
      taskWithNote.notes[0]!.timestamp = new Date('2024-01-15');
      const taskWithModifiedNote = await dataSource.save(taskWithNote);

      expect(taskWithModifiedNote.notes[0]!.note).toBe('Modified note content');
      expect(taskWithModifiedNote.notes[0]!.timestamp).toEqual(new Date('2024-01-15'));

      // Verify the changes persisted in the database
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(reloadedTask!.notes[0]!.note).toBe('Modified note content');
      expect(reloadedTask!.notes[0]!.id).toBe(noteId); // Same object, just updated
    });

    it('should handle mixed operations on composition array with explicit deletions', async () => {
      // Start with two notes
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date('2024-01-01');
      note1.note = 'Note to keep and modify';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date('2024-01-02');
      note2.note = 'Note to remove';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      const taskWithTwoNotes = await dataSource.save(savedTask);

      expect(taskWithTwoNotes.notes).toHaveLength(2);

      // Store IDs for verification
      const note1Id = taskWithTwoNotes.notes.find(n => n.note === 'Note to keep and modify')!.id;
      const note2Id = taskWithTwoNotes.notes.find(n => n.note === 'Note to remove')!.id;

      // Mixed operations: update existing, remove one, add new
      // 1. Modify existing note
      const existingNote = taskWithTwoNotes.notes.find(n => n.note === 'Note to keep and modify')!;
      existingNote.note = 'Modified note content';
      existingNote.timestamp = new Date('2024-01-10');

      await dataSource.save(taskWithTwoNotes);

      // 2. Explicitly delete the note to be removed
      await dataSource.delete(TaskNote, note2Id!);

      // 3. Remove from parent array
      const taskWithOneNote = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      // 4. Add a new note
      const newNote = new TaskNote();
      newNote.user = savedUser1;
      newNote.timestamp = new Date('2024-01-15');
      newNote.note = 'New added note';
      newNote.owner = savedTask;
      taskWithOneNote!.notes.push(newNote);

      // Save all changes through parent
      const updatedTask = await dataSource.save(taskWithOneNote!);

      expect(updatedTask.notes).toHaveLength(2);
      expect(updatedTask.notes.map(n => n.note)).toContain('Modified note content');
      expect(updatedTask.notes.map(n => n.note)).toContain('New added note');
      expect(updatedTask.notes.map(n => n.note)).not.toContain('Note to remove');

      // Verify database state
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: { user: true } }
      });

      expect(reloadedTask!.notes).toHaveLength(2);
      
      // Verify the modified note kept its ID
      const modifiedNote = reloadedTask!.notes.find(n => n.note === 'Modified note content')!;
      expect(modifiedNote.id).toBe(note1Id);
      expect(modifiedNote.timestamp).toEqual(new Date('2024-01-10'));

      // Verify the new note got an ID
      const addedNote = reloadedTask!.notes.find(n => n.note === 'New added note')!;
      expect(addedNote.id).toBeDefined();
      expect(addedNote.timestamp).toEqual(new Date('2024-01-15'));

      // Verify the removed note was deleted from database
      const deletedNote = await dataSource.findOneBy(TaskNote, { id: note2Id! });
      expect(deletedNote).toBeNull();
    });

    it('should replace entire composition array with explicit cleanup', async () => {
      // Start with two notes
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date();
      note1.note = 'Original note 1';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date();
      note2.note = 'Original note 2';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      const taskWithOriginalNotes = await dataSource.save(savedTask);

      expect(taskWithOriginalNotes.notes).toHaveLength(2);
      const originalNoteIds = taskWithOriginalNotes.notes.map(n => n.id);

      // Explicitly delete all existing notes
      for (const noteId of originalNoteIds) {
        await dataSource.delete(TaskNote, noteId!);
      }

      // Replace entire array with new notes
      const newNote1 = new TaskNote();
      newNote1.user = savedUser1;
      newNote1.timestamp = new Date();
      newNote1.note = 'Replacement note 1';
      newNote1.owner = savedTask;

      const newNote2 = new TaskNote();
      newNote2.user = savedUser2;
      newNote2.timestamp = new Date();
      newNote2.note = 'Replacement note 2';
      newNote2.owner = savedTask;

      const newNote3 = new TaskNote();
      newNote3.user = savedUser1;
      newNote3.timestamp = new Date();
      newNote3.note = 'Replacement note 3';
      newNote3.owner = savedTask;

      // Replace entire array
      taskWithOriginalNotes.notes = [newNote1, newNote2, newNote3];
      const taskWithReplacedNotes = await dataSource.save(taskWithOriginalNotes);

      expect(taskWithReplacedNotes.notes).toHaveLength(3);
      expect(taskWithReplacedNotes.notes.map(n => n.note)).toEqual([
        'Replacement note 1',
        'Replacement note 2', 
        'Replacement note 3'
      ]);

      // Verify old notes were deleted from database
      for (const originalId of originalNoteIds) {
        const deletedNote = await dataSource.findOneBy(TaskNote, { id: originalId! });
        expect(deletedNote).toBeNull();
      }

      // Verify new notes exist in database
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(reloadedTask!.notes).toHaveLength(3);
      expect(reloadedTask!.notes.every(n => n.id !== undefined)).toBe(true);
    });

    it('should clear composition array with explicit cleanup', async () => {
      // Start with notes
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date();
      note1.note = 'Note to clear 1';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date();
      note2.note = 'Note to clear 2';
      note2.owner = savedTask;

      savedTask.notes = [note1, note2];
      const taskWithNotes = await dataSource.save(savedTask);

      expect(taskWithNotes.notes).toHaveLength(2);
      const noteIds = taskWithNotes.notes.map(n => n.id);

      // Explicitly delete all notes
      for (const noteId of noteIds) {
        await dataSource.delete(TaskNote, noteId!);
      }

      // Clear the array through parent
      taskWithNotes.notes = [];
      const taskWithoutNotes = await dataSource.save(taskWithNotes);

      expect(taskWithoutNotes.notes).toHaveLength(0);

      // Verify notes were deleted from database
      for (const noteId of noteIds) {
        const deletedNote = await dataSource.findOneBy(TaskNote, { id: noteId! });
        expect(deletedNote).toBeNull();
      }

      // Verify task still exists with empty notes array
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(reloadedTask).toBeDefined();
      expect(reloadedTask!.notes).toHaveLength(0);
    });

    // TODO: Reordering composition arrays requires additional framework development
    // The current implementation may not preserve all elements during reordering operations
    it.skip('should handle reordering composition array through parent', async () => {
      // Start with three notes in specific order
      const note1 = new TaskNote();
      note1.user = savedUser1;
      note1.timestamp = new Date('2024-01-01');
      note1.note = 'First note';
      note1.owner = savedTask;

      const note2 = new TaskNote();
      note2.user = savedUser2;
      note2.timestamp = new Date('2024-01-02');
      note2.note = 'Second note';
      note2.owner = savedTask;

      const note3 = new TaskNote();
      note3.user = savedUser1;
      note3.timestamp = new Date('2024-01-03');
      note3.note = 'Third note';
      note3.owner = savedTask;

      savedTask.notes = [note1, note2, note3];
      const taskWithOrderedNotes = await dataSource.save(savedTask);

      expect(taskWithOrderedNotes.notes).toHaveLength(3);
      expect(taskWithOrderedNotes.notes.map(n => n.note)).toEqual([
        'First note', 'Second note', 'Third note'
      ]);

      // Store IDs to verify they remain the same after reordering
      const originalIds = taskWithOrderedNotes.notes.map(n => n.id);

      // Reorder the array through parent
      const reorderedNotes = [
        taskWithOrderedNotes.notes[2]!, // Third note first
        taskWithOrderedNotes.notes[0]!, // First note second  
        taskWithOrderedNotes.notes[1]!  // Second note third
      ];

      taskWithOrderedNotes.notes = reorderedNotes;
      const taskWithReorderedNotes = await dataSource.save(taskWithOrderedNotes);

      expect(taskWithReorderedNotes.notes).toHaveLength(3);
      expect(taskWithReorderedNotes.notes.map(n => n.note)).toEqual([
        'Third note', 'First note', 'Second note'
      ]);

      // Verify IDs are preserved (same objects, just reordered)
      const newIds = taskWithReorderedNotes.notes.map(n => n.id);
      expect(newIds.sort()).toEqual(originalIds.sort());

      // Verify order persisted in database
      const reloadedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { notes: true }
      });

      expect(reloadedTask!.notes.map(n => n.note)).toEqual([
        'Third note', 'First note', 'Second note'
      ]);
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
      const task = await dataSource.findOne(Task, {
        where: { id: taskId },
        relations: { project: true, assignees: true, notes: { user: true } }
      });

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

      const reloadedFirstNote = await dataSource.findOne(TaskNote, {
        where: { id: firstNote.id },
        relations: { user: true }
      });

      expect(reloadedFirstNote).toBeDefined();
      expect(reloadedFirstNote!.user).toBeDefined();
      expect(reloadedFirstNote!.user.id).toBe(userId);
      expect(reloadedFirstNote!.user.name).toBe('Composition Reader');
      expect(reloadedFirstNote!.user.email).toBe('reader@composition.com');
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

      const retrievedTask = await dataSource.findOne(Task,
        {
          where: { id: savedEmptyTask.id },
          relations: { assignees: true }
        });

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

      await dataSource.save(task);

      const savedTask = await dataSource.findOne(Task, {
        where: { title: 'Task without Project' },
        relations: { project: true }
      });

      expect(savedTask!.id).toBeDefined();
      expect(savedTask!.project).toBeNull();

      const retrievedTask = await dataSource.findOne(Task,
        {
          where: { id: savedTask!.id },
          relations: { project: true }
        });

      expect(retrievedTask!.project).toBeNull();
    });

    it('should handle empty arrays in relationships', async () => {
      const task = new Task();
      task.title = 'Task with Empty Arrays';
      task.assignees = [];
      task.notes = [];

      const savedTask = await dataSource.save(task);
      const retrievedTask = await dataSource.findOne(Task,
        {
          where: { id: savedTask.id },
          relations: { assignees: true }
        });

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
      await dataSource.save(savedTask);

      const updatedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { project: true }
      });

      expect(updatedTask!.project.id).toBe(savedProject2.id);
      expect(updatedTask!.project.name).toBe('New Project');

      // Verify the change persisted
      const retrievedTask = await dataSource.findOne(Task, {
        where: { id: savedTask.id },
        relations: { project: true }
      });
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
      await dataSource.save(task);

      const savedTask = await dataSource.findOne(Task, {
        where: { title: 'Bulk Assignment Task' },
        relations: { assignees: true }
      });

      expect(savedTask!.assignees).toHaveLength(5);

      // Remove some assignees
      savedTask!.assignees = users.slice(0, 3);
      await dataSource.save(savedTask!);

      const updatedTask = await dataSource.findOne(Task, {
        where: { id: savedTask!.id },
        relations: { assignees: true }
      });

      expect(updatedTask!.assignees).toHaveLength(3);

      // Verify the removed users still exist
      const userCount = await dataSource.countBy(User, {});
      expect(userCount).toBe(5);
    });
  });

  describe('Eager Loading Relationships', () => {
    it('should eagerly load reference relationships with load: true', async () => {
      // Create a department
      const department = new Department();
      department.name = 'Engineering';
      const savedDepartment = await dataSource.save(department);

      // Create an employee with department reference
      const employee = new Employee();
      employee.name = 'Jane Developer';
      employee.email = 'jane.developer@company.com';
      employee.department = savedDepartment;

      const savedEmployee = await dataSource.save(employee);

      expect(savedEmployee.id).toBeDefined();
      
      // With eager loading (load: true), relationships should be loaded automatically
      // without needing to specify relations in the query
      const retrievedEmployee = await dataSource.findOneBy(Employee, { id: savedEmployee.id });

      expect(retrievedEmployee).toBeDefined();
      expect(retrievedEmployee!.name).toBe('Jane Developer');
      
      // Department should be eagerly loaded
      expect(retrievedEmployee!.department).toBeDefined();
      expect(retrievedEmployee!.department.id).toBe(savedDepartment.id);
      expect(retrievedEmployee!.department.name).toBe('Engineering');
    });

    it('should eagerly load relationships in findWithOptions queries', async () => {
      // Create department
      const department = new Department();
      department.name = 'Sales';
      const savedDepartment = await dataSource.save(department);

      // Create employee
      const employee = new Employee();
      employee.name = 'Bob Salesperson';
      employee.email = 'bob.sales@company.com';
      employee.department = savedDepartment;
      const savedEmployee = await dataSource.save(employee);

      // Query employees by department - relationships should be eagerly loaded
      const employees = await dataSource.findWithOptions(Employee, {
        where: { department: { name: 'Sales' } }
      });

      expect(employees).toHaveLength(1);
      expect(employees[0]!.name).toBe('Bob Salesperson');
      
      // Department should be eagerly loaded without specifying relations
      expect(employees[0]!.department).toBeDefined();
      expect(employees[0]!.department.name).toBe('Sales');
    });

    it('should handle null eager-loaded relationships', async () => {
      // Create employee without department
      const employee = new Employee();
      employee.name = 'Freelancer';
      employee.email = 'freelancer@company.com';
      employee.department = null as any;

      const savedEmployee = await dataSource.save(employee);
      const retrievedEmployee = await dataSource.findOneBy(Employee, { id: savedEmployee.id });

      expect(retrievedEmployee).toBeDefined();
      expect(retrievedEmployee!.name).toBe('Freelancer');
      expect(retrievedEmployee!.department).toBeNull();
    });
  });
});

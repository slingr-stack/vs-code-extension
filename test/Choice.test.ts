import { Task, TaskStatus, Priority } from "./model/Task";

describe("Choice Field Type", () => {
  describe("validation-tests", () => {
    it("should pass validation for a valid task with default enum values", async () => {
      const task = new Task();
      task.title = "Test Task";

      const errors = await task.validate();
      expect(errors).toStrictEqual([]);
      
      // Check default values
      expect(task.status).toBe(TaskStatus.ToDo);
      expect(task.priority).toBe(Priority.Medium);
    });

    it("should pass validation when enum values are explicitly set", async () => {
      const task = new Task();
      task.title = "Important Task";
      task.status = TaskStatus.InProgress;
      task.priority = Priority.High;

      const errors = await task.validate();
      expect(errors).toStrictEqual([]);
    });

    it("should handle all enum values for TaskStatus", () => {
      const task = new Task();
      task.title = "Status Test";

      // Test all TaskStatus values
      const statuses = [TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];
      
      for (const status of statuses) {
        task.status = status;
        const json = task.toJSON();
        const restored = Task.fromJSON(json);
        
        expect(restored.status).toBe(status);
      }
    });

    it("should handle all enum values for Priority", () => {
      const task = new Task();
      task.title = "Priority Test";

      // Test all Priority values
      const priorities = [Priority.Low, Priority.Medium, Priority.High];
      
      for (const priority of priorities) {
        task.priority = priority;
        const json = task.toJSON();
        const restored = Task.fromJSON(json);
        
        expect(restored.priority).toBe(priority);
      }
    });
  });

  describe("required-tests", () => {
    it("should pass validation when optional choice fields have defaults", async () => {
      const task = new Task();
      task.title = "Test Task";
      // status and priority have defaults

      const errors = await task.validate();
      expect(errors).toStrictEqual([]);
    });
  });

  describe("JSON-conversion-tests", () => {
    it("should serialize enum values correctly in toJSON", () => {
      const task = new Task();
      task.title = "Test Task";
      task.status = TaskStatus.Done;
      task.priority = Priority.Low;

      const json = task.toJSON();

      expect(json).toEqual({
        title: "Test Task",
        status: "done", // String enum value
        priority: 1,    // Numeric enum value
      });
    });

    it("should deserialize enum values correctly from JSON", () => {
      const jsonData = {
        title: "Restored Task",
        status: "inProgress",
        priority: 3,
      };

      const task = Task.fromJSON(jsonData);

      expect(task.title).toBe("Restored Task");
      expect(task.status).toBe(TaskStatus.InProgress);
      expect(task.priority).toBe(Priority.High);
      expect(task instanceof Task).toBe(true);
    });

    it("should handle round-trip JSON conversion", () => {
      // Create original task
      const originalTask = new Task();
      originalTask.title = "Round Trip Task";
      originalTask.status = TaskStatus.InProgress;
      originalTask.priority = Priority.High;

      // Convert to JSON
      const json = originalTask.toJSON();

      // Convert back from JSON
      const restoredTask = Task.fromJSON(json);

      // Verify everything matches
      expect(restoredTask.title).toBe(originalTask.title);
      expect(restoredTask.status).toBe(originalTask.status);
      expect(restoredTask.priority).toBe(originalTask.priority);
      expect(restoredTask instanceof Task).toBe(true);
    });
  });
});

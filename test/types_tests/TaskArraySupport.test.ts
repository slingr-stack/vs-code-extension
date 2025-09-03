import { Task, TaskStatus, Priority } from "../model/Task";

describe("Task Model with HTML Array Support", () => {
    it("should create and validate a task with HTML notes array", async () => {
        const task = new Task();
        task.title = "Complete project documentation";
        task.status = TaskStatus.ToDo;
        task.priority = Priority.High;
        task.notes = [
            "<h3>Requirements</h3><p>Document all features</p>",
            "<h3>Timeline</h3><p>Due by end of week</p>",
            "<strong>Note:</strong> Include code examples"
        ];
        
        const errors = await task.validate();
        expect(errors).toHaveLength(0);
        
        const json = task.toJSON();
        expect(json.notes).toEqual([
            "<h3>Requirements</h3><p>Document all features</p>",
            "<h3>Timeline</h3><p>Due by end of week</p>",
            "<strong>Note:</strong> Include code examples"
        ]);
        
        const restored = Task.fromJSON(json);
        expect(restored.notes).toEqual([
            "<h3>Requirements</h3><p>Document all features</p>",
            "<h3>Timeline</h3><p>Due by end of week</p>",
            "<strong>Note:</strong> Include code examples"
        ]);
    });

    it("should handle empty notes array", async () => {
        const task = new Task();
        task.title = "Simple task";
        task.status = TaskStatus.InProgress;
        task.priority = Priority.Low;
        task.notes = [];
        
        const errors = await task.validate();
        expect(errors).toHaveLength(0);
    });

    it("should work without notes since it's optional", async () => {
        const task = new Task();
        task.title = "Minimal task";
        task.status = TaskStatus.Done;
        task.priority = Priority.Medium;
        
        const errors = await task.validate();
        expect(errors).toHaveLength(0);
    });

    it("should fail validation if notes array contains non-strings", async () => {
        const task = new Task();
        task.title = "Task with invalid notes";
        task.status = TaskStatus.ToDo;
        task.priority = Priority.Medium;
        task.notes = [
            "<p>Valid HTML note</p>",
            123 as any, // Invalid: number
            "<p>Another valid note</p>"
        ];
        
        const errors = await task.validate();
        expect(errors.length).toBeGreaterThan(0);
        
        const notesError = errors.find(e => e.property === 'notes');
        expect(notesError).toBeDefined();
    });
});

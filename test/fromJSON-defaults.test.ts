import { Task, TaskStatus, Priority } from './model/Task';
import { Product } from './model/Product';
import { Project } from './model/Project';

describe('fromJSON with Default and Calculated Values', () => {
    describe('Default Values', () => {
        it('should fill status and priority with default values when missing from JSON', () => {
            const projectData = {
                name: 'Deserialized Project',
                startDate: '2023-02-01T00:00:00.000Z'
            };

            const taskData = {
                title: 'Deserialized Task',
                project: projectData
            };

            const task = Task.fromJSON(taskData);

            // Check that the task object was created correctly
            expect(task.title).toBe('Deserialized Task');
            expect(task.project).toBeDefined();
            expect(task.project.name).toBe('Deserialized Project');

            // Check that default values were applied for missing fields
            expect(task.status).toBe(TaskStatus.ToDo);  // 'toDo'
            expect(task.priority).toBe(Priority.Medium); // 2

            // Verify the task instance is valid
            expect(task instanceof Task).toBe(true);
        });

        it('should not override explicitly provided values with defaults', () => {
            const taskData = {
                title: 'Custom Task',
                status: TaskStatus.Done,
                priority: Priority.High
            };

            const task = Task.fromJSON(taskData);

            expect(task.title).toBe('Custom Task');
            expect(task.status).toBe(TaskStatus.Done);
            expect(task.priority).toBe(Priority.High);
        });

        it('should validate successfully when default values are applied', async () => {
            const taskData = {
                title: 'Valid Task'
            };

            const task = Task.fromJSON(taskData);

            // Should not have validation errors because defaults are applied
            const errors = await task.validate();
            expect(errors).toHaveLength(0);
        });
    });

    describe('Calculated Values', () => {
        it('should calculate total from quantity and price when creating from JSON', () => {
            const productData = {
                name: 'Test Product',
                description: 'A test product',
                quantity: 5,
                price: 100
            };

            const product = Product.fromJSON(productData);

            expect(product.name).toBe('Test Product');
            expect(product.quantity).toBe(5);
            expect(product.price).toBe(100);
            
            // The total should be calculated automatically
            expect(product.total).toBe(500); // 5 * 100
        });

        it('should calculate all dependent calculated fields', () => {
            const productData = {
                name: 'Complex Product',
                description: 'A complex product with calculations',
                quantity: 3,
                price: 25
            };

            const product = Product.fromJSON(productData);

            expect(product.total).toBe(75); // 3 * 25
            expect(product.doublePrice).toBe(50); // 25 * 2
            expect(product.stringifyDoublePrice).toBe(JSON.stringify({ double: 50 }));
        });

        it('should handle products with zero values correctly', () => {
            const productData = {
                name: 'Free Product',
                description: 'A free product',
                quantity: 10,
                price: 0
            };

            const product = Product.fromJSON(productData);

            expect(product.total).toBe(0); // 10 * 0
            expect(product.doublePrice).toBe(0); // 0 * 2
        });
    });

    describe('Combined Default and Calculated Values', () => {
        it('should apply both defaults and calculations in the same operation', () => {
            // Test a scenario where some fields have defaults and others are calculated
            const taskData = {
                title: 'Mixed Task'
                // status and priority missing - should get defaults
            };

            const task = Task.fromJSON(taskData);

            // Defaults should be applied
            expect(task.status).toBe(TaskStatus.ToDo);
            expect(task.priority).toBe(Priority.Medium);

            // Should validate without errors
            return task.validate().then(errors => {
                expect(errors).toHaveLength(0);
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty JSON object gracefully', () => {
            const taskData = {};

            const task = Task.fromJSON(taskData);

            // Should apply defaults for required fields with defaults
            expect(task.status).toBe(TaskStatus.ToDo);
            expect(task.priority).toBe(Priority.Medium);
            
            // Title is required but has no default, so validation should fail
            return task.validate().then(errors => {
                expect(errors.length).toBeGreaterThan(0);
                expect(errors.some(error => error.property === 'title')).toBe(true);
            });
        });

        it('should handle null values in JSON correctly', () => {
            const taskData = {
                title: 'Null Fields Task',
                status: null,
                priority: null
            };

            const task = Task.fromJSON(taskData);

            expect(task.status).toBe(null);
            expect(task.priority).toBe(null);
        });
    });
});

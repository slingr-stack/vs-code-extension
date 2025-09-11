import { BaseModel, Field, Model, DateTimeRangeValue, Relationship } from "../../index";
import { Customer } from '../model/Customer';
import { LineItem } from '../model/LineItem';
import { Order } from '../model/Order';
import { Project } from '../model/Project';
import { Task } from '../model/Task';

// Additional test models for relationship validation
@Model()
class Author extends BaseModel {
    @Field({
        required: true,
    })
    name!: string;
}

@Model()
class Book extends BaseModel {
    @Field({
        required: true,
    })
    title!: string;

    @Field({
        required: true,
    })
    @Relationship({
        type: 'reference'
    })
    author!: Author;

    @Field({
        required: false,
    })
    @Relationship({
        type: 'reference'
    })
    coauthor?: Author;
}

@Model()
class Library extends BaseModel {
    @Field({
        required: true,
    })
    name!: string;

    @Field({
        required: false,
    })
    @Relationship({
        type: 'composition',
        elementType: () => Book
    })
    books!: Book[];
}

describe('Relationship Type', () => {
    describe('Decorator Application', () => {
        it('should allow @Relationship on BaseModel properties', () => {
            expect(() => {
                @Model()
                class TestModel extends BaseModel {
                    @Field({})
                    @Relationship({ type: 'reference' })
                    author!: Author;
                }
            }).not.toThrow();
        });

        it('should allow @Relationship on arrays of BaseModel', () => {
            expect(() => {
                @Model()
                class TestModel extends BaseModel {
                    @Field({})
                    @Relationship({ 
                        type: 'composition',
                        elementType: () => Book
                    })
                    books!: Book[];
                }
            }).not.toThrow();
        });

        it('should throw error when applied to non-BaseModel properties', () => {
            expect(() => {
                @Model()
                class TestModel extends BaseModel {
                    @Field({})
                    @Relationship({ type: 'reference' })
                    invalidField!: string; // This should fail
                }
            }).toThrow('@Relationship can only be applied to BaseModel or BaseModel[] properties');
        });

        it('should require type option', () => {
            expect(() => {
                @Model()
                class TestModel extends BaseModel {
                    @Field({})
                    // @ts-expect-error - Missing required type option
                    @Relationship({})
                    author!: Author;
                }
            }).toThrow();
        });
    });

        describe('Reference Relationships', () => {
        it('should create models with reference relationships', () => {
            const customer = new Customer();
            customer.name = 'John Doe';
            customer.email = 'john@example.com';

            const order = new Order();
            order.customer = customer;
            order.date = new Date('2023-01-15');
            order.lineItems = [];

            expect(order.customer).toBe(customer);
            expect(order.customer.name).toBe('John Doe');
        });

        it('should serialize reference relationships to JSON', () => {

            const project = new Project();
            project.name = 'Test Project';
            project.startDate = new Date('2023-01-01');
            const activeRange = new DateTimeRangeValue();
            activeRange.from = new Date('2023-01-01');
            activeRange.to = new Date('2023-12-31');
            project.activeRange = activeRange;

            const task = new Task();
            task.title = 'Test Task';
            task.project = project;

            const json = task.toJSON();
            
            expect(json.title).toBe('Test Task');
            expect(json.project).toBeDefined();
            expect(json.project.name).toBe('Test Project');
            expect(json.project.startDate).toBeDefined();
        });

        it('should deserialize reference relationships from JSON', async () => {
            const projectData = {
                name: 'Deserialized Project',
                startDate: '2023-02-01T00:00:00.000Z',
                activeRange: {
                    from: '2023-02-01T00:00:00.000Z',
                    to: '2023-12-31T23:59:59.999Z'
                }
            };

            const taskData = {
                title: 'Deserialized Task',
                project: projectData
            };

            const task = Task.fromJSON(taskData);

            const errors = await task.validate();
            expect(errors).toHaveLength(0); // Should have no validation errors

            expect(task.title).toBe('Deserialized Task');
            expect(task.project).toBeDefined();
            expect(task.project.name).toBe('Deserialized Project');
            expect(task.project instanceof Project).toBe(true);
            
            // Verify that default values were applied
            expect(task.status).toBe('toDo');
            expect(task.priority).toBe(2); // Priority.Medium
        });
    });

    describe('Test null vs undefined', () => {
        it('a field not set should be undefined after serialization', () => {
            const order = new Order();
            order.date = new Date('2023-01-15');
            order.lineItems = [];

            expect(order.customer).toBeUndefined();
            const json = order.toJSON();
            expect(json.customer).toBeUndefined();
            const restored = Order.fromJSON(json);
            expect(restored.customer).toBeUndefined();
        });

        it('a field set to null must remain null after serialization', () => {
            const book = new Book();
            book.title = 'Some Book';
            book.coauthor = null as any; // explicitly set to null

            expect(book.coauthor).toBeNull();
            const json = book.toJSON();
            expect(json.coauthor).toBeNull();
            const restored = Book.fromJSON(json);
            expect(restored.coauthor).toBeNull();
        });
    });

    describe('Composition Relationships', () => {
        it('should create models with composition relationships', () => {
            const lineItem1 = new LineItem();
            lineItem1.price = 10.99;
            lineItem1.quantity = 2;

            const lineItem2 = new LineItem();
            lineItem2.price = 5.50;
            lineItem2.quantity = 1;

            const customer = new Customer();
            customer.name = 'Bob Johnson';
            customer.email = 'bob@example.com';

            const order = new Order();
            order.customer = customer;
            order.date = new Date('2023-03-10');
            order.lineItems = [lineItem1, lineItem2];

            expect(order.lineItems).toHaveLength(2);
            expect(order.lineItems[0]?.price).toBe(10.99);
            expect(order.lineItems[1]?.quantity).toBe(1);
        });

        it('should serialize composition relationships to JSON', () => {
            const lineItem = new LineItem();
            lineItem.price = 15.00;
            lineItem.quantity = 3;

            const customer = new Customer();
            customer.name = 'Alice Brown';
            customer.email = 'alice@example.com';

            const order = new Order();
            order.customer = customer;
            order.date = new Date('2023-04-05');
            order.lineItems = [lineItem];

            const json = order.toJSON();
            
            expect(json.customer).toBeDefined();
            expect(json.customer.name).toBe('Alice Brown');
            expect(json.lineItems).toHaveLength(1);
            expect(json.lineItems[0].price).toBe(15.00);
            expect(json.lineItems[0].quantity).toBe(3);
        });

        it('should deserialize composition relationships from JSON', () => {
            const orderData = {
                customer: {
                    name: 'Charlie Wilson',
                    email: 'charlie@example.com'
                },
                date: '2023-05-12T00:00:00.000Z',
                lineItems: [
                    { price: 8.99, quantity: 2 },
                    { price: 12.50, quantity: 1 }
                ]
            };

            const order = Order.fromJSON(orderData);
            
            expect(order.customer.name).toBe('Charlie Wilson');
            expect(order.customer instanceof Customer).toBe(true);
            expect(order.lineItems).toHaveLength(2);
            expect(order.lineItems[0] instanceof LineItem).toBe(true);
            expect(order.lineItems[0]?.price).toBe(8.99);
            expect(order.lineItems[1]?.quantity).toBe(1);
        });

        it('should handle calculated fields in composition relationships', async () => {
            const lineItem = new LineItem();
            lineItem.price = 10.00;
            lineItem.quantity = 5;

            await lineItem.calculate();
            expect(lineItem.total).toBe(50.00);

            const order = new Order();
            order.lineItems = [lineItem];

            const json = order.toJSON();
            expect(json.lineItems[0].total).toBe(50.00);
        });
    });

    describe('Edge Cases', () => {
        it('should handle undefined relationships (not loaded)', () => {
            const task = new Task();
            task.title = 'Task without project';
            // project is undefined - relationship was never loaded/set

            const json = task.toJSON();
            expect(json.project).toBeUndefined();
        });

        it('should handle null relationships (loaded but empty)', () => {
            const task = new Task();
            task.title = 'Task with no project';
            (task as any).project = null; // explicitly set to null - relationship was loaded but is empty

            const json = task.toJSON();
            expect(json.project).toBeNull();
        });

        it('should preserve null/undefined distinction during deserialization', () => {
            // Test undefined case
            const taskDataUndefined = {
                title: 'Task without project'
                // project property is not included (undefined)
            };
            const taskUndefined = Task.fromJSON(taskDataUndefined);
            expect(taskUndefined.project).toBeUndefined();

            // Test null case  
            const taskDataNull = {
                title: 'Task with null project',
                project: null // explicitly null
            };
            const taskNull = Task.fromJSON(taskDataNull);
            expect(taskNull.project).toBeNull();
        });

        it('should handle empty arrays in composition relationships', () => {
            const order = new Order();
            order.lineItems = [];

            const json = order.toJSON();
            expect(json.lineItems).toEqual([]);

            const restored = Order.fromJSON(json);
            expect(restored.lineItems).toEqual([]);
        });

        it('should preserve metadata for relationships', () => {
            const fieldType = Reflect.getMetadata('field:type', Order.prototype, 'customer');
            const relationshipType = Reflect.getMetadata('field:relationship:type', Order.prototype, 'customer');
            
            expect(fieldType).toBe('relationship');
            expect(relationshipType).toBe('reference');

            const lineItemsFieldType = Reflect.getMetadata('field:type', Order.prototype, 'lineItems');
            const lineItemsRelType = Reflect.getMetadata('field:relationship:type', Order.prototype, 'lineItems');
            
            expect(lineItemsFieldType).toBe('relationship');
            expect(lineItemsRelType).toBe('composition');
        });
    });

    describe('Complex Nested Relationships', () => {
        it('should handle nested composition and reference relationships', () => {
            const author = new Author();
            author.name = 'Stephen King';

            const book1 = new Book();
            book1.title = 'The Shining';
            book1.author = author;

            const book2 = new Book();
            book2.title = 'It';
            book2.author = author;

            const library = new Library();
            library.name = 'City Library';
            library.books = [book1, book2];

            const json = library.toJSON();
            
            expect(json.name).toBe('City Library');
            expect(json.books).toHaveLength(2);
            expect(json.books[0].title).toBe('The Shining');
            expect(json.books[0].author.name).toBe('Stephen King');
            expect(json.books[1].title).toBe('It');
            expect(json.books[1].author.name).toBe('Stephen King');
        });

        it('should deserialize complex nested relationships', () => {
            const libraryData = {
                name: 'University Library',
                books: [
                    {
                        title: 'Design Patterns',
                        author: { name: 'Gang of Four' }
                    },
                    {
                        title: 'Clean Code',
                        author: { name: 'Robert Martin' }
                    }
                ]
            };

            const library = Library.fromJSON(libraryData);
            
            expect(library.name).toBe('University Library');
            expect(library.books).toHaveLength(2);
            expect(library.books[0] instanceof Book).toBe(true);
            expect(library.books[0]?.author instanceof Author).toBe(true);
            expect(library.books[0]?.author.name).toBe('Gang of Four');
            expect(library.books[1]?.title).toBe('Clean Code');
        });
    });
});

import { BlogPost } from "../model/BlogPost";
import { TypeORMSqlDataSource } from "../../src/datasources/typeorm/TypeORMSqlDataSource";

describe("Array Persistence in SQL Databases", () => {
    let dataSource: TypeORMSqlDataSource;
    let blogPost: BlogPost;

    beforeAll(async () => {
        // Create a TypeORM data source with SQLite for testing
        dataSource = new TypeORMSqlDataSource({
            type: "sqlite",
            filename: ":memory:",
            managed: true,
            synchronize: true,
            logging: false
        });

        // Configure the BlogPost model with the data source
        const modelOptions = { dataSource };
        Reflect.defineMetadata("model:dataSource", dataSource, BlogPost);
        dataSource.configureModel(BlogPost, modelOptions);

        // Configure all fields with the data source
        const fieldNames = Reflect.getMetadata('model:fields', BlogPost) || [];
        fieldNames.forEach((fieldName: string) => {
            const fieldType = Reflect.getMetadata('field:type', BlogPost.prototype, fieldName);
            const fieldTypeOptions = Reflect.getMetadata('field:type:options', BlogPost.prototype, fieldName);
            const fieldRequired = Reflect.getMetadata('field:required', BlogPost.prototype, fieldName);

            if (fieldType) {
                const allFieldOptions = {
                    ...fieldTypeOptions,
                    required: fieldRequired
                };
                dataSource.configureField(BlogPost.prototype, fieldName, fieldType, allFieldOptions);
            }
        });

        // Initialize the data source
        await dataSource.initialize(dataSource.getOptions());
    });

    beforeEach(() => {
        blogPost = new BlogPost();
        blogPost.title = "Sample Blog Post";
        blogPost.content = "<h1>Hello World</h1><p>This is a sample blog post.</p>";
        blogPost.tags = ["javascript", "typescript", "web-development"];
        blogPost.notes = [
            "<h3>Note 1</h3><p>Remember to add examples</p>",
            "<h3>Note 2</h3><p>Include code snippets</p>"
        ];
        blogPost.collaboratorEmails = [
            "john@example.com",
            "jane@example.com",
            "bob@example.com"
        ];
    });

    afterAll(async () => {
        if (dataSource.isConnected()) {
            await dataSource.disconnect();
        }
    });

    describe("Array Creation and Persistence", () => {
        it("should save a blog post with all array fields", async () => {
            const errors = await blogPost.validate();
            expect(errors).toHaveLength(0);

            const savedPost = await dataSource.save(blogPost);
            
            expect(savedPost.id).toBeDefined();
            expect(savedPost.title).toBe("Sample Blog Post");
            expect(savedPost.tags).toEqual(["javascript", "typescript", "web-development"]);
            expect(savedPost.notes).toHaveLength(2);
            expect(savedPost.collaboratorEmails).toHaveLength(3);
        });

        it("should save a blog post with empty arrays", async () => {
            blogPost.tags = [];
            blogPost.notes = [];
            blogPost.collaboratorEmails = [];

            const savedPost = await dataSource.save(blogPost);
            
            expect(savedPost.id).toBeDefined();
            expect(savedPost.tags).toEqual([]);
            expect(savedPost.notes).toEqual([]);
            expect(savedPost.collaboratorEmails).toEqual([]);
        });

        it("should save a blog post with undefined array fields", async () => {
            delete (blogPost as any).tags;
            delete (blogPost as any).notes;
            delete (blogPost as any).collaboratorEmails;

            const savedPost = await dataSource.save(blogPost);
            
            expect(savedPost.id).toBeDefined();
            expect(savedPost.title).toBe("Sample Blog Post");
        });
    });

    describe("Array Retrieval", () => {
        let savedPost: BlogPost;

        beforeEach(async () => {
            // Clean up any existing data
            const allPosts = await dataSource.find(BlogPost);
            for (const post of allPosts) {
                await dataSource.delete(BlogPost, post.id);
            }
            
            // Create a fresh blog post for testing
            const freshPost = new BlogPost();
            freshPost.title = "Sample Blog Post";
            freshPost.content = "<h1>Hello World</h1><p>This is a sample blog post.</p>";
            freshPost.tags = ["javascript", "typescript", "web-development"];
            freshPost.notes = [
                "<h3>Note 1</h3><p>Remember to add examples</p>",
                "<h3>Note 2</h3><p>Include code snippets</p>"
            ];
            freshPost.collaboratorEmails = [
                "john@example.com",
                "jane@example.com",
                "bob@example.com"
            ];
            
            savedPost = await dataSource.save(freshPost);
        });

        it("should retrieve a blog post with all array fields intact", async () => {
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost.id);
            
            expect(retrievedPost).not.toBeNull();
            expect(retrievedPost!.id).toBe(savedPost.id);
            expect(retrievedPost!.title).toBe("Sample Blog Post");
            expect(retrievedPost!.tags).toEqual(["javascript", "typescript", "web-development"]);
            expect(retrievedPost!.notes).toHaveLength(2);
            expect(retrievedPost!.notes[0]).toContain("Note 1");
            expect(retrievedPost!.notes[1]).toContain("Note 2");
            expect(retrievedPost!.collaboratorEmails).toEqual([
                "john@example.com",
                "jane@example.com",
                "bob@example.com"
            ]);
        });

        it("should preserve array order when retrieving", async () => {
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost.id);
            
            expect(retrievedPost!.tags[0]).toBe("javascript");
            expect(retrievedPost!.tags[1]).toBe("typescript");
            expect(retrievedPost!.tags[2]).toBe("web-development");
        });

        it("should find blog posts using the find method", async () => {
            const posts = await dataSource.find(BlogPost);
            
            expect(posts).toHaveLength(1);
            expect(posts[0]).toBeDefined();
            expect(posts[0]!.id).toBe(savedPost.id);
            expect(posts[0]!.tags).toEqual(["javascript", "typescript", "web-development"]);
        });
    });

    describe("Array Updates", () => {
        let savedPost: BlogPost;

        beforeEach(async () => {
            // Clean up any existing data
            const allPosts = await dataSource.find(BlogPost);
            for (const post of allPosts) {
                await dataSource.delete(BlogPost, post.id);
            }
            
            // Create a fresh blog post for testing
            const freshPost = new BlogPost();
            freshPost.title = "Sample Blog Post";
            freshPost.content = "<h1>Hello World</h1><p>This is a sample blog post.</p>";
            freshPost.tags = ["javascript", "typescript", "web-development"];
            freshPost.notes = [
                "<h3>Note 1</h3><p>Remember to add examples</p>",
                "<h3>Note 2</h3><p>Include code snippets</p>"
            ];
            freshPost.collaboratorEmails = [
                "john@example.com",
                "jane@example.com",
                "bob@example.com"
            ];
            
            savedPost = await dataSource.save(freshPost);
        });

        it("should update array fields correctly", async () => {
            // Create a fresh entity with the same data to ensure proper class constructor
            const entityToUpdate = new BlogPost();
            entityToUpdate.id = savedPost.id;
            entityToUpdate.title = savedPost.title;
            entityToUpdate.content = savedPost.content;
            entityToUpdate.tags = ["react", "node.js"];
            entityToUpdate.notes = ["<p>Updated note</p>"];
            entityToUpdate.collaboratorEmails = ["new@example.com"];

            const updatedPost = await dataSource.save(entityToUpdate);
            
            expect(updatedPost.tags).toEqual(["react", "node.js"]);
            expect(updatedPost.notes).toEqual(["<p>Updated note</p>"]);
            expect(updatedPost.collaboratorEmails).toEqual(["new@example.com"]);

            // Verify the update persisted
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost.id);
            expect(retrievedPost!.tags).toEqual(["react", "node.js"]);
            expect(retrievedPost!.notes).toEqual(["<p>Updated note</p>"]);
            expect(retrievedPost!.collaboratorEmails).toEqual(["new@example.com"]);
        });

        it("should handle array size changes", async () => {
            // Start with 3 tags, reduce to 1
            const entityToUpdate = new BlogPost();
            entityToUpdate.id = savedPost.id;
            entityToUpdate.title = savedPost.title;
            entityToUpdate.content = savedPost.content;
            entityToUpdate.tags = ["single-tag"];
            entityToUpdate.notes = savedPost.notes;
            entityToUpdate.collaboratorEmails = savedPost.collaboratorEmails;
            
            const updatedPost = await dataSource.save(entityToUpdate);
            
            expect(updatedPost.tags).toEqual(["single-tag"]);

            // Verify the update persisted
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost.id);
            expect(retrievedPost!.tags).toEqual(["single-tag"]);
        });
    });

    describe("Array Deletion", () => {
        let savedPost: BlogPost;

        beforeEach(async () => {
            // Clean up any existing data
            const allPosts = await dataSource.find(BlogPost);
            for (const post of allPosts) {
                await dataSource.delete(BlogPost, post.id);
            }
            
            // Create a fresh blog post for testing
            const freshPost = new BlogPost();
            freshPost.title = "Sample Blog Post";
            freshPost.content = "<h1>Hello World</h1><p>This is a sample blog post.</p>";
            freshPost.tags = ["javascript", "typescript", "web-development"];
            freshPost.notes = [
                "<h3>Note 1</h3><p>Remember to add examples</p>",
                "<h3>Note 2</h3><p>Include code snippets</p>"
            ];
            freshPost.collaboratorEmails = [
                "john@example.com",
                "jane@example.com",
                "bob@example.com"
            ];
            
            savedPost = await dataSource.save(freshPost);
        });

        it("should delete a blog post and cascade delete array elements", async () => {
            await dataSource.delete(BlogPost, savedPost.id);
            
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost.id);
            expect(retrievedPost).toBeNull();
        });
    });

    describe("Validation with Arrays", () => {
        it("should validate array fields correctly", async () => {
            // Test with valid arrays
            const errors = await blogPost.validate();
            expect(errors).toHaveLength(0);
        });

        it("should fail validation for invalid email arrays", async () => {
            blogPost.collaboratorEmails = ["not-an-email", "john@example.com"];
            
            const errors = await blogPost.validate();
            expect(errors.length).toBeGreaterThan(0);
            
            const emailError = errors.find(e => e.property === 'collaboratorEmails');
            expect(emailError).toBeDefined();
        });

        it("should handle array size validation", async () => {
            // Test with a tag that's too long
            blogPost.tags = ["a".repeat(51)]; // Exceeds maxLength of 50
            
            const errors = await blogPost.validate();
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe("JSON Serialization with Arrays", () => {
        it("should serialize and deserialize arrays correctly", async () => {
            const json = blogPost.toJSON();
            
            expect(json.tags).toEqual(["javascript", "typescript", "web-development"]);
            expect(json.notes).toHaveLength(2);
            expect(json.collaboratorEmails).toHaveLength(3);

            const restored = BlogPost.fromJSON(json);
            expect(restored.tags).toEqual(["javascript", "typescript", "web-development"]);
            expect(restored.notes).toEqual(blogPost.notes);
            expect(restored.collaboratorEmails).toEqual(blogPost.collaboratorEmails);
        });
    });
});

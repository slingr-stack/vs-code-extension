import { BlogPost } from "../model/BlogPost";
import { TypeORMSqlDataSource } from "../../src/datasources/typeorm/TypeORMSqlDataSource";
import { MODEL_FIELDS } from "../../src/model/metadata";

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
        const fieldNames = Reflect.getMetadata(MODEL_FIELDS, BlogPost) || [];
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
        let savedPost1: BlogPost;
        let savedPost2: BlogPost;

        beforeEach(async () => {
            // Clean up any existing data
            const allPosts = await dataSource.find(BlogPost);
            for (const post of allPosts) {
                await dataSource.delete(BlogPost, post.id);
            }
            
            // Create first blog post for testing
            const freshPost1 = new BlogPost();
            freshPost1.title = "JavaScript Tutorial";
            freshPost1.content = "<h1>Learn JavaScript</h1><p>This is a JS tutorial.</p>";
            freshPost1.tags = ["javascript", "tutorial", "beginner"];
            freshPost1.notes = [
                "<h3>Note 1</h3><p>Remember to add examples</p>",
                "<h3>Note 2</h3><p>Include code snippets</p>"
            ];
            freshPost1.collaboratorEmails = [
                "john@example.com",
                "jane@example.com"
            ];
            
            savedPost1 = await dataSource.save(freshPost1);

            // Create second blog post for testing queries
            const freshPost2 = new BlogPost();
            freshPost2.title = "TypeScript Advanced";
            freshPost2.content = "<h1>Advanced TypeScript</h1><p>This is a TS tutorial.</p>";
            freshPost2.tags = ["typescript", "advanced", "generics"];
            freshPost2.notes = [
                "<h3>TS Note 1</h3><p>Generic constraints</p>",
                "<h3>TS Note 2</h3><p>Conditional types</p>",
                "<h3>TS Note 3</h3><p>Mapped types</p>"
            ];
            freshPost2.collaboratorEmails = [
                "alice@example.com",
                "bob@example.com",
                "charlie@example.com"
            ];
            
            savedPost2 = await dataSource.save(freshPost2);
        });

        it("should retrieve a blog post with all array fields intact using findById", async () => {
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost1.id);
            
            expect(retrievedPost).not.toBeNull();
            expect(retrievedPost!.id).toBe(savedPost1.id);
            expect(retrievedPost!.title).toBe("JavaScript Tutorial");
            expect(retrievedPost!.tags).toEqual(["javascript", "tutorial", "beginner"]);
            expect(retrievedPost!.notes).toHaveLength(2);
            expect(retrievedPost!.notes[0]).toContain("Note 1");
            expect(retrievedPost!.notes[1]).toContain("Note 2");
            expect(retrievedPost!.collaboratorEmails).toEqual([
                "john@example.com",
                "jane@example.com"
            ]);
        });

        it("should preserve array order when retrieving by ID", async () => {
            const retrievedPost = await dataSource.findOneById(BlogPost, savedPost1.id);
            
            expect(retrievedPost!.tags[0]).toBe("javascript");
            expect(retrievedPost!.tags[1]).toBe("tutorial");
            expect(retrievedPost!.tags[2]).toBe("beginner");
        });

        it("should find all blog posts with arrays automatically loaded", async () => {
            const posts = await dataSource.find(BlogPost);
            
            expect(posts).toHaveLength(2);
            
            // Verify first post arrays are loaded
            const firstPost = posts.find(p => p.id === savedPost1.id);
            expect(firstPost).toBeDefined();
            expect(firstPost!.tags).toEqual(["javascript", "tutorial", "beginner"]);
            expect(firstPost!.notes).toHaveLength(2);
            expect(firstPost!.collaboratorEmails).toHaveLength(2);
            
            // Verify second post arrays are loaded
            const secondPost = posts.find(p => p.id === savedPost2.id);
            expect(secondPost).toBeDefined();
            expect(secondPost!.tags).toEqual(["typescript", "advanced", "generics"]);
            expect(secondPost!.notes).toHaveLength(3);
            expect(secondPost!.collaboratorEmails).toHaveLength(3);
        });

        it("should find blog posts by criteria with arrays automatically loaded", async () => {
            // Query by title - this should automatically load arrays like compositions
            const posts = await dataSource.find(BlogPost, { title: "TypeScript Advanced" });
            
            expect(posts).toHaveLength(1);
            const foundPost = posts[0]!;
            expect(foundPost).toBeDefined();
            expect(foundPost.id).toBe(savedPost2.id);
            expect(foundPost.title).toBe("TypeScript Advanced");
            
            // Verify arrays are automatically loaded, not just empty or undefined
            expect(foundPost.tags).toEqual(["typescript", "advanced", "generics"]);
            expect(foundPost.notes).toHaveLength(3);
            expect(foundPost.notes[0]).toContain("TS Note 1");
            expect(foundPost.notes[1]).toContain("TS Note 2");
            expect(foundPost.notes[2]).toContain("TS Note 3");
            expect(foundPost.collaboratorEmails).toEqual([
                "alice@example.com",
                "bob@example.com",
                "charlie@example.com"
            ]);
        });

        it("should preserve array order in query results", async () => {
            const posts = await dataSource.find(BlogPost, { title: "TypeScript Advanced" });
            
            expect(posts).toHaveLength(1);
            const post = posts[0]!;
            expect(post).toBeDefined();
            
            // Verify array order is preserved
            expect(post.tags[0]).toBe("typescript");
            expect(post.tags[1]).toBe("advanced");
            expect(post.tags[2]).toBe("generics");
            
            expect(post.collaboratorEmails[0]).toBe("alice@example.com");
            expect(post.collaboratorEmails[1]).toBe("bob@example.com");
            expect(post.collaboratorEmails[2]).toBe("charlie@example.com");
        });

        it("should handle empty query results gracefully", async () => {
            const posts = await dataSource.find(BlogPost, { title: "Non-existent Post" });
            
            expect(posts).toHaveLength(0);
            expect(Array.isArray(posts)).toBe(true);
        });

        it("should load arrays for multiple entities in a single query", async () => {
            // Query without criteria to get all posts
            const allPosts = await dataSource.find(BlogPost);
            
            expect(allPosts).toHaveLength(2);
            
            // Verify both posts have their arrays properly loaded
            allPosts.forEach(post => {
                expect(Array.isArray(post.tags)).toBe(true);
                expect(post.tags.length).toBeGreaterThan(0);
                expect(Array.isArray(post.notes)).toBe(true);
                expect(post.notes.length).toBeGreaterThan(0);
                expect(Array.isArray(post.collaboratorEmails)).toBe(true);
                expect(post.collaboratorEmails.length).toBeGreaterThan(0);
            });
            
            // Verify specific content to ensure arrays aren't just empty arrays
            const jsPost = allPosts.find(p => p.title === "JavaScript Tutorial");
            const tsPost = allPosts.find(p => p.title === "TypeScript Advanced");
            
            expect(jsPost!.tags).toContain("javascript");
            expect(tsPost!.tags).toContain("typescript");
        });

        it("should handle complex queries with automatic array loading", async () => {
            // Test that arrays are automatically loaded even for more complex query scenarios
            // First, let's create a third blog post with overlapping content
            const freshPost3 = new BlogPost();
            freshPost3.title = "JavaScript Advanced";
            freshPost3.content = "<h1>Advanced JavaScript</h1><p>This is an advanced JS tutorial.</p>";
            freshPost3.tags = ["javascript", "advanced", "closures"];
            freshPost3.notes = [
                "<h3>JS Advanced Note</h3><p>Closures and scope</p>"
            ];
            freshPost3.collaboratorEmails = [
                "advanced@example.com"
            ];
            
            const savedPost3 = await dataSource.save(freshPost3);

            // Now test that all posts are found and arrays are loaded
            const allPosts = await dataSource.find(BlogPost);
            expect(allPosts).toHaveLength(3);

            // Verify each post has its arrays properly loaded
            for (const post of allPosts) {
                expect(Array.isArray(post.tags)).toBe(true);
                expect(Array.isArray(post.notes)).toBe(true);
                expect(Array.isArray(post.collaboratorEmails)).toBe(true);
                
                // Verify arrays are not empty (all our test posts have content)
                expect(post.tags.length).toBeGreaterThan(0);
                expect(post.notes.length).toBeGreaterThan(0);
                expect(post.collaboratorEmails.length).toBeGreaterThan(0);
            }

            // Test querying by a field that doesn't exist - should return empty with proper arrays structure
            const nonExistentPosts = await dataSource.find(BlogPost, { title: "Non-existent Title" });
            expect(nonExistentPosts).toHaveLength(0);
            expect(Array.isArray(nonExistentPosts)).toBe(true);
            
            // Clean up the third post
            await dataSource.delete(BlogPost, savedPost3.id);
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

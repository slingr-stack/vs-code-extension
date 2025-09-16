import { 
  TypeORMSqlDataSource, 
  TypeORMSqlDataSourceOptions 
} from '../../index';
import { FIELD_REQUIRED, FIELD_TYPE, FIELD_TYPE_OPTIONS, MODEL_FIELDS } from '../../src/model/metadata';
import { BlogPost } from '../model/BlogPost';
import { FindOptionsWhere, FindManyOptions, FindOneOptions } from 'typeorm';

/**
 * Test suite demonstrating TypeORM Repository-style methods in TypeORMSqlDataSource.
 * This test validates that the data source provides the same methods as TypeORM Repository
 * with the same parameters and behavior.
 */
describe('TypeORM Repository-Style Methods', () => {
  let dataSource: TypeORMSqlDataSource;

  beforeEach(async () => {
    const options: TypeORMSqlDataSourceOptions = {
      type: 'sqlite',
      managed: true,
      filename: ':memory:',
      synchronize: true,
      logging: false,
    };

    dataSource = new TypeORMSqlDataSource(options);
    dataSource.configureModel(BlogPost);
    
    // Configure all fields with the data source (needed for array field handling)
    const fieldNames = Reflect.getMetadata(MODEL_FIELDS, BlogPost) || [];
    fieldNames.forEach((fieldName: string) => {
      const fieldType = Reflect.getMetadata(FIELD_TYPE, BlogPost.prototype, fieldName);
      const fieldTypeOptions = Reflect.getMetadata(FIELD_TYPE_OPTIONS, BlogPost.prototype, fieldName);
      const fieldRequired = Reflect.getMetadata(FIELD_REQUIRED, BlogPost.prototype, fieldName);

      if (fieldType) {
        const allFieldOptions = {
          ...fieldTypeOptions,
          required: fieldRequired
        };
        dataSource.configureField(BlogPost.prototype, fieldName, fieldType, allFieldOptions);
      }
    });
    
    await dataSource.initialize();
  });

  afterEach(async () => {
    if (dataSource) {
      await dataSource.disconnect();
    }
  });

  describe('Find Operations', () => {
    beforeEach(async () => {
      // Create test data
      const post1 = new BlogPost();
      post1.title = 'First Blog Post';
      post1.content = 'This is the content of the first blog post.';
      post1.tags = ['javascript', 'programming'];
      post1.collaboratorEmails = ['john.doe@example.com'];
      await dataSource.save(post1);

      const post2 = new BlogPost();
      post2.title = 'Second Blog Post';
      post2.content = 'This is the content of the second blog post.';
      post2.tags = ['typescript', 'web'];
      post2.collaboratorEmails = ['jane.smith@example.com'];
      await dataSource.save(post2);

      const post3 = new BlogPost();
      post3.title = 'Third Blog Post';
      post3.content = 'This is the content of the third blog post.';
      post3.tags = ['react', 'frontend'];
      post3.collaboratorEmails = ['bob.johnson@example.com'];
      await dataSource.save(post3);
    });

    test('findWithOptions() should support all TypeORM FindManyOptions', async () => {
      const options: FindManyOptions<BlogPost> = {
        where: { title: 'First Blog Post' },
        order: { title: 'ASC' },
        skip: 0,
        take: 10,
        select: ['title', 'content']
      };

      const results = await dataSource.findWithOptions(BlogPost, options);
      expect(results).toHaveLength(1);
      expect(results.length).toBeGreaterThan(0);
      if (results.length > 0) {
        expect(results[0]?.title).toBe('First Blog Post');
        expect(results[0]?.content).toBe('This is the content of the first blog post.');
      }
    });

    test('findBy() should find entities by WHERE conditions', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Second Blog Post' };
      const results = await dataSource.findBy(BlogPost, where);
      
      expect(results).toHaveLength(1);
      expect(results.length).toBeGreaterThan(0);
      if (results.length > 0) {
        expect(results[0]?.title).toBe('Second Blog Post');
        expect(results[0]?.content).toBe('This is the content of the second blog post.');
      }
    });

    test('findBy() should support array of WHERE conditions (OR logic)', async () => {
      const where: FindOptionsWhere<BlogPost>[] = [
        { title: 'First Blog Post' },
        { title: 'Second Blog Post' }
      ];
      const results = await dataSource.findBy(BlogPost, where);
      
      expect(results).toHaveLength(2);
      const titles = results.map(p => p.title);
      expect(titles).toContain('First Blog Post');
      expect(titles).toContain('Second Blog Post');
    });

    test('findOneBy() should find single entity by WHERE conditions', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Third Blog Post' };
      const result = await dataSource.findOneBy(BlogPost, where);
      
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Third Blog Post');
      expect(result!.content).toBe('This is the content of the third blog post.');
    });

    test('findOneBy() should return null when no entity found', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Nonexistent Post' };
      const result = await dataSource.findOneBy(BlogPost, where);
      
      expect(result).toBeNull();
    });

    test('findOne() should support TypeORM FindOneOptions', async () => {
      const options: FindOneOptions<BlogPost> = {
        where: { title: 'Second Blog Post' },
        select: ['title', 'content']
      };
      
      const result = await dataSource.findOne(BlogPost, options);
      
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Second Blog Post');
      expect(result!.content).toBe('This is the content of the second blog post.');
    });

    test('findOneByOrFail() should return entity when found', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'First Blog Post' };
      const result = await dataSource.findOneByOrFail(BlogPost, where);
      
      expect(result.title).toBe('First Blog Post');
      expect(result.content).toBe('This is the content of the first blog post.');
    });

    test('findOneByOrFail() should throw error when entity not found', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Nonexistent Post' };
      
      await expect(dataSource.findOneByOrFail(BlogPost, where))
        .rejects.toThrow();
    });

    test('findOneOrFail() should throw error when entity not found', async () => {
      const options: FindOneOptions<BlogPost> = {
        where: { title: 'Nonexistent Post' }
      };
      
      await expect(dataSource.findOneOrFail(BlogPost, options))
        .rejects.toThrow();
    });
  });

  describe('Count and Existence Operations', () => {
    beforeEach(async () => {
      // Create test data
      for (let i = 0; i < 5; i++) {
        const post = new BlogPost();
        post.title = `Test Post ${i}`;
        post.content = `Content for test post ${i}`;
        post.tags = ['test', 'example'];
        post.collaboratorEmails = ['test@example.com'];
        await dataSource.save(post);
      }
    });

    test('countWithOptions() should count entities with FindManyOptions', async () => {
      const options: FindManyOptions<BlogPost> = {
        // Count all test posts (no specific where condition, so all 5 will match)
      };
      
      const count = await dataSource.countWithOptions(BlogPost, options);
      expect(count).toBe(5);
    });

    test('countBy() should count entities by WHERE conditions', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Test Post 0' };
      const count = await dataSource.countBy(BlogPost, where);
      
      expect(count).toBe(1);
    });

    test('exists() should return true when entities exist', async () => {
      const options: FindManyOptions<BlogPost> = {
        where: { title: 'Test Post 0' }
      };
      
      const exists = await dataSource.exists(BlogPost, options);
      expect(exists).toBe(true);
    });

    test('exists() should return false when no entities exist', async () => {
      const options: FindManyOptions<BlogPost> = {
        where: { title: 'Nonexistent Post' }
      };
      
      const exists = await dataSource.exists(BlogPost, options);
      expect(exists).toBe(false);
    });

    test('existsBy() should return true when entities exist', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Test Post 1' };
      const exists = await dataSource.existsBy(BlogPost, where);
      
      expect(exists).toBe(true);
    });

    test('existsBy() should return false when no entities exist', async () => {
      const where: FindOptionsWhere<BlogPost> = { title: 'Nonexistent Post' };
      const exists = await dataSource.existsBy(BlogPost, where);
      
      expect(exists).toBe(false);
    });
  });

  describe('Find and Count Operations', () => {
    beforeEach(async () => {
      // Create test data with pagination scenario
      for (let i = 0; i < 10; i++) {
        const post = new BlogPost();
        post.title = `Pagination Post ${i}`;
        post.content = `Content for pagination post ${i}`;
        post.tags = ['pagination', 'test'];
        post.collaboratorEmails = ['pagination@example.com'];
        await dataSource.save(post);
      }
    });

    test('findAndCount() should return entities and total count', async () => {
      const options: FindManyOptions<BlogPost> = {
        order: { title: 'ASC' },
        skip: 2,
        take: 3
      };
      
      const [entities, count] = await dataSource.findAndCount(BlogPost, options);
      
      expect(entities).toHaveLength(3);
      expect(count).toBe(10); // Total count ignores pagination
      expect(entities.length).toBeGreaterThan(0);
      if (entities.length >= 3) {
        expect(entities[0]?.title).toBe('Pagination Post 2'); // Skip 2, so starts from post 2
        expect(entities[1]?.title).toBe('Pagination Post 3');
        expect(entities[2]?.title).toBe('Pagination Post 4');
      }
    });

    test('findAndCountBy() should return entities and total count by WHERE', async () => {
      const where: FindOptionsWhere<BlogPost> = { content: 'Content for pagination post 0' };
      const [entities, count] = await dataSource.findAndCountBy(BlogPost, where);
      
      expect(entities).toHaveLength(1);
      expect(count).toBe(1);
    });
  });

  describe('Update and Delete Operations', () => {
    let testPostId: string;

    beforeEach(async () => {
      const post = new BlogPost();
      post.title = 'Update Test Post';
      post.content = 'Content for update test';
      post.tags = ['update', 'test'];
      post.collaboratorEmails = ['update@example.com'];
      const saved = await dataSource.save(post);
      testPostId = saved.id!;
    });

    test('update() should update entities by criteria', async () => {
      const criteria: FindOptionsWhere<BlogPost> = { id: testPostId };
      const partialEntity: Partial<BlogPost> = { 
        title: 'Updated Title',
        content: 'Updated content'
      };
      
      const result = await dataSource.update(BlogPost, criteria, partialEntity);
      expect(result.affected).toBe(1);
      
      // Verify the update
      const updated = await dataSource.findOneById(BlogPost, testPostId);
      expect(updated!.title).toBe('Updated Title');
      expect(updated!.content).toBe('Updated content');
    });

    test('delete() should delete entities by criteria', async () => {
      const criteria: FindOptionsWhere<BlogPost> = { id: testPostId };
      
      const result = await dataSource.delete(BlogPost, criteria);
      expect(result.affected).toBe(1);
      
      // Verify the deletion
      const deleted = await dataSource.findOneById(BlogPost, testPostId);
      expect(deleted).toBeNull();
    });

    test('insert() should insert new entities', async () => {
      const { v7: uuidv7 } = await import('uuid');
      const newPost: Partial<BlogPost> = {
        id: uuidv7(),
        title: 'Insert Test Post',
        content: 'Content for insert test',
        tags: ['insert', 'test'],
        collaboratorEmails: ['insert@example.com']
      };
      
      const result = await dataSource.insert(BlogPost, newPost);
      expect(result.identifiers).toHaveLength(1);
      expect(result.identifiers.length).toBeGreaterThan(0);
      if (result.identifiers.length > 0) {
        expect(result.identifiers[0]?.id).toBeDefined();
      }
    });

    test('insert() should insert multiple entities', async () => {
      const { v7: uuidv7 } = await import('uuid');
      const newPosts: Partial<BlogPost>[] = [
        {
          id: uuidv7(),
          title: 'Bulk Insert Post 1',
          content: 'Content for bulk insert post 1',
          tags: ['bulk', 'insert'],
          collaboratorEmails: ['bulk1@example.com']
        },
        {
          id: uuidv7(),
          title: 'Bulk Insert Post 2',
          content: 'Content for bulk insert post 2',
          tags: ['bulk', 'insert'],
          collaboratorEmails: ['bulk2@example.com']
        }
      ];
      
      const result = await dataSource.insert(BlogPost, newPosts);
      expect(result.identifiers).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when DataSource not initialized', async () => {
      const uninitializedDataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
      });
      
      await expect(uninitializedDataSource.findBy(BlogPost, {}))
        .rejects.toThrow('TypeORM DataSource not initialized');
        
      await expect(uninitializedDataSource.countBy(BlogPost, {}))
        .rejects.toThrow('TypeORM DataSource not initialized');
        
      await expect(uninitializedDataSource.exists(BlogPost))
        .rejects.toThrow('TypeORM DataSource not initialized');
    });
  });

  describe('Backward Compatibility', () => {
    test('legacy find() method should still work', async () => {
      const post = new BlogPost();
      post.title = 'Legacy Test Post';
      post.content = 'Content for legacy test';
      post.tags = ['legacy', 'test'];
      post.collaboratorEmails = ['legacy@example.com'];
      await dataSource.save(post);
      
      // Test legacy find method with valid BlogPost property
      const results = await dataSource.find(BlogPost, { title: 'Legacy Test Post' });
      expect(results).toHaveLength(1);
      expect(results.length).toBeGreaterThan(0);
      if (results.length > 0) {
        expect(results[0]?.title).toBe('Legacy Test Post');
      }
    });

    test('legacy count() method should still work', async () => {
      const post = new BlogPost();
      post.title = 'Legacy Count Test Post';
      post.content = 'Content for legacy count test';
      post.tags = ['legacy', 'count'];
      post.collaboratorEmails = ['legacycount@example.com'];
      await dataSource.save(post);
      
      // Test legacy count method with valid BlogPost property
      const count = await dataSource.count(BlogPost, { title: 'Legacy Count Test Post' });
      expect(count).toBe(1);
    });

    test('findOneById() should find entity by id (deprecated method)', async () => {
      const post = new BlogPost();
      post.title = 'FindOneById Test Post';
      post.content = 'Content for findOneById test';
      post.tags = ['findOneById', 'test'];
      post.collaboratorEmails = ['findonebyid@example.com'];
      const saved = await dataSource.save(post);
      
      // Test findOneById method
      const found = await dataSource.findOneById(BlogPost, saved.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe('FindOneById Test Post');
      expect(found!.content).toBe('Content for findOneById test');
    });

    test('findByIds() should find entities by array of ids (deprecated method)', async () => {
      const post1 = new BlogPost();
      post1.title = 'FindByIds Test Post 1';
      post1.content = 'Content for first post';
      post1.tags = ['findByIds', 'test1'];
      post1.collaboratorEmails = ['findbyids1@example.com'];
      const saved1 = await dataSource.save(post1);

      const post2 = new BlogPost();
      post2.title = 'FindByIds Test Post 2';
      post2.content = 'Content for second post';
      post2.tags = ['findByIds', 'test2'];
      post2.collaboratorEmails = ['findbyids2@example.com'];
      const saved2 = await dataSource.save(post2);
      
      // Test findByIds method
      const found = await dataSource.findByIds(BlogPost, [saved1.id, saved2.id]);
      expect(found).toHaveLength(2);
      expect(found.map(p => p.title)).toContain('FindByIds Test Post 1');
      expect(found.map(p => p.title)).toContain('FindByIds Test Post 2');
    });
  });
});

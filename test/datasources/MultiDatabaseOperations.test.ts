import { TypeORMSqlDataSource, TypeORMSqlDataSourceOptions } from '../../index';
import { FIELD_REQUIRED, FIELD_TYPE, FIELD_TYPE_OPTIONS, MODEL_DATASOURCE, MODEL_FIELDS, TYPEORM_ENTITY } from '../../src/model/metadata';
import { BlogPost } from '../model/BlogPost';
import * as fs from 'fs';

/**
 * Multi-Database Operations Test Suite
 * 
 * This test suite evaluates the same set of operations across multiple database types:
 * - SQLite (always available for testing)
 * - PostgreSQL (requires running PostgreSQL instance)
 * - MySQL (requires running MySQL instance)
 * 
 * The tests are designed to verify database-agnostic functionality while
 * ensuring consistent behavior across different SQL databases.
 */

interface DatabaseConfig {
  name: string;
  config: TypeORMSqlDataSourceOptions;
  skipCondition?: () => boolean;
  setupInstructions?: string;
}

// Database configurations for testing
const DATABASE_CONFIGS: DatabaseConfig[] = [
  {
    name: 'SQLite (In-Memory)',
    config: {
      type: 'sqlite',
      managed: true,
      filename: ':memory:',
      logging: false,
      synchronize: true,
    }
  },
  {
    name: 'SQLite (File)',
    config: {
      type: 'sqlite',
      managed: true,
      filename: './test-multi-db.sqlite',
      logging: false,
      synchronize: true,
    }
  },
  {
    name: 'PostgreSQL',
    config: {
      type: 'postgres',
      managed: true,
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'slingr_test',
      logging: false,
      synchronize: true,
      connectTimeout: 5000,
    },
    skipCondition: () => process.env.SKIP_POSTGRES === 'true',
    setupInstructions: `
PostgreSQL Setup Instructions:
1. Install PostgreSQL locally or use Docker:
   docker run --name postgres-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=slingr_test -p 5432:5432 -d postgres:15

2. Set environment variables (optional):
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=slingr_test

3. To skip PostgreSQL tests, set:
   SKIP_POSTGRES=true
    `
  },
  {
    name: 'MySQL',
    config: {
      type: 'mysql',
      managed: true,
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      username: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'root',
      database: process.env.MYSQL_DB || 'slingr_test',
      logging: false,
      synchronize: true,
      dropSchema: true,
      connectTimeout: 5000,
    },
    skipCondition: () => process.env.SKIP_MYSQL === 'true',
    setupInstructions: `
MySQL Setup Instructions:
1. Install MySQL locally or use Docker:
   docker run --name mysql-test -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=slingr_test -p 3306:3306 -d mysql:8.0

2. Set environment variables (optional):
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=root
   MYSQL_DB=slingr_test

3. To skip MySQL tests, set:
   SKIP_MYSQL=true
    `
  }
];

/**
 * Helper function to configure a model with a data source
 */
function configureModelWithDataSource(modelClass: any, dataSource: TypeORMSqlDataSource): void {
  // Set the model metadata for the data source
  Reflect.defineMetadata(MODEL_DATASOURCE, dataSource, modelClass);
  
  // Configure the model with the data source
  dataSource.configureModel(modelClass, {});
  
  // Configure all fields with the data source
  const fieldNames = Reflect.getMetadata(MODEL_FIELDS, modelClass) || [];
  fieldNames.forEach((fieldName: string) => {
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
  });
}

/**
 * Shared test operations that will be executed on each database type
 */
class DatabaseTestOperations {
  
  static async testBasicConnection(dataSource: TypeORMSqlDataSource): Promise<void> {
    // Test connection establishment
    expect(dataSource.isConnected()).toBe(true);
    expect(dataSource.getInitializationStatus()).toBe(true);
    
    // Verify TypeORM instance is available
    const typeormInstance = dataSource.getTypeORMDataSource();
    expect(typeormInstance).toBeDefined();
    expect(typeormInstance.isInitialized).toBe(true);
    
    // Check connection stats
    const stats = dataSource.getConnectionStats();
    expect(stats.isConnected).toBe(true);
  }

  static async testModelConfiguration(dataSource: TypeORMSqlDataSource): Promise<void> {
    // Verify the model is configured (it should already be configured in beforeAll)
    const metadata = Reflect.getMetadata(MODEL_DATASOURCE, BlogPost);
    expect(metadata).toBe(dataSource);
    
    const entityMetadata = Reflect.getMetadata(TYPEORM_ENTITY, BlogPost);
    expect(entityMetadata).toBe(true);
  }

  static async testCRUDOperations(dataSource: TypeORMSqlDataSource): Promise<void> {
    const typeormInstance = dataSource.getTypeORMDataSource();
    const repository = typeormInstance.getRepository(BlogPost);
    
    // Create test data
    const blogPost = new BlogPost();
    blogPost.title = 'Test Blog Post';
    blogPost.content = '<p>This is a test blog post content.</p>';
    blogPost.tags = ['test', 'blog'];
    blogPost.notes = ['<p>Note 1</p>', '<p>Note 2</p>'];
    blogPost.collaboratorEmails = ['test1@example.com', 'test2@example.com'];
    
    // Test CREATE operation using TypeORM repository directly
    const savedPost = await repository.save(blogPost);
    expect(savedPost).toBeDefined();
    expect(savedPost.id).toBeDefined();
    expect(savedPost.title).toBe('Test Blog Post');
    
    // Test READ operation - find by ID  
    const foundPost = await repository.findOne({ where: { id: savedPost.id } });
    expect(foundPost).toBeDefined();
    expect(foundPost?.title).toBe('Test Blog Post');
    expect(foundPost?.content).toBe('<p>This is a test blog post content.</p>');
    
    // Test READ operation - find all
    const allPosts = await repository.find();
    expect(allPosts.length).toBeGreaterThanOrEqual(1);
    
    // Test UPDATE operation
    if (foundPost) {
      foundPost.title = 'Updated Blog Post';
      const updatedPost = await repository.save(foundPost);
      expect(updatedPost.title).toBe('Updated Blog Post');
    }
    
    // Test DELETE operation
    if (foundPost) {
      await repository.remove(foundPost);
      const deletedPost = await repository.findOne({ where: { id: foundPost.id } });
      expect(deletedPost).toBeNull();
    }
  }

  static async testQueryOperations(dataSource: TypeORMSqlDataSource): Promise<void> {
    const typeormInstance = dataSource.getTypeORMDataSource();
    const repository = typeormInstance.getRepository(BlogPost);
    
    // Insert test data using repository directly
    const posts = [
      { title: 'First Post', content: '<p>First content</p>', tags: ['first'], notes: [], collaboratorEmails: [] },
      { title: 'Second Post', content: '<p>Second content</p>', tags: ['second'], notes: [], collaboratorEmails: [] },
      { title: 'Third Post', content: '<p>Third content</p>', tags: ['third'], notes: [], collaboratorEmails: [] },
    ];
    
    for (const postData of posts) {
      const post = new BlogPost();
      Object.assign(post, postData);
      await repository.save(post);
    }
    
    // Test find all
    const allPosts = await repository.find();
    expect(allPosts.length).toBe(3);
    
    // Test ordering
    const sortedPosts = await repository.find({
      order: { title: 'ASC' }
    });
    expect(sortedPosts.length).toBe(3);
    if (sortedPosts.length > 0) {
      expect(sortedPosts[0]?.title).toBe('First Post');
    }
    
    // Test count
    const totalCount = await repository.count();
    expect(totalCount).toBe(3);
    
    // Test custom query
    const specificPost = await repository
      .createQueryBuilder('post')
      .where('post.title = :title', { title: 'Second Post' })
      .getOne();
    expect(specificPost).toBeDefined();
    expect(specificPost?.title).toBe('Second Post');
  }

  static async testTransactions(dataSource: TypeORMSqlDataSource): Promise<void> {
    const typeormInstance = dataSource.getTypeORMDataSource();
    
    // Test successful transaction
    await typeormInstance.transaction(async (manager) => {
      const post1 = new BlogPost();
      post1.title = 'Transaction Post 1';
      post1.content = '<p>Transaction content 1</p>';
      post1.tags = [];
      post1.notes = [];
      post1.collaboratorEmails = [];
      
      const post2 = new BlogPost();
      post2.title = 'Transaction Post 2';
      post2.content = '<p>Transaction content 2</p>';
      post2.tags = [];
      post2.notes = [];
      post2.collaboratorEmails = [];
      
      await manager.save(BlogPost, post1);
      await manager.save(BlogPost, post2);
    });
    
    // Verify both records were saved
    const repository = typeormInstance.getRepository(BlogPost);
    const transactionPosts = await repository.find({
      where: [
        { title: 'Transaction Post 1' as any },
        { title: 'Transaction Post 2' as any }
      ]
    });
    expect(transactionPosts.length).toBe(2);
    
    // Test rollback transaction
    const countBefore = await repository.count();
    
    try {
      await typeormInstance.transaction(async (manager) => {
        const post = new BlogPost();
        post.title = 'Rollback Post';
        post.content = '<p>Rollback content</p>';
        post.tags = [];
        post.notes = [];
        post.collaboratorEmails = [];
        
        await manager.save(BlogPost, post);
        
        // Force an error to trigger rollback
        throw new Error('Intentional rollback');
      });
    } catch (error) {
      // Expected error
    }
    
    // Verify rollback worked
    const countAfter = await repository.count();
    expect(countAfter).toBe(countBefore);
  }

  static async cleanupTestData(dataSource: TypeORMSqlDataSource): Promise<void> {
    const typeormInstance = dataSource.getTypeORMDataSource();
    
    // Clean up all test data - only if the entity is registered
    try {
      console.debug(`Attempting to get BlogPost repository...`);
      const repository = typeormInstance.getRepository(BlogPost);
      console.debug(`BlogPost repository found, clearing data...`);
      
      // First, manually clear all array element tables (they should cascade, but let's be explicit)
      const arrayElementEntities = dataSource.getArrayElementEntities();
      console.debug(`Found ${arrayElementEntities.length} array element entities`);
      for (const ArrayElementEntity of arrayElementEntities) {
        try {
          const arrayRepository = typeormInstance.getRepository(ArrayElementEntity as any);
          const count = await arrayRepository.count();
          console.debug(`Clearing ${count} records from array element table: ${arrayRepository.metadata.tableName}`);
          if (count > 0) {
            // Use DELETE instead of clear() to avoid foreign key constraint issues
            await arrayRepository.query(`DELETE FROM ${arrayRepository.metadata.tableName}`);
            console.debug(`Successfully cleared ${count} records from ${arrayRepository.metadata.tableName}`);
          }
        } catch (error) {
          console.debug(`Could not clear array element entity:`, error);
        }
      }
      
      // Then clear the main BlogPost table
      const count = await repository.count();
      console.debug(`Clearing ${count} BlogPost records`);
      if (count > 0) {
        // Use DELETE instead of clear() to avoid foreign key constraint issues
        await repository.query(`DELETE FROM ${repository.metadata.tableName}`);
        console.debug(`Successfully cleared ${count} BlogPost records`);
      }
      
      // Verify cleanup worked
      const remainingCount = await repository.count();
      console.debug(`Cleanup verification: ${remainingCount} BlogPost records remaining`);
      
    } catch (error) {
      // Entity might not be registered yet, which is fine during setup
      console.debug('Could not clear BlogPost data (entity may not be configured yet)', error);
    }
  }
}

// Main test suite
describe('Multi-Database Operations Test Suite', () => {
  
  // Display setup instructions at the start
  beforeAll(() => {
    console.log('\n=== Multi-Database Operations Test Suite ===\n');
    
    DATABASE_CONFIGS.forEach(config => {
      if (config.setupInstructions && !config.skipCondition?.()) {
        console.log(`${config.name}:${config.setupInstructions}\n`);
      }
    });
  });

  // Test each database configuration
  DATABASE_CONFIGS.forEach((dbConfig) => {
    describe(`Database: ${dbConfig.name}`, () => {
      let dataSource: TypeORMSqlDataSource;
      
      beforeAll(async () => {
        // Skip tests if condition is met
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} tests as requested`);
          return;
        }
        
        dataSource = new TypeORMSqlDataSource(dbConfig.config);
        
        // Configure the BlogPost model with the data source before initializing
        configureModelWithDataSource(BlogPost, dataSource);
        
        try {
          console.log(`Initializing ${dbConfig.name}...`);
          await dataSource.initialize(dataSource.getOptions());
          console.log(`✓ ${dbConfig.name} initialized successfully`);
        } catch (error) {
          console.error(`✗ Failed to initialize ${dbConfig.name}:`, error);
          throw error;
        }
      });
      
      afterAll(async () => {
        if (dataSource) {
          await dataSource.disconnect();
          console.log(`✓ ${dbConfig.name} disconnected`);
          
          // Clean up SQLite file if it was created
          if (dbConfig.config.type === 'sqlite' && 
              dbConfig.config.filename && 
              dbConfig.config.filename !== ':memory:' &&
              fs.existsSync(dbConfig.config.filename)) {
            fs.unlinkSync(dbConfig.config.filename);
          }
        }
      });
      
      beforeEach(async () => {
        if (dbConfig.skipCondition?.()) {
          return; // Just return early, don't try to use pending
        }
        
        if (dataSource && dataSource.isConnected()) {
          await DatabaseTestOperations.cleanupTestData(dataSource);
        }
      });

      it('should establish basic connection', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} connection test`);
          return;
        }
        await DatabaseTestOperations.testBasicConnection(dataSource);
      });

      it('should configure models correctly', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} model configuration test`);
          return;
        }
        await DatabaseTestOperations.testModelConfiguration(dataSource);
      });

      it('should perform CRUD operations', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} CRUD test`);
          return;
        }
        // Clean up any existing data before running the test
        await DatabaseTestOperations.cleanupTestData(dataSource);
        await DatabaseTestOperations.testCRUDOperations(dataSource);
      });

      it('should execute query operations', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} query test`);
          return;
        }
        // Clean up any existing data before running the test
        await DatabaseTestOperations.cleanupTestData(dataSource);
        await DatabaseTestOperations.testQueryOperations(dataSource);
      });

      it('should handle transactions correctly', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} transaction test`);
          return;
        }
        // Clean up any existing data before running the test
        await DatabaseTestOperations.cleanupTestData(dataSource);
        await DatabaseTestOperations.testTransactions(dataSource);
      });

      it('should handle connection pooling configuration', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} pooling test`);
          return;
        }
        
        // Test connection with custom pooling settings
        const pooledConfig = {
          ...dbConfig.config,
          maxConnections: 5,
          minConnections: 1,
        };
        
        const pooledDataSource = new TypeORMSqlDataSource(pooledConfig);
        configureModelWithDataSource(BlogPost, pooledDataSource);
        await pooledDataSource.initialize(pooledDataSource.getOptions());
        
        expect(pooledDataSource.isConnected()).toBe(true);
        
        await pooledDataSource.disconnect();
      });

      it('should handle schema synchronization', async () => {
        if (dbConfig.skipCondition?.()) {
          console.log(`Skipping ${dbConfig.name} schema test`);
          return;
        }
        
        // Verify schema synchronization works
        const options = dataSource.getOptions() as TypeORMSqlDataSourceOptions;
        expect(options.synchronize).toBe(true);
        
        // The fact that our models work means schema sync is working
        const typeormInstance = dataSource.getTypeORMDataSource();
        const metadata = typeormInstance.entityMetadatas;
        
        // Should have metadata for our registered models
        expect(metadata.length).toBeGreaterThan(0);
      });
    });
  });

  // Cross-database compatibility tests
  describe('Cross-Database Compatibility', () => {
    it('should produce consistent results across all available databases', async () => {
      const availableConfigs = DATABASE_CONFIGS.filter(config => !config.skipCondition?.());
      
      if (availableConfigs.length < 2) {
        console.log('Skipping cross-database test - need at least 2 databases available');
        return;
      }
      
      const results: any[] = [];
      
      // Run the same operations on each available database
      for (const dbConfig of availableConfigs) {
        const dataSource = new TypeORMSqlDataSource(dbConfig.config);
        
        try {
          configureModelWithDataSource(BlogPost, dataSource);
          await dataSource.initialize(dataSource.getOptions());
          
          // Insert test data using repository directly
          const typeormInstance = dataSource.getTypeORMDataSource();
          const repository = typeormInstance.getRepository(BlogPost);
          const post = new BlogPost();
          post.title = 'Cross Database Test';
          post.content = '<p>Cross database content</p>';
          post.tags = ['cross', 'test'];
          post.notes = [];
          post.collaboratorEmails = [];
          
          const saved = await repository.save(post);
          const found = await repository.findOne({ where: { id: saved.id } });
          
          results.push({
            database: dbConfig.name,
            savedId: saved.id,
            foundTitle: found?.title,
            foundTags: found?.tags,
          });
          
          await dataSource.disconnect();
          
          // Clean up SQLite file
          if (dbConfig.config.type === 'sqlite' && 
              dbConfig.config.filename && 
              dbConfig.config.filename !== ':memory:' &&
              fs.existsSync(dbConfig.config.filename)) {
            fs.unlinkSync(dbConfig.config.filename);
          }
          
        } catch (error) {
          console.error(`Cross-database test failed for ${dbConfig.name}:`, error);
          throw error;
        }
      }
      
      // Verify all databases produced consistent results
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.foundTitle).toBe(firstResult.foundTitle);
        expect(result.foundTags).toEqual(firstResult.foundTags);
      });
      
      console.log('Cross-database compatibility verified for:', 
        results.map(r => r.database).join(', '));
    });
  });
});

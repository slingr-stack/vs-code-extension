/**
 * Schema Migration Demo Test
 * 
 * This test demonstrates how managed schemas work in practice:
 * 1. Starting with a basic entity
 * 2. Adding new fields (schema evolution)
 * 3. Performing CRUD operations
 * 4. Showing automatic schema synchronization
 */

import { 
  PersistentModel, 
  Model, 
  Field, 
  TypeORMSqlDataSource,
  Text,
  Email,
  DateTime,
  Boolean,
  Integer
} from '../../index';

// Create the data source that will be used by models
const dataSource = new TypeORMSqlDataSource({
  type: 'sqlite',
  database: ':memory:',
  managed: true, // 🎯 Enable managed schemas for automatic synchronization
  logging: false // Reduce noise during tests
});

// Initial User model - basic version
@Model({
  docs: 'Basic User model - Version 1',
  dataSource: dataSource
})
class UserV1 extends PersistentModel {
  @Field({ required: true })
  @Text({ minLength: 2, maxLength: 50 })
  firstName!: string;

  @Field({ required: true })
  @Text({ minLength: 2, maxLength: 50 })
  lastName!: string;

  @Field({ required: true })
  @Email()
  email!: string;
}

// Evolved User model - with additional fields
@Model({
  docs: 'Enhanced User model - Version 2 with additional profile fields',
  dataSource: dataSource
})
class UserV2 extends PersistentModel {
  @Field({ required: true })
  @Text({ minLength: 2, maxLength: 50 })
  firstName!: string;

  @Field({ required: true })
  @Text({ minLength: 2, maxLength: 50 })
  lastName!: string;

  @Field({ required: true })
  @Email()
  email!: string;

  // New fields added in V2
  @Field()
  @Integer({ min: 18, max: 120 })
  age!: number;

  @Field()
  @DateTime()
  createdAt?: Date;

  @Field()
  @Boolean()
  isActive!: boolean;

  @Field()
  @Text({ maxLength: 500 })
  bio!: string;
}

describe('Schema Migration Demo', () => {
  beforeAll(async () => {
    // Initialize the shared data source once for all tests
    await dataSource.initialize(dataSource.getOptions());
  });

  // Don't clear data between tests - let them build on each other
  // This simulates real schema evolution

  afterAll(async () => {
    // Final cleanup - disconnect the data source
    if (dataSource) {
      await dataSource.disconnect();
    }
  });

  describe('Basic Schema Operations with V1 Model', () => {
    it('should create initial schema and perform basic operations', async () => {
      console.log('\n=== Schema Migration Demo: Basic Operations ===');
      
      console.log('✓ Database initialized with UserV1 schema');
      console.log('  Fields: firstName, lastName, email');

      // Create some initial users
      const user1 = new UserV1();
      user1.firstName = 'John';
      user1.lastName = 'Doe';
      user1.email = 'john.doe@example.com';

      const user2 = new UserV1();
      user2.firstName = 'Jane';
      user2.lastName = 'Smith';
      user2.email = 'jane.smith@example.com';

      // Validate before saving
      const errors1 = await user1.validate();
      const errors2 = await user2.validate();
      expect(errors1).toHaveLength(0);
      expect(errors2).toHaveLength(0);

      // Save users
      await dataSource.save(user1);
      await dataSource.save(user2);
      console.log('✓ Created 2 users with basic schema');

      // Query users
      const allUsers = await dataSource.find(UserV1);
      expect(allUsers).toHaveLength(2);
      console.log(`✓ Retrieved ${allUsers.length} users from database`);

      // Test specific queries
      const johnUser = await dataSource.findOne(UserV1, { 
        where: { firstName: 'John' } 
      });
      expect(johnUser).toBeTruthy();
      expect(johnUser?.email).toBe('john.doe@example.com');
      console.log('✓ Successfully queried user by firstName');

      console.log('=== Basic operations completed successfully ===\n');
    });
  });

  describe('Schema Evolution with V2 Model', () => {
    it('should demonstrate schema evolution with additional fields', async () => {
      console.log('\n=== Schema Migration Demo: Schema Evolution ===');
      
      console.log('✓ Using shared data source with managed schemas enabled');
      console.log('  Schemas automatically synchronize when models change');

      // Create a user with the evolved schema (V2)
      const evolvedUser = new UserV2();
      evolvedUser.firstName = 'Bob';
      evolvedUser.lastName = 'Wilson';
      evolvedUser.email = 'bob.wilson@example.com';
      evolvedUser.age = 28;
      evolvedUser.createdAt = new Date();
      evolvedUser.isActive = true;
      evolvedUser.bio = 'Software developer passionate about TypeScript and databases.';

      const errors = await evolvedUser.validate();
      expect(errors).toHaveLength(0);

      await dataSource.save(evolvedUser);
      console.log('✓ Created user with evolved schema including new fields');

      // Query and verify the new schema works
      const users = await dataSource.find(UserV2);
      expect(users.length).toBeGreaterThan(0);
      
      const savedUser = users.find(u => u.firstName === 'Bob');
      expect(savedUser).toBeDefined();
      expect(savedUser!.firstName).toBe('Bob');
      expect(savedUser!.email).toBe('bob.wilson@example.com');
      expect(savedUser!.isActive).toBe(true);
      expect(savedUser!.bio).toContain('TypeScript');
      console.log('✓ Successfully retrieved user with all new fields');

      console.log('=== Schema evolution completed successfully ===\n');
    });
  });

  describe('Real-world Schema Evolution Scenario', () => {
    it('should simulate a complete development workflow', async () => {
      console.log('\n=== Schema Migration Demo: Development Workflow ===');
      
      // Simulate development phases
      console.log('📅 Development Phase: Working with managed schemas');
      
      // Create initial user base with V1 model
      const users = [
        { firstName: 'John', lastName: 'Doe', email: 'john@company.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@company.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@company.com' }
      ];

      for (const userData of users) {
        const user = new UserV1();
        user.firstName = userData.firstName;
        user.lastName = userData.lastName;
        user.email = userData.email;
        await dataSource.save(user);
      }
      
      console.log(`✓ Created ${users.length} initial users with V1 schema`);

      // Simulate finding users
      const johnDoe = await dataSource.findOne(UserV1, {
        where: { email: 'john@company.com' }
      });
      expect(johnDoe).toBeTruthy();
      console.log('✓ Successfully queried users by email');

      // Count total users (should include users from previous tests)
      const userCount = await dataSource.count(UserV1);
      expect(userCount).toBeGreaterThanOrEqual(3);
      console.log(`✓ Database contains ${userCount} users`);

      console.log('\n📅 Schema Evolution: Adding user profiles with V2 model');
      console.log('   With managed schemas, new fields are automatically supported!');

      // Create users with enhanced profiles using V2 model
      const enhancedUser = new UserV2();
      enhancedUser.firstName = 'Alice';
      enhancedUser.lastName = 'Cooper';
      enhancedUser.email = 'alice@company.com';
      enhancedUser.age = 32;
      enhancedUser.createdAt = new Date();
      enhancedUser.isActive = true;
      enhancedUser.bio = 'Product manager with 8 years of experience in tech startups.';

      await dataSource.save(enhancedUser);
      console.log('✓ Successfully created user with enhanced profile');

      // Demonstrate querying with new fields
      const allV2Users = await dataSource.find(UserV2);
      const activeUsers = allV2Users.filter(user => user.isActive === true);
      expect(activeUsers.length).toBeGreaterThan(0);
      console.log(`✓ Found ${activeUsers.length} active users using V2 schema`);

      // Demonstrate complex queries - filter users with age defined
      const usersWithAge = allV2Users.filter(user => user.age !== undefined);
      console.log(`✓ Found ${usersWithAge.length} users with age information`);

      console.log('=== Development workflow simulation completed ===\n');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle bulk operations with managed schemas', async () => {
      console.log('\n=== Schema Migration Demo: Performance Testing ===');
      
      console.log('✓ Using managed schemas for bulk operations');

      // Create bulk users for performance testing
      const bulkUsers: UserV2[] = [];
      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const user = new UserV2();
        user.firstName = `User${i}`;
        user.lastName = `Test${i}`;
        user.email = `user${i}@testing.com`;
        user.age = 20 + (i % 50);
        user.createdAt = new Date(Date.now() - (i * 24 * 60 * 60 * 1000)); // Stagger dates
        user.isActive = i % 3 !== 0; // Most users active
        user.bio = `This is test user number ${i} for performance testing.`;
        
        bulkUsers.push(user);
      }

      // Validate all users
      for (const user of bulkUsers) {
        const errors = await user.validate();
        expect(errors).toHaveLength(0);
      }

      // Save all users
      for (const user of bulkUsers) {
        await dataSource.save(user);
      }

      const endTime = Date.now();
      console.log(`✓ Created 50 users in ${endTime - startTime}ms`);

      // Test complex queries
      const queryStart = Date.now();
      
      const allUsers = await dataSource.find(UserV2);
      const activeUsers = allUsers.filter(user => user.isActive === true);
      const usersWithAge = allUsers.filter(user => user.age !== undefined && user.age > 0);

      const queryEnd = Date.now();

      expect(allUsers.length).toBeGreaterThan(0);
      expect(activeUsers.length).toBeGreaterThan(0);
      expect(usersWithAge.length).toBeGreaterThan(0);

      console.log(`✓ Executed complex queries in ${queryEnd - queryStart}ms`);
      console.log(`  - Total users: ${allUsers.length}`);
      console.log(`  - Active users: ${activeUsers.length}`);
      console.log(`  - Users with age: ${usersWithAge.length}`);

      console.log('=== Performance testing completed ===\n');
    });
  });
});
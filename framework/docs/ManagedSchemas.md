# Managed Schema Configuration

The Slingr Framework provides managed schema functionality for TypeORM SQL data sources, allowing automatic schema synchronization during development while maintaining full control over production schema management.

## Overview

The `managed` flag in data source configuration determines whether Slingr automatically handles schema changes:

- **Managed (`managed: true`)**: Slingr automatically manages schema updates using TypeORM's synchronization for development
- **Non-managed (`managed: false`)**: Developers manually handle all schema changes and migrations

## Development vs Production Behavior

### Development Environment
When `managed: true`, the framework automatically enables TypeORM's `synchronize` feature for rapid development:

```typescript
const dataSource = new TypeORMSqlDataSource({
  type: "postgres",
  managed: true,  // Enables automatic schema management
  host: "localhost",
  port: 5432,
  username: "dev_user",
  password: "dev_password",
  database: "myapp_dev"
  // synchronize will automatically be set to true
});
```

**Benefits for Development:**
- Schema changes are applied automatically when models change
- No manual migration scripts needed during development
- Rapid prototyping and iteration

**Important Warning:**
Schema synchronization can cause data loss when:
- Fields are renamed (TypeORM sees it as delete + create)
- Field types are changed incompatibly
- Tables are restructured

### Production Environment (Future)
In production environments, managed schemas will use proper migration scripts instead of synchronization (this will be implemented in a future version).

## Configuration Examples

### Managed Schema with Default Synchronization
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: "sqlite",
  managed: true,
  filename: "./dev.db"
  // synchronize defaults to true when managed=true
});
```

### Managed Schema with Explicit Synchronization Control
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: "mysql",
  managed: true,
  host: "localhost",
  database: "myapp",
  synchronize: false  // Override default behavior
});
```

### Non-Managed Schema
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: "postgres",
  managed: false,  // Developer controls schema
  host: "localhost",
  database: "legacy_db"
  // Developer must handle all schema changes manually
});
```

## Data Source Support

Not all data sources support managed schemas. The framework validates this during construction:

```typescript
// TypeORM SQL data sources support managed schemas
const typeormSource = new TypeORMSqlDataSource({ managed: true, /* ... */ });
console.log(typeormSource.supportsManagedSchemas()); // true

// Custom data sources can override support
class CustomAPIDataSource extends DataSource {
  supportsManagedSchemas(): boolean {
    return false; // REST APIs don't support schema management
  }
}

// This will throw an error:
const apiSource = new CustomAPIDataSource({ managed: true }); // Error!
```

## Logging and Monitoring

The framework provides clear logging about schema management:

```
TypeORM DataSource initialized successfully for postgres
Schema is managed by Slingr
⚠️  Schema synchronization is ENABLED - database schema will be automatically updated
   This is recommended for development but may cause data loss on schema changes
```

## Best Practices

### Development Workflow
1. Use `managed: true` for development databases
2. Implement datasets to quickly restore test data after schema changes
3. Never use managed schemas with production data
4. Test schema changes in isolated environments first

### Schema Change Management
1. **Additive changes** (new fields, tables) - Generally safe with synchronization
2. **Destructive changes** (rename, delete, type changes) - May cause data loss
3. **Complex migrations** - Consider using explicit migration scripts even in development

### Database-Specific Considerations

#### SQLite
- Perfect for development with managed schemas
- File-based databases can be easily backed up/restored
- In-memory databases (`filename: ":memory:"`) ideal for testing

#### PostgreSQL/MySQL
- Use separate development databases from production
- Consider using Docker containers for isolated development environments
- Test backup/restore procedures regularly

## Migration to Production Schema Management

When implementing production schema management (future feature), the framework will:

1. Detect schema changes by comparing model definitions
2. Generate migration scripts automatically
3. Apply migrations in a controlled, reversible manner
4. Maintain migration history and versioning

## Troubleshooting

### Common Issues

**Error: "This data source does not support managed schemas"**
- Occurs when trying to use `managed: true` with data sources that don't support it
- Solution: Set `managed: false` or use a different data source

**Data Loss After Schema Changes**
- TypeORM synchronization cannot always preserve data during schema changes
- Solution: Implement datasets or backup/restore procedures for development data

**Schema Not Updating**
- Verify `managed: true` is set
- Check that TypeORM synchronization is enabled in logs
- Ensure model changes are properly decorated with framework decorators

### Debugging Schema Synchronization

The framework logs detailed information about schema management:

```typescript
// Enable detailed logging
const dataSource = new TypeORMSqlDataSource({
  type: "postgres",
  managed: true,
  logging: true,  // Enable SQL query logging
  // ...
});
```

## Example: Complete Development Setup

```typescript
import { TypeORMSqlDataSource, BaseModel, Model, Field, Text, Email } from 'slingr-framework';

// 1. Define your model
@Model({ dataSource: dataSource })
class User extends BaseModel {
  @Field()
  @Text({ maxLength: 100 })
  name?: string;

  @Field()
  @Email()
  email?: string;
}

// 2. Create managed data source
const dataSource = new TypeORMSqlDataSource({
  type: "sqlite",
  managed: true,
  filename: "./dev.db",
  logging: false
});

// 3. Initialize and use
async function setupDevelopmentEnvironment() {
  await dataSource.initialize(dataSource.getOptions());
  
  // Schema is automatically created/updated
  // Start developing immediately
  
  const user = new User();
  user.name = "John Doe";
  user.email = "john@example.com";
  
  const savedUser = await dataSource.save(user);
  console.log("User saved:", savedUser);
}
```

This setup provides a complete development environment with automatic schema management, allowing developers to focus on business logic rather than database administration.
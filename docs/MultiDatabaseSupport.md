# Multi-Database Support for Slingr Framework

This document describes the multi-database support implementation for the Slingr Framework, including setup instructions and testing procedures.

## Supported Databases

The Slingr Framework's TypeORM data source supports the following SQL databases:

### 1. SQLite
- **Type**: `sqlite`
- **Use Case**: Development, testing, lightweight applications
- **Setup**: No additional setup required
- **Connection**: File-based or in-memory

### 2. PostgreSQL
- **Type**: `postgres`
- **Use Case**: Production applications, complex queries, ACID compliance
- **Setup**: Requires PostgreSQL server
- **Connection**: Network-based with connection pooling

### 3. MySQL
- **Type**: `mysql`
- **Use Case**: Web applications, high-performance scenarios
- **Setup**: Requires MySQL server
- **Connection**: Network-based with connection pooling

## Database Setup Instructions

### PostgreSQL Setup

#### Using Docker (Recommended for testing)
```bash
# Start PostgreSQL container
docker run --name postgres-test \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=slingr_test \
  -p 5432:5432 \
  -d postgres:15

# Connect to verify setup
docker exec -it postgres-test psql -U postgres -d slingr_test
```

#### Using Local Installation
1. Install PostgreSQL from [postgresql.org](https://www.postgresql.org/download/)
2. Create a test database:
   ```sql
   CREATE DATABASE slingr_test;
   ```

### MySQL Setup

#### Using Docker (Recommended for testing)
```bash
# Start MySQL container
docker run --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=slingr_test \
  -p 3306:3306 \
  -d mysql:8.0

# Connect to verify setup
docker exec -it mysql-test mysql -u root -p slingr_test
```

#### Using Local Installation
1. Install MySQL from [mysql.com](https://dev.mysql.com/downloads/)
2. Create a test database:
   ```sql
   CREATE DATABASE slingr_test;
   ```

## Environment Configuration

You can configure database connections using environment variables:

### PostgreSQL Environment Variables
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=slingr_test
```

### MySQL Environment Variables
```bash
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=root
export MYSQL_DB=slingr_test
```

### Skipping Database Tests
To skip specific database tests during development:
```bash
export SKIP_POSTGRES=true
export SKIP_MYSQL=true
```

## Running Tests

### Install Dependencies
```bash
npm install
```

The multi-database test will automatically install the required database drivers:
- `sqlite3` - SQLite driver (already included)
- `pg` - PostgreSQL driver
- `mysql2` - MySQL driver

### Run All Database Tests
```bash
npm test -- test/datasources/MultiDatabaseOperations.test.ts
```

### Run with Specific Environment
```bash
# Test only SQLite
SKIP_POSTGRES=true SKIP_MYSQL=true npm test -- test/datasources/MultiDatabaseOperations.test.ts

# Test PostgreSQL and SQLite only
SKIP_MYSQL=true npm test -- test/datasources/MultiDatabaseOperations.test.ts

# Test with custom PostgreSQL connection
POSTGRES_HOST=myhost POSTGRES_PASSWORD=mypass npm test -- test/datasources/MultiDatabaseOperations.test.ts
```

## Test Coverage

The multi-database test suite covers:

1. **Basic Connection Tests**
   - Connection establishment
   - Connection pooling configuration
   - Schema synchronization

2. **Model Configuration Tests**
   - Model registration with TypeORM
   - Field configuration and mapping
   - Metadata verification

3. **CRUD Operations**
   - Create (INSERT)
   - Read (SELECT with various conditions)
   - Update (UPDATE)
   - Delete (DELETE)

4. **Query Operations**
   - Simple queries
   - Complex queries with WHERE clauses
   - Ordering and sorting
   - Aggregate functions (COUNT)
   - Custom QueryBuilder operations

5. **Transaction Tests**
   - Successful transactions
   - Transaction rollback
   - ACID compliance verification

6. **Cross-Database Compatibility**
   - Consistent behavior verification
   - Data integrity across databases
   - Performance comparison (future enhancement)

## Data Source Configuration Examples

### SQLite Configuration
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: 'sqlite',
  managed: true,
  filename: './database.sqlite', // or ':memory:' for in-memory
  synchronize: true,
  logging: false
});
```

### PostgreSQL Configuration
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: 'postgres',
  managed: true,
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'myapp',
  synchronize: true,
  logging: false,
  maxConnections: 10,
  minConnections: 1,
  connectTimeout: 5000
});
```

### MySQL Configuration
```typescript
const dataSource = new TypeORMSqlDataSource({
  type: 'mysql',
  managed: true,
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: 'root',
  database: 'myapp',
  synchronize: true,
  logging: false,
  maxConnections: 10,
  minConnections: 1,
  connectTimeout: 5000
});
```

## Connection Pooling

All network databases (PostgreSQL, MySQL) support connection pooling:

- **maxConnections**: Maximum number of connections in the pool (default: 10)
- **minConnections**: Minimum number of connections to maintain (default: 1)
- **connectTimeout**: Connection timeout in milliseconds (default: none)

## Schema Management

The framework supports automatic schema synchronization:

- **synchronize: true**: Automatically create/update database schema
- **synchronize: false**: Manual schema management required
- **managed: true**: Framework handles schema operations

⚠️ **Warning**: Only use `synchronize: true` in development environments. For production, use migrations.

## Troubleshooting

### Common Issues

#### PostgreSQL Connection Issues
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Ensure PostgreSQL is running and accessible on the specified host/port.

#### MySQL Connection Issues
```
Error: ER_ACCESS_DENIED_ERROR: Access denied for user
```
**Solution**: Verify username, password, and database permissions.

#### TypeORM Entity Issues
```
Error: Entity metadata for "ModelName" was not found
```
**Solution**: Ensure models are properly configured with the data source before initialization.

### Debugging

Enable logging to debug database operations:
```typescript
const dataSource = new TypeORMSqlDataSource({
  // ... other config
  logging: true // Enable SQL query logging
});
```

### Performance Testing

For performance testing across databases, consider:
- Connection pool sizing
- Query optimization
- Index usage
- Transaction handling

## Future Enhancements

Planned improvements for multi-database support:

1. **Additional Database Support**
   - Microsoft SQL Server
   - Oracle Database
   - SQLite with better performance optimizations

2. **Migration Support**
   - Database-specific migration generation
   - Cross-database migration compatibility

3. **Performance Monitoring**
   - Connection pool metrics
   - Query performance comparison
   - Database-specific optimizations

4. **Advanced Features**
   - Read/write splitting
   - Database sharding support
   - Backup and restore utilities

## Contributing

When adding support for new databases:

1. Update `TypeORMSqlDataSourceOptions` interface
2. Add database-specific configuration in `DatabaseConfigBuilder`
3. Add test configuration in `DATABASE_CONFIGS`
4. Update this documentation
5. Add integration tests

## License

This multi-database support is part of the Slingr Framework and follows the same license terms.

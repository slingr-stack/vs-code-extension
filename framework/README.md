# Slingr Framework

The Slingr Framework is a TypeScript framework for building smart business applications with robust model validation, serialization, and field type decorators. It uses class-validator for validation and class-transformer for JSON serialization.

## Features

- **Type-safe Models** - Strongly typed model definitions with decorators
- **Validation Engine** - Built on class-validator with custom validation support
- **JSON Serialization** - Automatic JSON conversion with class-transformer
- **Field Types** - Rich set of field decorators (@Text, @Email, @DateTime, @Money, etc.)
- **Data Sources** - TypeORM integration for database persistence
- **Relationships** - Support for model relationships and embedded objects

## Getting Started

### Installation

```bash
npm install slingr-framework
```

### Basic Usage

```typescript
import { BaseModel, Field, Model, Text, Email } from 'slingr-framework';

@Model()
class User extends BaseModel {
  @Field()
  @Text({ minLength: 2, maxLength: 50 })
  name?: string;

  @Field()
  @Email()
  email?: string;
}

// Create and validate
const user = new User();
user.name = "John Doe";
user.email = "john@example.com";

const errors = await user.validate();
if (errors.length === 0) {
  console.log("User is valid!");
  console.log("JSON:", user.toJSON());
}
```

## Field Types

The framework provides a comprehensive set of field type decorators:

- **Text Fields**: `@Text()`, `@Email()`, `@HTML()`
- **Numbers**: `@Integer()`, `@Decimal()`, `@Money()`
- **Dates**: `@DateTime()`, `@DateTimeRange()`
- **Choices**: `@Choice()`, `@Boolean()`
- **Relationships**: `@Reference()`, `@Composition()`

## Data Sources

Connect your models to databases using TypeORM:

```typescript
import { TypeORMSqlDataSource } from 'slingr-framework';

const dataSource = new TypeORMSqlDataSource({
  type: "sqlite",
  managed: true,
  filename: "./app.db"
});

await dataSource.initialize();

@Model({ dataSource })
class Product extends BaseModel {
  @Field()
  @Text({ maxLength: 100 })
  name?: string;

  @Field()
  @Money({ currency: 'USD' })
  price?: number;
}
```

## Development

### Prerequisites

- Node.js 18+
- TypeScript 5+

### Setup

```bash
npm install
```

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## Documentation

For comprehensive documentation, examples, and API reference, see:
- [Managed Schemas Documentation](docs/ManagedSchemas.md)
- [Multi-Database Support](docs/MultiDatabaseSupport.md)

## Contributing

This package is part of the Slingr monorepo. Please see the main README for contribution guidelines.

## License

Apache-2.0 - See [LICENSE.txt](../LICENSE.txt) for details.
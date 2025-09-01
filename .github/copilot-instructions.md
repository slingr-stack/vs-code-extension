# Slingr Framework - TypeScript Business Model Framework

The Slingr Framework is a TypeScript framework for building smart business applications with robust model validation, serialization, and field type decorators. It uses class-validator for validation and class-transformer for JSON serialization.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

**Bootstrap and validate the repository:**
- `npm install` -- installs dependencies in ~5-30 seconds (varies by system). NEVER CANCEL. Set timeout to 60+ minutes.
- `npm test` -- runs 101 comprehensive tests in ~4 seconds. NEVER CANCEL. Set timeout to 10+ minutes.
- `npm run build` -- **WILL FAIL** due to dependency issue in financial-arithmetic-functions. This is a known limitation. Focus on testing and development workflows instead.
- `npm run watch` -- runs TypeScript compiler in watch mode for development. **WILL FAIL** with same dependency issue.

**CRITICAL BUILD LIMITATION**: The build command fails due to a TypeScript error in the financial-arithmetic-functions dependency. This does NOT affect testing or development workflows. All 101 tests pass successfully.

## Validation and Testing Workflows

**Always run the complete test suite when making changes:**
- `npm test` -- runs all 101 tests in ~4 seconds. NEVER CANCEL. Set timeout to 10+ minutes.
- ALWAYS test your changes by running the relevant test file: `npm test -- test/YourFile.test.ts`
- MANUALLY VALIDATE any new model definitions by creating test instances and calling `validate()` method

**Manual validation steps for model changes:**
1. Create a test instance of your model
2. Set both valid and invalid field values  
3. Call `await model.validate()` and verify error handling
4. Test JSON serialization with `model.toJSON()` and `Model.fromJSON(json)`
5. Verify field availability and conditional logic work correctly

## Key Projects and Structure

**Core Framework Components:**
- `src/model/BaseModel.ts` -- Abstract base class for all models with validation and JSON conversion
- `src/model/Field.ts` -- @Field decorator for validation, documentation, and JSON control  
- `src/model/Model.ts` -- @Model decorator for class metadata
- `src/model/types/` -- Type decorators (@Text, @Email, @DateTime, @Money, etc.)
- `src/validators/` -- Custom validation constraint implementations

**Test Structure:**
- `test/` -- Contains comprehensive test suites for each field type
- `test/model/` -- Test model definitions (Person, App, Project, etc.)
- Each test file covers validation, required fields, and JSON conversion scenarios

**Entry Point:**
- `index.ts` -- Main export file exposing all framework components

## Important Field Type Decorators

**Always import types from the main module:**
```typescript
import { BaseModel, Field, Model, Text, Email, DateTime, Money } from './index';
// OR for individual types:
import { Text, Email } from './src/model/types';
```

**Common field patterns (reference existing test models):**
- `@Text({ minLength: 2, maxLength: 50, regex: /^[a-zA-Z]+$/ })` -- Text with validation
- `@Email()` -- Email validation  
- `@DateTime({ min: new Date('2020-01-01') })` -- Date with constraints
- `@Money({ currency: 'USD', decimals: 2 })` -- Money with currency
- `@Choice({ values: ['option1', 'option2'] })` -- Enum-style choices

## Development Commands

**For development work:**
- `npm test -- --watch` -- run tests in watch mode 
- `npm test -- --testNamePattern="your pattern"` -- run specific tests
- `npm test -- test/Text.test.ts` -- run single test file

**DO NOT attempt to use npm run build or npm run watch** -- they will fail due to the known dependency issue. Focus on test-driven development instead.

## Validation Scenarios

**ALWAYS test these scenarios when creating new models:**

1. **Basic Validation Test:**
```typescript
const model = new YourModel();
model.requiredField = 'valid value';
const errors = await model.validate();
expect(errors).toHaveLength(0);
```

2. **Invalid Field Test:**
```typescript
const model = new YourModel(); 
model.requiredField = ''; // or invalid value
const errors = await model.validate();
expect(errors.length).toBeGreaterThan(0);
```

3. **JSON Round-trip Test:**
```typescript
const model = new YourModel();
model.field = 'value';
const json = model.toJSON();
const restored = YourModel.fromJSON(json);
expect(restored.field).toBe('value');
```

4. **Conditional Field Test (if using conditional required/available):**
```typescript
const model = new YourModel();
model.age = 17; // Test conditional logic
model.parentEmail = 'parent@example.com';
const errors = await model.validate();
expect(errors).toHaveLength(0);
```

## Common Tasks

**Repository Structure (ls -a):**
```
.git/
.gitignore
.vscode/
LICENSE.txt
README.md
dist/                 (created after build attempts)
index.ts             (main export file)
jest.config.ts       (Jest configuration)
node_modules/        (dependencies)
package-lock.json    (dependency lock)
package.json         (project config)
src/                 (source code)
  model/             (core model classes)
    types/           (field type decorators)
    BaseModel.ts     (base class)
    Field.ts         (@Field decorator)
    Model.ts         (@Model decorator)
  validators/        (custom validators)
test/                (test suites)
  model/             (test model definitions)
tsconfig.json        (TypeScript config)
tsconfig.build.json  (Build-specific TypeScript config)
```

**Key package.json scripts:**
```json
{
  "test": "jest --verbose",
  "watch": "tsc --project tsconfig.build.json --watch", 
  "build": "tsc --project tsconfig.build.json"
}
```

**Dependencies:**
- class-validator -- validation decorators and engine
- class-transformer -- JSON serialization/deserialization 
- financial-number -- money/decimal calculations
- jest + ts-jest -- testing framework
- typescript -- TypeScript compiler

## Expert Tips

**Always check these when working with the framework:**
- Review existing test models in `test/model/` for patterns before creating new models
- Check field type options in `src/model/types/` for available validation parameters
- Use the `summarizeErrors()` helper from tests to examine validation failures
- Remember that `@Field({ available: false })` excludes fields from JSON operations
- Test conditional `required` and `available` functions thoroughly

**For complex validation scenarios:**
- Use custom validation functions in `@Field({ validation: (value, obj) => [...] })`
- Leverage `calculation: 'manual'` for computed fields that need caching
- Check `BaseModel.calculate()` method for manual calculation triggers

**NEVER attempt to fix the build error in financial-arithmetic-functions** -- it's a dependency issue outside this project's scope. Focus on the comprehensive test suite and development workflows that work perfectly.
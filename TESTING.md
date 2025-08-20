# Testing the Slingr VS Code Extension Explorer

## Overview

This document explains how to test the explorer functionality in the Slingr VS Code extension. The tests are designed to ensure that the explorer correctly displays entities from the `src/data` folder and provides proper navigation and interaction capabilities.

## Test Structure

### 1. Unit Tests (`explorer.test.ts`)
Tests the `ExplorerProvider` class in isolation using mock data:

- **Root Level Items**: Tests that the explorer shows the correct root structure
- **Data Root Children**: Tests that entities are properly loaded from the cache
- **Entity Children**: Tests that entity fields are displayed correctly
- **Tree Item Properties**: Tests tree item creation and properties
- **Drag and Drop**: Tests field reordering functionality
- **Cache Integration**: Tests cache update event handling

### 2. Cache Tests (`cache.test.ts`)
Tests the `MetadataCache` class functionality:

- **Cache Initialization**: Tests that the cache initializes without errors
- **Data Entity Methods**: Tests `getDataEntities()` and `getDataEntityClasses()` methods
- **Event Handling**: Tests the `onDidUpdate` event
- **findMetadata Method**: Tests the metadata search functionality

### 3. Integration Tests (`explorerIntegration.test.ts`)
Tests the complete explorer with real files and VS Code integration:

- **Real File Integration**: Tests with actual TypeScript entity files
- **Performance Tests**: Ensures the explorer loads quickly

## Running the Tests

### Prerequisites
1. Ensure VS Code is installed
2. Install dependencies: `npm install`
3. Compile the extension: `npm run compile`

### Running All Tests
```bash
npm test
```

### Running Specific Test Suites

#### In VS Code (Recommended)
1. Open the project in VS Code
2. Go to Run and Debug view (Ctrl+Shift+D)
3. Select test configuration:
   - **"Run Extension Tests"**: Runs all tests
   - **"Run Explorer Tests Only"**: Runs only explorer-related tests
4. Press F5 to run

#### Command Line
```bash
# Run all tests
npm run test

# Run with specific pattern
npm run test -- --grep "Explorer"
```

## Test Data Requirements

### For Unit Tests
Unit tests use mock data and don't require real files. They test:
- Mock entities with `@Entity` decorators
- Mock properties with `@Field` decorators
- Mock cache responses

### For Integration Tests
Integration tests require a workspace with:
- `src/data/` directory
- TypeScript files with actual `@Entity` and `@Field` decorators

Example entity file (`src/data/testEntity.ts`):
```typescript
import { Entity, Field } from '@slingr/framework';

@Entity({ label: 'Test Entity', persistent: true })
export class TestEntity {
    @Field({ label: 'Name Field' })
    name: string;

    @Field({ label: 'Email Field' })
    email: string;
}
```

## What Each Test Verifies

### Explorer Provider Tests
1. **Correct Tree Structure**: Verifies the explorer shows "Data" root with entities underneath
2. **Entity Loading**: Ensures only data entities (from `src/data/`) are shown
3. **Field Display**: Confirms entity fields are properly displayed
4. **Navigation**: Tests that clicking items navigates to the correct code location
5. **Drag & Drop**: Verifies field reordering works correctly

### Cache Tests
1. **File Discovery**: Ensures cache finds TypeScript files in `src/data/`
2. **Decorator Parsing**: Verifies `@Entity` and `@Field` decorators are correctly parsed
3. **Data Entity Flag**: Confirms `isDataEntity` flag is set correctly
4. **Update Events**: Tests that file changes trigger cache updates

### Integration Tests
1. **Real File Handling**: Tests with actual workspace files
2. **File System Integration**: Verifies file watching and updates work
3. **Performance**: Ensures reasonable loading times

## Debugging Tests

### Common Issues and Solutions

1. **No entities found**:
   - Check that `src/data/` directory exists
   - Verify entity files have `@Entity` decorators
   - Ensure `tsconfig.json` is properly configured

2. **Tests timeout**:
   - Increase timeout in test configuration
   - Check that cache initialization completes
   - Verify VS Code test environment is set up correctly

3. **Import errors**:
   - Ensure all dependencies are installed
   - Check that compiled JavaScript files exist in `out/` directory
   - Verify TypeScript compilation succeeded

### Debug Configuration

Use the VS Code debugger with the test configurations:
- Set breakpoints in test files or source code
- Use "Run Explorer Tests Only" for focused debugging
- Check the Debug Console for detailed output

## Adding New Tests

### For New Explorer Features
1. Add unit tests to `explorer.test.ts`
2. Create mock data for new functionality
3. Test both success and error cases

### For New Cache Features
1. Add tests to `cache.test.ts`
2. Test with both real and mock data
3. Verify event handling and performance

### Best Practices
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies
- Keep tests focused and independent
- Add comments for complex test scenarios

## Continuous Integration

The tests can be run in CI environments by:
1. Installing VS Code in headless mode
2. Running `npm run test`
3. Checking exit codes for pass/fail status

Example CI configuration would install dependencies, compile TypeScript, and run the test suite automatically on each commit.

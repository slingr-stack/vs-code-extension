# Testing the Slingr VS Code Extension Explorer

## Overview

This document explains how to test the explorer functionality in the Slingr VS Code extension. The tests are designed to ensure that the explorer correctly displays models from the `src/data` folder and provides proper navigation and interaction capabilities.

## Test Structure

### 1. Unit Tests (`explorer.test.ts`)
Tests the `ExplorerProvider` class in isolation using mock data:

- **Root Level Items**: Tests that the explorer shows the correct root structure
- **Data Root Children**: Tests that models are properly loaded from the cache
- **Model Children**: Tests that model fields are displayed correctly
- **Tree Item Properties**: Tests tree item creation and properties
- **Cache Integration**: Tests cache update event handling

### 2. Cache Tests (`cache.test.ts`)
Tests the simplified `MetadataCache` class functionality:

- **Cache Initialization**: Tests that the cache initializes without errors
- **Data Model Methods**: Tests `getDataModels()` and `getDataModelClasses()` methods
- **Event Handling**: Tests the `onDidUpdate` event
- **findMetadata Method**: Tests the metadata search functionality

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
- Mock models with `@Model` decorators
- Mock properties with `@Field` decorators
- Mock cache responses


## What Each Test Verifies

### Explorer Provider Tests
1. **Correct Tree Structure**: Verifies the explorer shows "Data" root with models underneath
2. **Model Loading**: Ensures only data models (from `src/data/`) are shown
3. **Field Display**: Confirms model fields are properly displayed
4. **Navigation**: Tests that clicking items navigates to the correct code location

### Cache Tests
1. **File Discovery**: Ensures cache finds TypeScript files in `src/data/`
2. **Decorator Parsing**: Verifies `@Model` and `@Field` decorators are correctly parsed
3. **Data Model Flag**: Confirms `isDataModel` flag is set correctly
4. **Update Events**: Tests that file changes trigger cache updates


## Debugging Tests

### Common Issues and Solutions

1. **No models found**:
   - Check that `src/data/` directory exists
   - Verify model files have `@Model` decorators
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

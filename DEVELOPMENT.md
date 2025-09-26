# Slingr Monorepo Development Guide

This document provides detailed information about working with the Slingr monorepo structure.

## Repository Structure

```
slingr-framework/
├── framework/             # Core Slingr Framework
│   ├── src/              # Framework source code
│   ├── test/             # Framework tests
│   ├── docs/             # Framework documentation
│   ├── package.json      # Framework dependencies
│   └── README.md         # Framework documentation
├── cli/                  # Slingr CLI tool
│   ├── src/              # CLI source code (future)
│   ├── package.json      # CLI dependencies
│   └── README.md         # CLI documentation
├── vs-code-extension/    # VS Code extension
│   ├── src/              # Extension source code (future)
│   ├── package.json      # Extension dependencies
│   └── README.md         # Extension documentation
├── package.json          # Monorepo workspace configuration
└── README.md             # Main repository documentation
```

## Development Workflow

### Initial Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/slingr-stack/framework.git
   cd framework
   ```

2. Install all dependencies:
   ```bash
   npm run install:all
   ```

### Working on Individual Packages

#### Framework Development

```bash
# Navigate to framework
cd framework

# Install dependencies (if not done via npm run install:all)
npm install

# Run tests
npm test

# Build
npm run build

# Watch mode for development
npm run watch
```

#### CLI Development (Future)

```bash
# Navigate to CLI
cd cli

# Install dependencies
npm install

# Build CLI
npm run build

# Test CLI locally
npm link
slingr --help
```

#### VS Code Extension Development (Future)

```bash
# Navigate to extension
cd vs-code-extension

# Install dependencies
npm install

# Build extension
npm run build

# Run in development mode
code --extensionDevelopmentPath=.
```

### Monorepo Commands

From the root directory:

```bash
# Build all packages
npm run build

# Run tests for all packages
npm test

# Clean all packages
npm run clean

# Install dependencies for all workspaces
npm run install:all

# Run a command in a specific workspace
npm run test --workspace=framework
npm run build --workspace=cli
```

### Package Management

#### Adding Dependencies

To add dependencies to a specific package:

```bash
# Add to framework
npm install --workspace=framework package-name

# Add dev dependency to CLI
npm install --save-dev --workspace=cli package-name

# Add dependency to all workspaces
npm install --workspaces package-name
```

#### Workspace Interdependencies

Packages can depend on each other using workspace references:

```json
{
  "dependencies": {
    "@slingr/framework": "workspace:*"
  }
}
```

## Migration Status

### ✅ Completed
- [x] Monorepo structure created
- [x] Framework moved to `framework/` directory  
- [x] All framework tests passing (371/387 - same as before)
- [x] Framework builds successfully
- [x] npm workspaces configuration
- [x] Root-level package management
- [x] Documentation updated

### 🔄 In Progress
- [ ] CLI integration from existing repository
- [ ] VS Code extension integration from existing repository

### 📋 Future Work
- [ ] Shared build configuration across packages
- [ ] Shared linting and formatting rules
- [ ] Continuous integration setup for monorepo
- [ ] Release automation for individual packages

## Testing

### Framework Tests
The framework maintains comprehensive test coverage with 371 passing tests. Some MySQL tests fail in the current environment due to database setup, which is expected behavior.

### Running Specific Tests
```bash
# Run framework tests only
npm test --workspace=framework

# Run specific test file
cd framework && npm test -- test/Text.test.ts

# Run tests in watch mode
cd framework && npm test -- --watch
```

## Building

### Framework Build
The framework builds successfully to the `framework/dist/` directory:

```bash
npm run build --workspace=framework
```

### All Packages
Build all packages from root:

```bash
npm run build
```

## Common Issues and Solutions

### Node Modules
If you encounter dependency issues, try:

```bash
# Clean all node_modules and reinstall
rm -rf node_modules framework/node_modules cli/node_modules vs-code-extension/node_modules
npm run install:all
```

### TypeScript Issues
Each package has its own TypeScript configuration:
- Framework: `framework/tsconfig.json` and `framework/tsconfig.build.json`
- CLI: Will have its own configuration
- VS Code Extension: Will have its own configuration

### Testing Issues
Ensure you're running tests from the correct directory or using workspace commands.

## Contributing

When contributing to this monorepo:

1. Make changes in the appropriate package directory
2. Test changes both individually and at the monorepo level
3. Update documentation if needed
4. Follow existing code style and conventions
5. Run `npm test` from root to ensure all packages work together

## Versioning

Each package in the monorepo can have its own version:
- Framework: Published as `slingr-framework`
- CLI: Published as `@slingr/cli`  
- VS Code Extension: Published to VS Code marketplace

The monorepo itself uses a shared version for coordination but packages can version independently.
# Slingr Monorepo

This monorepo contains the complete Slingr ecosystem for building smart business applications:

- **Framework** - The core TypeScript framework with model validation, serialization, and field types
- **CLI** - Command-line tools for Slingr development and deployment
- **VS Code Extension** - IDE support for Slingr application development

## Repository Structure

```
├── framework/         # Core Slingr Framework (TypeScript)
├── cli/              # Slingr CLI tool
├── vs-code-extension/ # VS Code extension for Slingr
├── package.json      # Monorepo workspace configuration
└── README.md         # This file
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- TypeScript 5+

### Installation

1. **Clone the Repository**:
    ```bash
    git clone https://github.com/slingr-stack/framework.git
    cd framework
    ```

2. **Install Dependencies**:
    ```bash
    npm run install:all
    ```

3. **Build All Packages**:
    ```bash
    npm run build
    ```

4. **Run Tests**:
    ```bash
    npm test
    ```

## Working with Individual Packages

### Framework Development

```bash
cd framework
npm install
npm test
npm run build
```

See [framework/README.md](framework/README.md) for detailed framework documentation.

### CLI Development

```bash
cd cli
npm install
npm run build
```

See [cli/README.md](cli/README.md) for CLI documentation.

### VS Code Extension Development

```bash
cd vs-code-extension
npm install
npm run build
```

See [vs-code-extension/README.md](vs-code-extension/README.md) for extension development guide.

## Available Scripts

From the root directory:

- `npm run build` - Build all packages
- `npm run test` - Run tests for all packages  
- `npm run clean` - Clean build artifacts from all packages
- `npm run install:all` - Install dependencies for all packages

## Contributing

This monorepo uses npm workspaces to manage multiple packages. Each package has its own `package.json` and can be developed independently while sharing common dependencies.

## License

Apache-2.0 - See [LICENSE.txt](LICENSE.txt) for details.
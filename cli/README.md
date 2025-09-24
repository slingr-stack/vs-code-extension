# Slingr CLI

A command line tool for creating Slingr applications with TypeScript and best practices built-in.

## How to test set-up?

1. Clone repository

```bash
git clone https://github.com/slingr-stack/cli.git
cd cli
```

2. Install dependencies, build and link

```bash
npm install
npm run build
npm link
```

3. Execute

```bash
slingr create-app <my-app>
slingr --help
```

## Installation

```bash
# Install globally
npm install -g @slingr/cli

# Or use with npx (no installation required)
npx @slingr/cli create-app my-app
```

## Usage

### Create a new application

```bash
slingr create-app my-app
```

This command will:
1. Ask you questions about your application type and requirements
2. Create a project directory with the specified name
3. Set up a complete TypeScript project structure
4. Generate sample files and configurations
5. Configure VS Code settings and recommended extensions

### Interactive Setup

The CLI will ask you several questions to customize your project:

- **Application Type**: What kind of app you're building (CRM, task manager, etc.)
- **Backend**: Whether you want to create a backend
- **Frontend**: Whether you want to create a frontend (only if backend is selected)
- **Description**: A detailed description of what your app should do

## Generated Project Structure

```
your-app/
├── .vscode/
│   ├── extensions.json      # Recommended VS Code extensions
│   └── settings.json        # VS Code settings for optimal development
├── .github/
│   └── copilot-instructions.md  # GitHub Copilot context
├── src/
│   └── data/
│       ├── SampleModel.ts   # Example data model
│       └── SampleModel.test.ts  # Example tests
├── docs/
│   └── app-description.md   # Generated app documentation
├── package.json             # Project configuration
└── tsconfig.json           # TypeScript configuration
```

## Features

- **TypeScript Setup**: Pre-configured TypeScript with strict settings
- **Testing**: Jest test framework with sample tests
- **Linting**: ESLint with TypeScript support
- **VS Code Integration**: Optimized settings and extension recommendations
- **GitHub Copilot**: Pre-configured with context instructions
- **Sample Code**: Working examples to get you started quickly

## Development

After creating your project:

```bash
cd your-app
npm install
```
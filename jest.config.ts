import type { Config } from 'jest';

const config: Config = {
  // Add this line
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Use recommended transform-based ts-jest config (replaces deprecated globals)
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
        },
      },
    ],
  },

  // ... rest of your configuration
  coverageProvider: "v8",
  // ...
};

module.exports = config;
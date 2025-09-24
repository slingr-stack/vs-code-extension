import type { Config } from "jest";

const config: Config = {
  coverageProvider: "v8",
  moduleDirectories: ["node_modules", "<rootDir>"],
  moduleNameMapper: {
    "#(.*)": "<rootDir>/node_modules/$1",
    "slingr-framework": "<rootDir>/node_modules/slingr-framework",
  },
  modulePaths: ["<rootDir>"],
  preset: "ts-jest",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          module: 'commonjs',

        },
      },
    ],
    "^.+\\.[j]sx?$": "babel-jest"
  },
  transformIgnorePatterns: [
    '/node_modules/(?!slingr-framework)',
  ],
};

module.exports = config;
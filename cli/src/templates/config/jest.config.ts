import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          allowJs: true,

        },
      },
    ],
    "^.+\\.[j]sx?$": "babel-jest"
  },
  transformIgnorePatterns: [
    '/node_modules/(?!slingr-framework)',
  ],
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    "#(.*)": "<rootDir>/node_modules/$1",
    "slingr-framework": "<rootDir>/node_modules/slingr-framework",
  },
  coverageProvider: "v8",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  modulePaths: ["<rootDir>"],
  moduleDirectories: ["node_modules", "<rootDir>"],
};

module.exports = config;
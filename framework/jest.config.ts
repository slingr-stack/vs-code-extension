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
  },
  transformIgnorePatterns: [
    '/node_modules/(?!bigint-money|class-transformer|uuid)',
  ],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  coverageProvider: "v8",
};

module.exports = config;
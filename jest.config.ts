import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
        },
      },
    ],
  },
  testMatch: ["<rootDir>/src/test/**/*.test.ts"],
  coverageProvider: "v8",
};

module.exports = config;

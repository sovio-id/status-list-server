import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for tests");
}

process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    globalSetup: ["../../packages/db/src/migrate.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl,
      API_KEY: "test-api-key",
      PORT: "3003",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});

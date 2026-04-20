import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "file::memory:",
      API_KEY: "test-api-key",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    env: {
      DATABASE_URL: "file::memory:",
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

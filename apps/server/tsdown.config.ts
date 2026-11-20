import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    migrate: "../../packages/db/src/migrate.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@status-list-server\/.*/],
});

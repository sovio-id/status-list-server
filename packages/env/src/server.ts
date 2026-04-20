import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    API_KEY: z.string().min(1, "API_KEY is required"),
    PORT: z.coerce
      .number({ error: "PORT is required" })
      .int("PORT must be an integer")
      .positive("PORT must be a positive number"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (error) => {
    console.error("Invalid environment variables:");
    for (const issue of error) {
      console.error(`  ${issue.path?.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  },
});

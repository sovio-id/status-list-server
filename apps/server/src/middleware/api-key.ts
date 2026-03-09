import { env } from "@status-list-server/env/server";
import { createMiddleware } from "hono/factory";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");
  if (!key || key !== env.API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

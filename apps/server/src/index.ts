import { env } from "@status-list-server/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { statusListsRoute } from "./routes/status-lists";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }),
);

app.get("/", (c) => {
  return c.html("Status List Server");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/status-lists", statusListsRoute);

export default app;

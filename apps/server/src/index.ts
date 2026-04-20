import { env } from "@status-list-server/env/server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { statusListsRoute } from "./routes/status-lists";

const app = new Hono();

app.use(logger());

app.get("/", (c) => {
  return c.html("Status List Server");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/status-lists", statusListsRoute);

export default {
  port: env.PORT,
  fetch: app.fetch,
};

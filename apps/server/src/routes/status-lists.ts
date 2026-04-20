import { getListFromStatusListJWT } from "@sd-jwt/jwt-status-list";
import {
  getStatusListById,
  insertStatusList,
  updateStatusList,
} from "@status-list-server/db";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { apiKeyAuth } from "../middleware/api-key";

const app = new Hono();

const uuidSchema = z.uuid();

const createStatusListSchema = z.object({
  id: uuidSchema,
  jwt: z.string().min(1),
});

const updateStatusListSchema = z.object({
  jwt: z.string().min(1),
});

// POST /status-lists
app.post(
  "/",
  apiKeyAuth,
  validator("json", (value, c) => {
    const result = createStatusListSchema.safeParse(value);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }
    return result.data;
  }),
  async (c) => {
    const { id, jwt } = c.req.valid("json");

    await insertStatusList({ id, status_list: jwt });

    return c.json({ id }, 201);
  },
);

// PATCH /status-lists/:list_id
app.patch(
  "/:list_id",
  apiKeyAuth,
  validator("json", (value, c) => {
    const result = updateStatusListSchema.safeParse(value);
    if (!result.success) {
      return c.json({ error: result.error.issues }, 400);
    }
    return result.data;
  }),
  async (c) => {
    const listId = c.req.param("list_id");

    if (!uuidSchema.safeParse(listId).success) {
      return c.json({ error: "Invalid list ID" }, 400);
    }

    const { jwt } = c.req.valid("json");

    const row = await getStatusListById(listId);

    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }

    let existingBits: number;
    let newBits: number;
    try {
      existingBits = getListFromStatusListJWT(row.status_list).getBitsPerStatus();
      newBits = getListFromStatusListJWT(jwt).getBitsPerStatus();
    } catch {
      return c.json({ error: "Invalid status list JWT" }, 400);
    }

    if (existingBits !== newBits) {
      return c.json({ error: "bits cannot be changed after creation" }, 400);
    }

    await updateStatusList(listId, jwt);

    return c.json({ id: listId }, 200);
  },
);

// GET /status-lists/:list_id
app.get("/:list_id", async (c) => {
  const listId = c.req.param("list_id");

  if (!uuidSchema.safeParse(listId).success) {
    return c.json({ error: "Invalid list ID" }, 400);
  }

  const row = await getStatusListById(listId);

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.text(row.status_list, 200, {
    "Content-Type": "application/statuslist+jwt",
  });
});

export { app as statusListsRoute };

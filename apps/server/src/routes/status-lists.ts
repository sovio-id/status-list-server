import { gunzipSync } from "node:zlib";
import { getListFromStatusListJWT } from "@sd-jwt/jwt-status-list";
import {
  getStatusListById,
  insertStatusList,
  type StatusListFormat,
  updateStatusList,
} from "@status-list-server/db";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { apiKeyAuth } from "../middleware/api-key";

const app = new Hono();

const uuidSchema = z.uuid();

const TOKEN_CONTENT_TYPE = "application/statuslist+jwt";
const BITSTRING_CONTENT_TYPE = "application/ld+json";

const VCDM_V2_CONTEXT = "https://www.w3.org/ns/credentials/v2";

const MIN_BITSTRING_LENGTH = 131072;

const isValidEncodedList = (encodedList: string): boolean => {
  if (!encodedList.startsWith("u")) {
    return false;
  }

  try {
    const raw = gunzipSync(Buffer.from(encodedList.slice(1), "base64url"));
    return raw.length * 8 >= MIN_BITSTRING_LENGTH;
  } catch {
    return false;
  }
};

const toArray = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

const typeSchema = z.union([z.string(), z.array(z.string())]);

const bitstringCredentialSubjectSchema = z
  .looseObject({
    id: z.string().optional(),
    type: typeSchema,
    statusPurpose: z.string().min(1),
    encodedList: z.string().min(1).refine(isValidEncodedList, {
      message:
        "encodedList must be a multibase 'u' base64url gzip of at least 131072 bits",
    }),
    statusSize: z.number().int().positive().optional(),
    ttl: z.number().int().positive().optional(),
  })
  .refine((subject) => toArray(subject.type).includes("BitstringStatusList"), {
    message: "credentialSubject.type must include 'BitstringStatusList'",
  });

const bitstringStatusListCredentialSchema = z
  .looseObject({
    "@context": z.union([z.string(), z.array(z.string())]),
    id: z.string().optional(),
    type: typeSchema,
    issuer: z.union([z.string(), z.looseObject({ id: z.string() })]),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    credentialSubject: z.union([
      bitstringCredentialSubjectSchema,
      z.array(bitstringCredentialSubjectSchema).min(1),
    ]),
  })
  .refine((vc) => toArray(vc.type).includes("BitstringStatusListCredential"), {
    message: "type must include 'BitstringStatusListCredential'",
  })
  .refine((vc) => toArray(vc["@context"]).includes(VCDM_V2_CONTEXT), {
    message: `@context must include '${VCDM_V2_CONTEXT}'`,
  });

type BitstringStatusListCredential = z.infer<
  typeof bitstringStatusListCredentialSchema
>;

const tokenCreateSchema = z.strictObject({
  id: uuidSchema,
  jwt: z.string().min(1),
});

const bitstringCreateSchema = z.strictObject({
  id: uuidSchema,
  vc: bitstringStatusListCredentialSchema,
});

const createStatusListSchema = z.union([
  tokenCreateSchema,
  bitstringCreateSchema,
]);

const tokenUpdateSchema = z.strictObject({
  jwt: z.string().min(1),
});

const bitstringUpdateSchema = z.strictObject({
  vc: bitstringStatusListCredentialSchema,
});

const updateStatusListSchema = z.union([
  tokenUpdateSchema,
  bitstringUpdateSchema,
]);

const getStatusSize = (vc: BitstringStatusListCredential): number => {
  const subject = Array.isArray(vc.credentialSubject)
    ? vc.credentialSubject[0]
    : vc.credentialSubject;
  return subject?.statusSize ?? 1;
};

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
    const data = c.req.valid("json");

    if ("jwt" in data) {
      try {
        getListFromStatusListJWT(data.jwt);
      } catch {
        return c.json({ error: "Invalid status list JWT" }, 400);
      }

      await insertStatusList({
        id: data.id,
        status_list: data.jwt,
        format: "token",
      });

      return c.json({ id: data.id }, 201);
    }

    await insertStatusList({
      id: data.id,
      status_list: JSON.stringify(data.vc),
      format: "bitstring",
    });

    return c.json({ id: data.id }, 201);
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

    const data = c.req.valid("json");

    const row = await getStatusListById(listId);

    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }

    const payloadFormat: StatusListFormat =
      "jwt" in data ? "token" : "bitstring";

    if (row.format !== payloadFormat) {
      return c.json(
        { error: "Payload format does not match stored format" },
        400,
      );
    }

    if ("jwt" in data) {
      let existingBits: number;
      let newBits: number;
      try {
        existingBits = getListFromStatusListJWT(
          row.status_list,
        ).getBitsPerStatus();
        newBits = getListFromStatusListJWT(data.jwt).getBitsPerStatus();
      } catch {
        return c.json({ error: "Invalid status list JWT" }, 400);
      }

      if (existingBits !== newBits) {
        return c.json({ error: "bits cannot be changed after creation" }, 400);
      }

      await updateStatusList(listId, data.jwt);

      return c.json({ id: listId }, 200);
    }

    let storedStatusSize: number | undefined;
    try {
      const stored = bitstringStatusListCredentialSchema.safeParse(
        JSON.parse(row.status_list),
      );
      storedStatusSize = stored.success
        ? getStatusSize(stored.data)
        : undefined;
    } catch {
      storedStatusSize = undefined;
    }

    if (
      storedStatusSize !== undefined &&
      storedStatusSize !== getStatusSize(data.vc)
    ) {
      return c.json(
        { error: "statusSize cannot be changed after creation" },
        400,
      );
    }

    await updateStatusList(listId, JSON.stringify(data.vc));

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

  if (row.format === "bitstring") {
    return c.body(row.status_list, 200, {
      "Content-Type": BITSTRING_CONTENT_TYPE,
    });
  }

  return c.text(row.status_list, 200, {
    "Content-Type": TOKEN_CONTENT_TYPE,
  });
});

export { app as statusListsRoute };

import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/index";
import {
  clearDb,
  createTestBitstringCredential,
  createTestStatusListJwt,
} from "./helpers";

const TEST_UUID = "00000000-0000-4000-8000-000000000101";
const TEST_UUID_2 = "00000000-0000-4000-8000-000000000102";
const API_KEY = "test-api-key";

const json = (
  body: unknown,
  headers?: Record<string, string>,
  method = "POST",
) =>
  new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const patch = (body: unknown, headers?: Record<string, string>) =>
  json(body, headers, "PATCH");

beforeEach(async () => {
  await clearDb();
});

describe("POST /status-lists (bitstring)", () => {
  it("returns 401 when no API key is provided", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, vc: createTestBitstringCredential() }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when both jwt and vc are provided", async () => {
    const res = await app.request(
      "/status-lists",
      json(
        {
          id: TEST_UUID,
          jwt: createTestStatusListJwt(),
          vc: createTestBitstringCredential(),
        },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when neither jwt nor vc is provided", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when vc is not a BitstringStatusListCredential", async () => {
    const res = await app.request(
      "/status-lists",
      json(
        {
          id: TEST_UUID,
          vc: createTestBitstringCredential({
            type: ["VerifiableCredential"],
          }),
        },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when vc is missing the VCDM 2.0 context", async () => {
    const res = await app.request(
      "/status-lists",
      json(
        {
          id: TEST_UUID,
          vc: createTestBitstringCredential({
            "@context": ["https://example.com"],
          }),
        },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when credentialSubject is missing encodedList", async () => {
    const vc = createTestBitstringCredential();
    // @ts-expect-error intentionally removing a required field
    delete vc.credentialSubject.encodedList;
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, vc }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when encodedList is not valid gzip data", async () => {
    const vc = createTestBitstringCredential({}, { encodedList: "uH4sIA" });
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, vc }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("returns 400 when encodedList is shorter than 131072 bits", async () => {
    const shortList = `u${gzipSync(Buffer.alloc(8)).toString("base64url")}`;
    const vc = createTestBitstringCredential({}, { encodedList: shortList });
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, vc }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });

  it("creates a bitstring status list and returns 201 with id", async () => {
    const res = await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: TEST_UUID });
  });

  it("still creates a token status list and returns 201 with id", async () => {
    const res = await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, jwt: createTestStatusListJwt() },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: TEST_UUID });
  });
});

describe("PATCH /status-lists/:list_id (bitstring)", () => {
  it("returns 401 when no API key is provided", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch({ vc: createTestBitstringCredential() }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("updates a bitstring status list and returns 200 with id", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch({ vc: createTestBitstringCredential() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TEST_UUID });
  });

  it("returns 400 when statusSize changes", async () => {
    await app.request(
      "/status-lists",
      json(
        {
          id: TEST_UUID,
          vc: createTestBitstringCredential({}, { statusSize: 1 }),
        },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch(
        { vc: createTestBitstringCredential({}, { statusSize: 2 }) },
        { "x-api-key": API_KEY },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "statusSize cannot be changed after creation",
    });
  });

  it("returns 400 when a token payload targets a bitstring list", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch({ jwt: createTestStatusListJwt() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Payload format does not match stored format",
    });
  });

  it("returns 400 when a bitstring payload targets a token list", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, jwt: createTestStatusListJwt() },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch({ vc: createTestBitstringCredential() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Payload format does not match stored format",
    });
  });

  it("returns 404 when status list does not exist", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch({ vc: createTestBitstringCredential() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("GET /status-lists/:list_id (bitstring)", () => {
  it("returns the bitstring credential with application/ld+json content type", async () => {
    const vc = createTestBitstringCredential();
    await app.request(
      "/status-lists",
      json({ id: TEST_UUID_2, vc }, { "x-api-key": API_KEY }),
    );

    const res = await app.request(`/status-lists/${TEST_UUID_2}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/ld+json");
    expect(await res.json()).toEqual(vc);
  });
});

describe("PATCH /status-lists/:list_id optimistic concurrency", () => {
  it("returns and increments the ETag version", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );

    const getBefore = await app.request(`/status-lists/${TEST_UUID}`);
    expect(getBefore.headers.get("etag")).toBe('"0"');

    const patchRes = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch(
        { vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY, "if-match": '"0"' },
      ),
    );
    expect(patchRes.status).toBe(200);
    expect(patchRes.headers.get("etag")).toBe('"1"');

    const getAfter = await app.request(`/status-lists/${TEST_UUID}`);
    expect(getAfter.headers.get("etag")).toBe('"1"');
  });

  it("rejects a stale If-Match with 412", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch(
        { vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY, "if-match": '"5"' },
      ),
    );
    expect(res.status).toBe(412);
    expect(await res.json()).toEqual({ error: "Status list has been modified" });
  });

  it("rejects a malformed If-Match with 400", async () => {
    await app.request(
      "/status-lists",
      json(
        { id: TEST_UUID, vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY },
      ),
    );

    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      patch(
        { vc: createTestBitstringCredential() },
        { "x-api-key": API_KEY, "if-match": "nope" },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid If-Match header" });
  });
});

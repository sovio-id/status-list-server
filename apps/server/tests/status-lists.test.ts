import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { clearDb, createTestStatusListJwt } from "./helpers";

const TEST_UUID = "00000000-0000-4000-8000-000000000001";
const TEST_UUID_2 = "00000000-0000-4000-8000-000000000002";
const API_KEY = "test-api-key";

const json = (body: unknown, headers?: Record<string, string>) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await clearDb();
});

describe("GET /", () => {
  it("returns Status List Server HTML", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Status List Server");
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("POST /status-lists", () => {
  it("returns 401 when no API key is provided", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: createTestStatusListJwt() }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when wrong API key is provided", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: createTestStatusListJwt() }, { "x-api-key": "wrong-key" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when body is missing id", async () => {
    const res = await app.request(
      "/status-lists",
      json({ jwt: createTestStatusListJwt() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when id is not a valid UUID", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: "not-a-uuid", jwt: createTestStatusListJwt() }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when jwt is empty", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: "" }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when jwt is not a valid status list JWT", async () => {
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: "header.payload.sig" }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid status list JWT" });
  });

  it("creates a status list and returns 201 with id", async () => {
    const jwt = createTestStatusListJwt();
    const res = await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt }, { "x-api-key": API_KEY }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: TEST_UUID });
  });
});

describe("PATCH /status-lists/:list_id", () => {
  it("returns 401 when no API key is provided", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jwt: createTestStatusListJwt() }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when wrong API key is provided", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": "wrong-key" },
        body: JSON.stringify({ jwt: createTestStatusListJwt() }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when list_id is not a valid UUID", async () => {
    const res = await app.request(
      "/status-lists/not-a-uuid",
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: createTestStatusListJwt() }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid list ID" });
  });

  it("returns 400 when jwt is empty", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: "" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 404 when status list does not exist", async () => {
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: createTestStatusListJwt() }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 400 when jwt is not a valid status list JWT", async () => {
    const validJwt = createTestStatusListJwt();
    await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: validJwt }, { "x-api-key": API_KEY }),
    );

    const invalidJwt = "header.payload.sig";
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: invalidJwt }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid status list JWT" });
  });

  it("returns 400 when bits_per_status changes", async () => {
    const jwt1bit = createTestStatusListJwt(1);
    await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt: jwt1bit }, { "x-api-key": API_KEY }),
    );

    const jwt2bit = createTestStatusListJwt(2);
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: jwt2bit }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bits cannot be changed after creation" });
  });

  it("updates status list and returns 200 with id", async () => {
    const jwt = createTestStatusListJwt();
    await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt }, { "x-api-key": API_KEY }),
    );

    const updatedJwt = createTestStatusListJwt();
    const res = await app.request(
      `/status-lists/${TEST_UUID}`,
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ jwt: updatedJwt }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: TEST_UUID });
  });
});

describe("GET /status-lists/:list_id", () => {
  it("returns 400 when list_id is not a valid UUID", async () => {
    const res = await app.request("/status-lists/not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid list ID" });
  });

  it("returns 404 when status list does not exist", async () => {
    const res = await app.request(`/status-lists/${TEST_UUID_2}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns status list JWT with correct content type", async () => {
    const jwt = createTestStatusListJwt();
    await app.request(
      "/status-lists",
      json({ id: TEST_UUID, jwt }, { "x-api-key": API_KEY }),
    );

    const res = await app.request(`/status-lists/${TEST_UUID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/statuslist+jwt");
    expect(await res.text()).toBe(jwt);
  });
});

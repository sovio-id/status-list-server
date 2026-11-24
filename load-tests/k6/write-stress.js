/* global __ENV, open */
import { check } from "k6";
import http from "k6/http";

const seed = JSON.parse(open("../.run/.seed.json"));

const BASE_URL = __ENV.BASE_URL || seed.baseUrl;
const API_KEY = __ENV.API_KEY || seed.apiKey;
const JWT = seed.tokenJwt;
const TOKEN_LIST_IDS = seed.tokenListIds;
const MAX_RATE = Number(__ENV.WRITE_MAX_RATE || 500);
const STAGE = __ENV.STAGE_DURATION || "1m";

const jsonHeaders = {
  "content-type": "application/json",
  "x-api-key": API_KEY,
};

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const stage = (fraction) => ({
  target: Math.max(1, Math.round(MAX_RATE * fraction)),
  duration: STAGE,
});

export const options = {
  scenarios: {
    creates: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      stages: [stage(0.1), stage(0.2), stage(0.4), stage(1)],
      preAllocatedVUs: Math.max(20, MAX_RATE),
      maxVUs: Math.max(40, MAX_RATE * 2),
      exec: "create",
    },
    updates: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      stages: [stage(0.1), stage(0.2), stage(0.4), stage(0.4)],
      preAllocatedVUs: Math.max(20, Math.round(MAX_RATE / 2)),
      maxVUs: Math.max(40, MAX_RATE),
      exec: "update",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
    checks: ["rate>0.99"],
  },
};

export function create() {
  const res = http.post(
    `${BASE_URL}/status-lists`,
    JSON.stringify({ id: uuidv4(), jwt: JWT }),
    { headers: jsonHeaders },
  );
  check(res, { "create 201": (r) => r.status === 201 });
}

export function update() {
  const res = http.patch(
    `${BASE_URL}/status-lists/${pick(TOKEN_LIST_IDS)}`,
    JSON.stringify({ jwt: JWT }),
    { headers: jsonHeaders },
  );
  check(res, { "patch 200": (r) => r.status === 200 });
}

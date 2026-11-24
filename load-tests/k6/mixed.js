/* global __ENV, open */
import { check } from "k6";
import http from "k6/http";

const seed = JSON.parse(open("../.run/.seed.json"));

const BASE_URL = __ENV.BASE_URL || seed.baseUrl;
const API_KEY = __ENV.API_KEY || seed.apiKey;
const JWT = seed.tokenJwt;
const LIST_IDS = seed.listIds;
const TOKEN_LIST_IDS = seed.tokenListIds;
const DURATION = __ENV.DURATION || "30s";
const VUS = Number(__ENV.VUS || 50);
const RATE = Number(__ENV.RATE || 20);

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

export const options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      vus: 2,
      duration: DURATION,
      exec: "health",
    },
    reads: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      exec: "read",
    },
    writes: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(10, RATE),
      exec: "write",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
};

export function health() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { "health 200": (r) => r.status === 200 });
}

export function read() {
  const res = http.get(`${BASE_URL}/status-lists/${pick(LIST_IDS)}`);
  check(res, { "get 200": (r) => r.status === 200 });
}

export function write() {
  if (Math.random() < 0.5) {
    const res = http.post(
      `${BASE_URL}/status-lists`,
      JSON.stringify({ id: uuidv4(), jwt: JWT }),
      { headers: jsonHeaders },
    );
    check(res, { "create 201": (r) => r.status === 201 });
  } else {
    const res = http.patch(
      `${BASE_URL}/status-lists/${pick(TOKEN_LIST_IDS)}`,
      JSON.stringify({ jwt: JWT }),
      { headers: jsonHeaders },
    );
    check(res, { "patch 200": (r) => r.status === 200 });
  }
}

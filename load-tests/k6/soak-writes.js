/* global __ENV, open */
import { check } from "k6";
import http from "k6/http";

const seed = JSON.parse(open("../.run/.seed.json"));

const BASE_URL = __ENV.BASE_URL || seed.baseUrl;
const API_KEY = __ENV.API_KEY || seed.apiKey;
const JWT = seed.tokenJwt;
const TOKEN_LIST_IDS = seed.tokenListIds;
const RATE = Number(__ENV.SOAK_WRITE_RATE || 10);
const DURATION = __ENV.DURATION || "15m";

const toSeconds = (value) => {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value);
  if (!match) return 900;
  const amount = Number(match[1]);
  if (match[2] === "h") return amount * 3600;
  if (match[2] === "m") return amount * 60;
  if (match[2] === "ms") return amount / 1000;
  return amount;
};

const MAX_DURATION = `${Math.ceil((toSeconds(DURATION) + 120) / 60)}m`;

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
  maxDuration: MAX_DURATION,
  gracefulStop: "30s",
  scenarios: {
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

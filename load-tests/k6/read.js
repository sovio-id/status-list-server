/* global __ENV, open */
import { check } from "k6";
import http from "k6/http";

const seed = JSON.parse(open("../.run/.seed.json"));

const BASE_URL = __ENV.BASE_URL || seed.baseUrl;
const LIST_IDS = seed.listIds;
const DURATION = __ENV.DURATION || "30s";
const VUS = Number(__ENV.VUS || 100);

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

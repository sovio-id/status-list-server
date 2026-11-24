import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createBitstringCreateBody,
  createBitstringPatchBody,
  createStatusListJwt,
  createTokenCreateBody,
  createTokenPatchBody,
} from "./fixtures/generate";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const API_KEY = process.env.API_KEY ?? "loadtest-key";

const DATASETS: Record<string, number> = {
  small: 1000,
  medium: 10000,
  large: 100000,
};
const DATASET = process.env.SEED_DATASET ?? "small";
const preset = DATASETS[DATASET];
if (preset === undefined) {
  throw new Error(
    `Unknown SEED_DATASET "${DATASET}"; use small, medium, or large`,
  );
}
const TOTAL = Number(process.env.SEED_TOTAL ?? preset);
const countFromEnv = (name: string): number | undefined => {
  const value = process.env[name];
  return value ? Number(value) : undefined;
};
const TOKEN_COUNT = countFromEnv("SEED_TOKEN_COUNT") ?? Math.ceil(TOTAL / 2);
const BITSTRING_COUNT =
  countFromEnv("SEED_BITSTRING_COUNT") ?? TOTAL - TOKEN_COUNT;
const CONCURRENCY = Math.max(1, Number(process.env.SEED_CONCURRENCY ?? 50));

const RUN_DIR = join(import.meta.dir, ".run");
const SEED_FILE = join(RUN_DIR, ".seed.json");

const sequentialUuid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function post(path: string, body: unknown): Promise<void> {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(body),
    });
    if (res.status === 201) return;
    lastError = `${res.status}: ${await res.text()}`;
    if (res.status < 500) break;
    await sleep(100 * (attempt + 1));
  }
  throw new Error(`Seed failed for ${path}: ${lastError}`);
}

async function pool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
}

async function seedBatch(
  label: string,
  count: number,
  startIndex: number,
  body: (id: string) => unknown,
): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, i) =>
    sequentialUuid(startIndex + i + 1),
  );
  let completed = 0;

  console.log(`Seeding ${count} ${label} lists (concurrency ${CONCURRENCY})`);
  await pool(ids, CONCURRENCY, async (id) => {
    await post("/status-lists", body(id));
    completed++;
    if (completed % 10000 === 0) {
      console.log(`  ${label}: ${completed}/${count}`);
    }
  });

  return ids;
}

async function main(): Promise<void> {
  mkdirSync(RUN_DIR, { recursive: true });

  const tokenListIds = await seedBatch(
    "token",
    TOKEN_COUNT,
    0,
    createTokenCreateBody,
  );
  const bitstringListIds = await seedBatch(
    "bitstring",
    BITSTRING_COUNT,
    TOKEN_COUNT,
    createBitstringCreateBody,
  );

  const seed = {
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    dataset: DATASET,
    listIds: [...tokenListIds, ...bitstringListIds],
    tokenListIds,
    bitstringListIds,
    tokenJwt: createStatusListJwt(),
    tokenPatchBody: createTokenPatchBody(),
    bitstringPatchBody: createBitstringPatchBody(),
  };

  writeFileSync(SEED_FILE, `${JSON.stringify(seed, null, 2)}\n`);

  console.log(
    `Seeded ${TOKEN_COUNT} token + ${BITSTRING_COUNT} bitstring lists at ${BASE_URL}`,
  );
  console.log(`Seed metadata: ${SEED_FILE}`);
}

await main();

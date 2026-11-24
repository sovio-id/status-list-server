import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const resultsDir =
  process.argv[2] ?? join(import.meta.dir, "..", ".run", "results");
const reportPath = join(resultsDir, "report.md");

type Summary = {
  metrics?: {
    http_reqs?: { count?: number; rate?: number };
    http_req_failed?: { value?: number };
    http_req_duration?: {
      "p(95)"?: number;
      "p(99)"?: number;
      thresholds?: Record<string, boolean>;
    };
    checks?: { value?: number };
  };
  summary?: { successRate?: number; requestsPerSec?: number };
  latencyPercentiles?: { p95?: number; p99?: number };
};

const readJson = (name: string): Summary | undefined => {
  const path = join(resultsDir, name);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Summary;
  } catch {
    return undefined;
  }
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[index];
};

const num = (value: unknown): string =>
  typeof value === "number" ? value.toFixed(2) : String(value ?? "-");

type K6Row = {
  name: string;
  requests: string;
  rate: string;
  failed: string;
  p95: string;
  p99: string;
  checks: string;
  thresholds: string;
};

const k6Row = (name: string, file: string): K6Row | undefined => {
  const data = readJson(file);
  if (!data) return undefined;
  const metrics = data.metrics ?? {};
  const reqs = metrics.http_reqs?.count ?? 0;
  const rate = metrics.http_reqs?.rate ?? 0;
  const failed = metrics.http_req_failed?.value ?? 0;
  const duration = metrics.http_req_duration ?? {};
  const checks = metrics.checks?.value ?? 0;
  const thresholds = Object.entries(duration.thresholds ?? {})
    .map(([key, value]) => `${key}:${value ? "fail" : "pass"}`)
    .join(", ");

  return {
    name,
    requests: String(reqs),
    rate: num(rate),
    failed: `${(failed * 100).toFixed(2)}%`,
    p95: num(duration["p(95)"]),
    p99: num(duration["p(99)"]),
    checks: `${(checks * 100).toFixed(2)}%`,
    thresholds: thresholds || "-",
  };
};

type OhaRow = {
  name: string;
  rate: string;
  p95: string;
  p99: string;
  success: string;
};

const ohaRow = (name: string, file: string): OhaRow | undefined => {
  const data = readJson(file);
  if (!data) return undefined;
  const summary = data.summary ?? {};
  const latency = data.latencyPercentiles ?? {};
  return {
    name,
    rate: num(summary.requestsPerSec),
    p95: num(latency.p95 === undefined ? undefined : latency.p95 * 1000),
    p99: num(latency.p99 === undefined ? undefined : latency.p99 * 1000),
    success: `${((summary.successRate ?? 0) * 100).toFixed(2)}%`,
  };
};

const table = (headers: string[], rows: (string | undefined)[][]): string => {
  const present = rows.filter((row) => row?.[0] !== undefined);
  if (present.length === 0) return "_No data_\n";
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...present.map((row) => `| ${row.join(" | ")} |`),
  ];
  return `${lines.join("\n")}\n`;
};

const k6Table = (rows: (K6Row | undefined)[]): string =>
  table(
    [
      "Scenario",
      "Requests",
      "req/s",
      "Failed",
      "p95 (ms)",
      "p99 (ms)",
      "Checks",
      "Thresholds",
    ],
    rows.map((row) =>
      row
        ? [
            row.name,
            row.requests,
            row.rate,
            row.failed,
            row.p95,
            row.p99,
            row.checks,
            row.thresholds,
          ]
        : undefined,
    ),
  );

const ohaTable = (rows: (OhaRow | undefined)[]): string =>
  table(
    ["Target", "req/s", "p95 (ms)", "p99 (ms)", "Success"],
    rows.map((row) =>
      row ? [row.name, row.rate, row.p95, row.p99, row.success] : undefined,
    ),
  );

type SoakReads = {
  requests: number;
  rate: string;
  success: string;
  p95: string;
  p99: string;
  firstP95: string;
  lastP95: string;
  windowSeconds: number;
};

const soakReads = (): SoakReads | undefined => {
  const path = join(resultsDir, "soak-reads.csv");
  if (!existsSync(path)) return undefined;
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const rows = lines
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(","));
  const latencies: { start: number; duration: number; ok: boolean }[] = [];
  for (const cols of rows) {
    const start = Number(cols[0]);
    const duration = Number(cols[4]);
    const status = Number(cols[6]);
    if (!Number.isFinite(start) || !Number.isFinite(duration)) continue;
    latencies.push({ start, duration, ok: status >= 200 && status < 400 });
  }
  if (latencies.length === 0) return undefined;

  const maxStart = Math.max(...latencies.map((item) => item.start));
  const windowSeconds = Math.min(300, Math.max(1, Math.round(maxStart / 3)));
  const all = latencies.map((item) => item.duration * 1000);
  const first = latencies
    .filter((item) => item.start <= windowSeconds)
    .map((item) => item.duration * 1000);
  const last = latencies
    .filter((item) => item.start >= maxStart - windowSeconds)
    .map((item) => item.duration * 1000);
  const successes = latencies.filter((item) => item.ok).length;

  return {
    requests: latencies.length,
    rate: num(latencies.length / Math.max(1, maxStart)),
    success: `${((successes / latencies.length) * 100).toFixed(2)}%`,
    p95: num(percentile(all, 95)),
    p99: num(percentile(all, 99)),
    firstP95: num(percentile(first, 95)),
    lastP95: num(percentile(last, 95)),
    windowSeconds,
  };
};

type SoakResources = {
  peakMem: string;
  maxDb: string;
  avgCpu: string;
  samples: number;
};

const soakResources = (): SoakResources | undefined => {
  const path = join(resultsDir, "soak-samples.csv");
  if (!existsSync(path)) return undefined;
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const rows = lines
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(","));
  if (rows.length === 0) return undefined;
  const cpu = rows.map((cols) => Number(cols[1]) || 0);
  const mem = rows.map((cols) => cols[2] ?? "0");
  const db = rows.map((cols) => Number(cols[3]) || 0);
  return {
    peakMem: mem.reduce(
      (best, value) => (parseMem(value) > parseMem(best) ? value : best),
      "0",
    ),
    maxDb: `${(Math.max(...db) / 1024 / 1024).toFixed(2)} MiB`,
    avgCpu: `${(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2)}%`,
    samples: rows.length,
  };
};

const parseMem = (value: string): number => {
  const match = value.match(/([\d.]+)\s*(KiB|MiB|GiB|KB|MB|GB)?/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "KB").toLowerCase();
  if (unit === "mib" || unit === "mb") return amount * 1024;
  if (unit === "gib" || unit === "gb") return amount * 1024 * 1024;
  return amount;
};

const sections: string[] = [
  "# Load test report",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Mixed workload (k6)",
  "",
  k6Table([k6Row("mixed", "k6-mixed-summary.json")]),
  "## Read sweep (oha)",
  "",
  ohaTable(
    readdirSync(resultsDir)
      .filter((name) => /^read-(qps|health)-.*\.json$/.test(name))
      .sort((a, b) => {
        const qps = (name: string) => Number(name.match(/\d+/)?.[0] ?? 0);
        return qps(a) - qps(b);
      })
      .map((name) => ohaRow(name.replace(/\.json$/, ""), name)),
  ),
  "## Simple read benchmarks (oha)",
  "",
  ohaTable([
    ohaRow("health", "oha-health.json"),
    ohaRow("GET /status-lists/:id", "oha-get.json"),
  ]),
  "## Write stress (k6)",
  "",
  k6Table([k6Row("write stress", "write-stress-summary.json")]),
  "## Soak",
  "",
];

const reads = soakReads();
sections.push(
  reads
    ? table(
        [
          "Requests",
          "req/s",
          "Success",
          "p95 (ms)",
          "p99 (ms)",
          "Window (s)",
          "p95 first window",
          "p95 last window",
        ],
        [
          [
            String(reads.requests),
            reads.rate,
            reads.success,
            reads.p95,
            reads.p99,
            String(reads.windowSeconds),
            reads.firstP95,
            reads.lastP95,
          ],
        ],
      )
    : "_No soak read data_\n",
);

const resources = soakResources();
sections.push(
  resources
    ? table(
        ["Samples", "Avg CPU", "Peak memory", "Max DB size"],
        [
          [
            String(resources.samples),
            resources.avgCpu,
            resources.peakMem,
            resources.maxDb,
          ],
        ],
      )
    : "_No soak resource data_\n",
);

sections.push("## Soak writes (k6)", "");
sections.push(k6Table([k6Row("soak writes", "soak-writes-summary.json")]));

sections.push("## Raw artifacts", "");
sections.push(
  readdirSync(resultsDir)
    .filter((name) => name !== "report.md" && !name.startsWith(".soak"))
    .map((name) => `- ${name}`)
    .join("\n"),
  "",
);

writeFileSync(reportPath, sections.join("\n"));
console.log(`Report written to ${reportPath}`);

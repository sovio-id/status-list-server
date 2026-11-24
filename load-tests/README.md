# Load tests

Reproducible load-testing harness for the status-list server. It covers the
full request surface:

| Endpoint | Method | Scenario |
|---|---|---|
| `/health` | GET | baseline / upper bound |
| `/status-lists/:id` | GET | read-heavy |
| `/status-lists` | POST | write (create) |
| `/status-lists/:id` | PATCH | write (update) |

Two tools are used, matching Bun's [benchmarking guidance](https://bun.com/docs/project/benchmarking#benchmarking-tools):

- **[k6](https://k6.io)** — drives the mixed workload, write stress, and soak
  writers (dynamic UUIDs, headers, thresholds).
- **[oha](https://github.com/hatoo/oha)** — a fast Rust generator used for the
  read throughput sweep, per-endpoint reads, and soak readers.

> Bun warns that Node-based generators such as `autocannon` cannot saturate
> `Bun.serve()`; `k6` (Go) and `oha` (Rust) are both fast enough.

## Layout

```
load-tests/
├── fixtures/generate.ts      # valid JWT + bitstring bodies (built-in zlib only)
├── seed.ts                   # creates lists, writes .run/.seed.json
├── k6/mixed.js               # health + GET + POST + PATCH
├── k6/read.js                # read-only baseline
├── k6/write-stress.js        # ramping POST/PATCH pressure
├── k6/soak-writes.js         # steady low-rate writer
├── oha/run.sh                # per-endpoint reads
├── scenarios/read-sweep.sh   # QPS sweep: 1k -> 10k
├── scenarios/soak.sh         # combined load + resource sampling
├── scripts/report.ts         # JSON/CSV -> results/report.md
├── run.sh                    # host harness (serve -> seed -> run)
├── docker-compose.yml        # containerized harness
├── Dockerfile.server         # source-based server image for the harness
├── docker-run.sh             # containerized orchestration
└── .run/                     # runtime artifacts (gitignored)
```

## Prerequisites

- Host harness: `bun`, plus `k6` and `oha`
  ```sh
  brew install k6 oha
  ```
- Docker harness: Docker with Compose v2 (no host tools required for load
  generation, but `bun` is used to generate reports).

## Scenarios

| Scenario | What it measures | Default |
|---|---|---|
| `mixed` | k6 mixed workload + oha single-endpoint reads | 30s |
| `read-sweep` | oha at 1k, 2.5k, 5k, 7.5k, 10k QPS + `/health` upper bound | 30s per step |
| `write-stress` | k6 ramping POST 10→500/s and PATCH 10→200/s | 1m per stage |
| `soak` | 5k QPS reads + 10 writes/s for 15m, with CPU/RSS/DB sampling | 15m |
| `all` | read-sweep, write-stress, then soak | — |

## Host harness

```sh
bun run loadtest                    # mixed
bun run loadtest:k6                 # k6 mixed only
bun run loadtest:oha                # oha reads only
bun run loadtest:read-sweep         # QPS sweep
bun run loadtest:write-stress       # write ramp
bun run loadtest:soak               # 15m soak
bun run loadtest:report             # regenerate report.md
```

It starts the server from source on an isolated port with a throwaway SQLite
DB, seeds data, runs the tests, then shuts down. Results land in
`load-tests/.run/results/`.

Options (pass through `run.sh`):

```sh
bash load-tests/run.sh --scenario read-sweep --qps-steps "1000 5000 10000"
bash load-tests/run.sh --scenario write-stress --max-rate 200 --stage-duration 30s
bash load-tests/run.sh --scenario soak --duration 2m --read-qps 2000
bash load-tests/run.sh --dataset medium --clean
```

| Flag | Default | Description |
|---|---|---|
| `--scenario` | `mixed` | `mixed`, `read-sweep`, `write-stress`, `soak`, `all` |
| `--tool` | `all` | legacy selector: `all`, `k6`, `oha` |
| `--duration` | `30s` | test duration (`15m` for soak / all) |
| `--dataset` | `small` | `small`=1k, `medium`=10k, `large`=100k lists |
| `--seed-concurrency` | `50` | parallel seed requests |
| `--vus` | `50` | k6 read virtual users |
| `--rate` | `20` | k6 mixed write requests/sec |
| `--concurrency` | `100` | oha concurrent connections |
| `--max-rate` | `500` | peak write-stress req/sec |
| `--stage-duration` | `1m` | write-stress ramp stage duration |
| `--read-qps` | `5000` | soak read target QPS |
| `--soak-write-rate` | `10` | soak write req/sec |
| `--qps-steps` | `1000 2500 5000 7500 10000` | read-sweep QPS steps |
| `--port` | `3100` | server port |
| `--clean` | off | remove `.run/` after the run |

## Docker harness

```sh
bun run loadtest:docker                  # mixed
bun run loadtest:docker:read-sweep
bun run loadtest:docker:write-stress
bun run loadtest:docker:soak
```

This builds the server image, runs the one-shot `fixtures` and `seed` services,
then runs the selected scenario on the same container network. Results are
written to `load-tests/.run/results/` on the host.

```sh
DURATION=2m bash load-tests/docker-run.sh --scenario soak --read-qps 2000
bash load-tests/docker-run.sh --scenario read-sweep --qps-steps "1000 5000"
```

> The Docker harness measures container-to-container traffic (bridge network),
> which adds a small, consistent overhead. Use the host harness when you need
> the absolute lowest-latency numbers.

## Interpreting results

Every run writes `load-tests/.run/results/report.md` plus the raw artifacts:

| Artifact | Contents |
|---|---|
| `report.md` | consolidated tables for all scenarios |
| `k6-mixed-summary.json` | mixed workload percentiles and thresholds |
| `write-stress-summary.json` | write ramp failures and p95 |
| `soak-writes-summary.json` | soak writer failures and p95 |
| `read-qps-*.json` | per-QPS read sweep from oha |
| `read-health-*.json` | `/health` upper-bound reference |
| `oha-health.json`, `oha-get.json` | simple endpoint baselines |
| `soak-reads.csv` | per-request start/duration/status for latency drift |
| `soak-samples.csv` | elapsed time, CPU, memory, DB size |

The soak section compares read p95 in the first and last comparison windows
(5 minutes for the default 15-minute soak, shorter for validation runs) and
reports peak memory plus maximum DB size, so latency/resource drift is visible.

Thresholds: `http_req_failed < 1%` and `p(95) < 200ms` for k6 scenarios. A
non-zero k6 exit code means a threshold was breached.

## Notes and caveats

- **SQLite writes serialize.** All state lives in a single libsql file
  (`packages/db/src/index.ts`), so write throughput has a hard ceiling. The
  write scenarios are arrival-rate based to surface it.
- **Read sweep uses `--latency-correction`.** Required with oha's `-q` to avoid
  coordinated omission.
- **Request logging is disabled for benchmarks.** `logger()` is only enabled
  when `NODE_ENV !== "test"` (`apps/server/src/index.ts`), so the harness does
  not measure log I/O.
- **Fixtures use built-ins only.** The JWT/VC bodies are produced with
  `node:zlib` + base64url (see `fixtures/generate.ts`), so the seed container
  needs no npm dependencies. The server only *parses* the JWT, so a fake
  signature is sufficient.
- **The harness serves from source, not the production bundle.** The compiled
  `apps/server/dist/index.mjs` loads the native `@libsql` binding dynamically
  and the production `Dockerfile` runner stage ships no `node_modules`, so the
  bundle cannot start as-is. The harness (`run.sh` and `Dockerfile.server`)
  runs `apps/server/src/index.ts` directly, which is functionally identical over
  HTTP. See the note on the production image below.
- **`packages/db` migrations path.** It now uses `fileURLToPath`, so the server
  starts correctly even when the repository path contains spaces.

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$SCRIPT_DIR/.run"
RESULTS_DIR="$RUN_DIR/results"

TOOL="all"
SCENARIO="mixed"
SCENARIO_SET="false"
DURATION="30s"
DURATION_SET="false"
VUS="50"
CONC="100"
CONC_SET="false"
RATE="20"
DATASET="small"
SEED_CONCURRENCY="50"
MAX_RATE="500"
STAGE_DURATION="1m"
READ_QPS="5000"
SOAK_WRITE_RATE="10"
QPS_STEPS="1000 2500 5000 7500 10000"
CLEAN="false"
PORT="${PORT:-3100}"
API_KEY="${API_KEY:-loadtest-key}"
BASE_URL="http://localhost:$PORT"

usage() {
  cat <<'EOF'
Usage: run.sh [options]

Options:
  --scenario <mixed|read-sweep|write-stress|soak|all>
                            Scenario to run (default: mixed)
  --tool <all|k6|oha>       Legacy tool selector (default: all)
  --duration <dur>          Test duration, e.g. 30s, 2m (default: 30s; soak: 15m)
  --dataset <small|medium|large>
                            Seed dataset: 1k / 10k / 100k lists (default: small)
  --seed-concurrency <n>    Parallel seed requests (default: 50)
  --vus <n>                 k6 read virtual users (default: 50)
  --rate <n>                k6 write requests/sec (default: 20)
  --concurrency <n>         oha concurrent connections (default: 100)
  --max-rate <n>            Peak write-stress req/sec (default: 500)
  --stage-duration <dur>    Write-stress ramp stage duration (default: 1m)
  --read-qps <n>            Soak read target QPS (default: 5000)
  --soak-write-rate <n>     Soak write req/sec (default: 10)
  --qps-steps "<list>"      Read-sweep QPS steps (default: "1000 2500 5000 7500 10000")
  --port <n>                Server port (default: 3100)
  --clean                   Remove .run/ artifacts after the run
  -h, --help                Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario) SCENARIO="$2"; SCENARIO_SET="true"; shift 2 ;;
    --tool) TOOL="$2"; shift 2 ;;
    --duration) DURATION="$2"; DURATION_SET="true"; shift 2 ;;
    --dataset) DATASET="$2"; shift 2 ;;
    --seed-concurrency) SEED_CONCURRENCY="$2"; shift 2 ;;
    --vus) VUS="$2"; shift 2 ;;
    --rate) RATE="$2"; shift 2 ;;
    --concurrency) CONC="$2"; CONC_SET="true"; shift 2 ;;
    --max-rate) MAX_RATE="$2"; shift 2 ;;
    --stage-duration) STAGE_DURATION="$2"; shift 2 ;;
    --read-qps) READ_QPS="$2"; shift 2 ;;
    --soak-write-rate) SOAK_WRITE_RATE="$2"; shift 2 ;;
    --qps-steps) QPS_STEPS="$2"; shift 2 ;;
    --port) PORT="$2"; BASE_URL="http://localhost:$PORT"; shift 2 ;;
    --clean) CLEAN="true"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$SCENARIO_SET" == "false" ]]; then
  case "$TOOL" in
    k6) SCENARIO="mixed-k6" ;;
    oha) SCENARIO="mixed-oha" ;;
    all) SCENARIO="mixed" ;;
    *)
      echo "Unknown tool: $TOOL" >&2
      exit 1
      ;;
  esac
fi

case "$SCENARIO" in
  mixed | mixed-k6 | mixed-oha | read-sweep | write-stress | soak | all) ;;
  *)
    echo "Unknown scenario: $SCENARIO" >&2
    exit 1
    ;;
esac

if [[ "$SCENARIO" == "soak" || "$SCENARIO" == "all" ]] && [[ "$DURATION_SET" == "false" ]]; then
  DURATION="15m"
fi
if [[ "$SCENARIO" == "soak" || "$SCENARIO" == "all" ]] && [[ "$CONC_SET" == "false" ]]; then
  CONC="200"
fi

mkdir -p "$RESULTS_DIR"

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

read_list_id() {
  SEED_FILE="$RUN_DIR/.seed.json" bun -e \
    'const fs=require("node:fs");console.log(JSON.parse(fs.readFileSync(process.env.SEED_FILE,"utf8")).listIds[0])'
}

run_k6() {
  if ! command -v k6 >/dev/null 2>&1; then
    echo "k6 is not installed. Install it with: brew install k6" >&2
    exit 1
  fi
  echo "==> k6: mixed workload"
  BASE_URL="$BASE_URL" API_KEY="$API_KEY" LIST_ID="$LIST_ID" \
    DURATION="$DURATION" VUS="$VUS" RATE="$RATE" \
    k6 run --summary-export "$RESULTS_DIR/k6-mixed-summary.json" "$SCRIPT_DIR/k6/mixed.js"
}

run_oha() {
  BASE_URL="$BASE_URL" LIST_ID="$LIST_ID" DURATION="$DURATION" CONC="$CONC" \
    RESULTS_DIR="$RESULTS_DIR" bash "$SCRIPT_DIR/oha/run.sh"
}

run_read_sweep() {
  if ! command -v oha >/dev/null 2>&1; then
    echo "oha is not installed. Install it with: brew install oha" >&2
    exit 1
  fi
  BASE_URL="$BASE_URL" LIST_ID="$LIST_ID" RESULTS_DIR="$RESULTS_DIR" \
    STEP_DURATION="$DURATION" CONCURRENCY="$CONC" QPS_STEPS="$QPS_STEPS" \
    bash "$SCRIPT_DIR/scenarios/read-sweep.sh"
}

run_write_stress() {
  if ! command -v k6 >/dev/null 2>&1; then
    echo "k6 is not installed. Install it with: brew install k6" >&2
    exit 1
  fi
  BASE_URL="$BASE_URL" API_KEY="$API_KEY" \
    WRITE_MAX_RATE="$MAX_RATE" STAGE_DURATION="$STAGE_DURATION" \
    k6 run --summary-export "$RESULTS_DIR/write-stress-summary.json" \
    "$SCRIPT_DIR/k6/write-stress.js"
}

run_soak() {
  if ! command -v k6 >/dev/null 2>&1 || ! command -v oha >/dev/null 2>&1; then
    echo "Soak requires k6 and oha. Install them with: brew install k6 oha" >&2
    exit 1
  fi
  MODE="host" BASE_URL="$BASE_URL" API_KEY="$API_KEY" LIST_ID="$LIST_ID" \
    RESULTS_DIR="$RESULTS_DIR" SERVER_PID="$SERVER_PID" DB_FILE="$RUN_DIR/loadtest.db" \
    DURATION="$DURATION" SOAK_READ_QPS="$READ_QPS" SOAK_WRITE_RATE="$SOAK_WRITE_RATE" \
    CONCURRENCY="$CONC" bash "$SCRIPT_DIR/scenarios/soak.sh"
}

echo "==> Starting server at $BASE_URL"
DB_FILE="$RUN_DIR/loadtest.db"
rm -f "$DB_FILE"
DATABASE_URL="file:$DB_FILE" API_KEY="$API_KEY" PORT="$PORT" NODE_ENV=test \
  bun run "$REPO_ROOT/apps/server/src/index.ts" > "$RUN_DIR/server.log" 2>&1 &
SERVER_PID=$!

echo "==> Waiting for server to be ready"
ready="false"
for _ in $(seq 1 60); do
  if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    ready="true"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server exited before becoming ready:" >&2
    cat "$RUN_DIR/server.log" >&2
    exit 1
  fi
  sleep 0.5
done
if [[ "$ready" != "true" ]]; then
  echo "Timed out waiting for server" >&2
  exit 1
fi

echo "==> Seeding dataset: $DATASET"
BASE_URL="$BASE_URL" API_KEY="$API_KEY" SEED_DATASET="$DATASET" \
  SEED_CONCURRENCY="$SEED_CONCURRENCY" bun run "$SCRIPT_DIR/seed.ts"

LIST_ID="$(read_list_id)"

case "$SCENARIO" in
  mixed) run_k6; run_oha ;;
  mixed-k6) run_k6 ;;
  mixed-oha) run_oha ;;
  read-sweep) run_read_sweep ;;
  write-stress) run_write_stress ;;
  soak) run_soak ;;
  all) run_read_sweep; run_write_stress; run_soak ;;
esac

if [[ "$CLEAN" != "true" ]]; then
  bun run "$SCRIPT_DIR/scripts/report.ts" "$RESULTS_DIR"
fi

if [[ "$CLEAN" == "true" ]]; then
  rm -rf "$RUN_DIR"
fi

echo "==> Done. Results in $RESULTS_DIR"

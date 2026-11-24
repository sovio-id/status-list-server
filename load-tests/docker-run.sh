#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
RUN_DIR="$SCRIPT_DIR/.run"
RESULTS_DIR="$RUN_DIR/results"

TOOL="all"
SCENARIO="mixed"
SCENARIO_SET="false"
DURATION="30s"
DURATION_SET="false"
VUS="${VUS:-50}"
RATE="${RATE:-20}"
CONC="${CONC:-100}"
CONC_SET="false"
DATASET="small"
SEED_CONCURRENCY="50"
MAX_RATE="500"
STAGE_DURATION="1m"
READ_QPS="5000"
SOAK_WRITE_RATE="10"
QPS_STEPS="1000 2500 5000 7500 10000"
API_KEY="${API_KEY:-loadtest-key}"

usage() {
  cat <<'EOF'
Usage: docker-run.sh [options]

Runs the containerized harness: builds the server, seeds data, then runs the
selected scenario against the container network.

Options:
  --scenario <mixed|read-sweep|write-stress|soak|all>
                            Scenario to run (default: mixed)
  --tool <all|k6|oha>       Legacy tool selector (default: all)
  --duration <dur>          Test duration (default: 30s; soak: 15m)
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

export API_KEY DURATION VUS RATE CONC DATASET SEED_CONCURRENCY
export WRITE_MAX_RATE="$MAX_RATE" STAGE_DURATION SOAK_WRITE_RATE

mkdir -p "$RESULTS_DIR"
chmod 777 "$RESULTS_DIR" 2>/dev/null || true

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

cleanup() {
  dc down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

read_list_id() {
  SEED_FILE="$RUN_DIR/.seed.json" bun -e \
    'const fs=require("node:fs");console.log(JSON.parse(fs.readFileSync(process.env.SEED_FILE,"utf8")).listIds[0])'
}

run_mixed_k6() {
  echo "==> k6: mixed workload"
  dc --profile k6 run --rm -T k6
}

run_mixed_oha() {
  echo "==> oha: GET /health"
  dc --profile oha run --rm -T oha --no-tui -z "$DURATION" -c "$CONC" \
    --output-format json "http://server:3000/health" \
    > "$RESULTS_DIR/oha-health.json"

  echo "==> oha: GET /status-lists/$LIST_ID"
  dc --profile oha run --rm -T oha --no-tui -z "$DURATION" -c "$CONC" \
    --output-format json "http://server:3000/status-lists/$LIST_ID" \
    > "$RESULTS_DIR/oha-get.json"
}

run_read_sweep() {
  MODE=docker LIST_ID="$LIST_ID" RESULTS_DIR="$RESULTS_DIR" \
    COMPOSE_FILE="$COMPOSE_FILE" STEP_DURATION="$DURATION" CONCURRENCY="$CONC" \
    QPS_STEPS="$QPS_STEPS" bash "$SCRIPT_DIR/scenarios/read-sweep.sh"
}

run_write_stress() {
  echo "==> k6: write stress (max $MAX_RATE req/s)"
  dc --profile k6 run --rm -T \
    -e WRITE_MAX_RATE="$MAX_RATE" -e STAGE_DURATION="$STAGE_DURATION" \
    k6 run --summary-export /lt/.run/results/write-stress-summary.json \
    /lt/k6/write-stress.js
}

run_soak() {
  echo "==> starting soak"
  local container
  container="$(dc ps -q server)"
  if [[ -z "$container" ]]; then
    echo "Server container is not running" >&2
    exit 1
  fi
  MODE=docker BASE_URL="http://server:3000" API_KEY="$API_KEY" LIST_ID="$LIST_ID" \
    RESULTS_DIR="$RESULTS_DIR" COMPOSE_FILE="$COMPOSE_FILE" CONTAINER="$container" \
    DURATION="$DURATION" SOAK_READ_QPS="$READ_QPS" SOAK_WRITE_RATE="$SOAK_WRITE_RATE" \
    CONCURRENCY="$CONC" bash "$SCRIPT_DIR/scenarios/soak.sh"
}

echo "==> Building and starting server"
dc up -d --build server

echo "==> Generating fixtures"
dc run --rm fixtures

echo "==> Seeding dataset: $DATASET"
dc run --rm seed

LIST_ID="$(read_list_id)"

case "$SCENARIO" in
  mixed) run_mixed_k6; run_mixed_oha ;;
  mixed-k6) run_mixed_k6 ;;
  mixed-oha) run_mixed_oha ;;
  read-sweep) run_read_sweep ;;
  write-stress) run_write_stress ;;
  soak) run_soak ;;
  all) run_read_sweep; run_write_stress; run_soak ;;
esac

bun run "$SCRIPT_DIR/scripts/report.ts" "$RESULTS_DIR"

echo "==> Done. Results in $RESULTS_DIR"

#!/usr/bin/env bash
set -euo pipefail

: "${LIST_ID:?LIST_ID is required}"
: "${RESULTS_DIR:?RESULTS_DIR is required}"
: "${BASE_URL:-http://server:3000}"

STEP_DURATION="${STEP_DURATION:-30s}"
CONCURRENCY="${CONCURRENCY:-200}"
QPS_STEPS="${QPS_STEPS:-1000 2500 5000 7500 10000}"
MODE="${MODE:-host}"

if [[ "$MODE" == "docker" ]]; then
  : "${COMPOSE_FILE:?COMPOSE_FILE is required}"
  oha_cmd=(docker compose -f "$COMPOSE_FILE" --profile oha run --rm -T oha)
  out_dir="/lt/.run/results"
  target_base="http://server:3000"
else
  : "${BASE_URL:?BASE_URL is required}"
  if ! command -v oha >/dev/null 2>&1; then
    echo "oha is not installed. Install it with: brew install oha" >&2
    exit 1
  fi
  oha_cmd=(oha)
  out_dir="$RESULTS_DIR"
  target_base="$BASE_URL"
fi

mkdir -p "$RESULTS_DIR"

run_oha() {
  local name="$1"
  local url="$2"
  echo "==> read sweep: $name @ $qps qps"
  "${oha_cmd[@]}" --no-tui -z "$STEP_DURATION" -c "$CONCURRENCY" -q "$qps" \
    --latency-correction -t "${REQUEST_TIMEOUT:-15s}" --output-format json \
    -o "$out_dir/$name.json" "$url"
}

for qps in $QPS_STEPS; do
  run_oha "read-qps-$qps" "$target_base/status-lists/$LIST_ID"
done

max_qps="${QPS_STEPS##* }"
qps="$max_qps"
run_oha "read-health-$max_qps" "$target_base/health"

echo "==> read sweep results written to $RESULTS_DIR"

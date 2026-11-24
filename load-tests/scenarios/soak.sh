#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${LIST_ID:?LIST_ID is required}"
: "${RESULTS_DIR:?RESULTS_DIR is required}"
: "${API_KEY:-loadtest-key}"

MODE="${MODE:-host}"
DURATION="${DURATION:-15m}"
READ_QPS="${SOAK_READ_QPS:-5000}"
WRITE_RATE="${SOAK_WRITE_RATE:-10}"
CONCURRENCY="${CONCURRENCY:-200}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-10}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-15s}"

duration_seconds() {
  local value="$1"
  local number unit
  if [[ "$value" =~ ^([0-9]+)(ms|s|m|h)$ ]]; then
    number="${BASH_REMATCH[1]}"
    unit="${BASH_REMATCH[2]}"
    case "$unit" in
      h) echo $((number * 3600)) ;;
      m) echo $((number * 60)) ;;
      ms) echo 0 ;;
      s) echo "$number" ;;
    esac
  else
    echo 900
  fi
}

DEADLINE=$(( $(duration_seconds "$DURATION") + 120 ))

mkdir -p "$RESULTS_DIR"

if [[ "$MODE" == "docker" ]]; then
  : "${COMPOSE_FILE:?COMPOSE_FILE is required}"
  : "${CONTAINER:?CONTAINER is required}"

  read_cmd=(
    docker compose -f "$COMPOSE_FILE" --profile oha run --rm -T oha
    --no-tui -z "$DURATION" -c "$CONCURRENCY" -q "$READ_QPS"
    -t "$REQUEST_TIMEOUT" --output-format csv
    -o /lt/.run/results/soak-reads.csv
    "$BASE_URL/status-lists/$LIST_ID"
  )
  write_cmd=(
    docker compose -f "$COMPOSE_FILE" --profile k6 run --rm -T
    -e BASE_URL="$BASE_URL" -e API_KEY="$API_KEY"
    -e DURATION="$DURATION" -e SOAK_WRITE_RATE="$WRITE_RATE"
    k6 run --summary-export /lt/.run/results/soak-writes-summary.json
    /lt/k6/soak-writes.js
  )
else
  : "${SERVER_PID:?SERVER_PID is required for host mode}"

  read_cmd=(
    oha --no-tui -z "$DURATION" -c "$CONCURRENCY" -q "$READ_QPS"
    -t "$REQUEST_TIMEOUT" --output-format csv
    -o "$RESULTS_DIR/soak-reads.csv" "$BASE_URL/status-lists/$LIST_ID"
  )
  write_cmd=(
    env BASE_URL="$BASE_URL" API_KEY="$API_KEY"
    DURATION="$DURATION" SOAK_WRITE_RATE="$WRITE_RATE"
    k6 run --summary-export "$RESULTS_DIR/soak-writes-summary.json"
    "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/k6/soak-writes.js"
  )
fi

echo "==> soak: reads @ $READ_QPS qps + writes @ $WRITE_RATE/s for $DURATION"
echo "==> soak hard deadline: ${DEADLINE}s (loads are stopped if they overrun)"

"${read_cmd[@]}" > "$RESULTS_DIR/soak-reads.log" 2>&1 &
READS_PID=$!
"${write_cmd[@]}" > "$RESULTS_DIR/soak-writes.log" 2>&1 &
WRITES_PID=$!

DONE="$RESULTS_DIR/.soak-done"
TIMEOUT_FLAG="$RESULTS_DIR/.soak-timeout"
rm -f "$DONE" "$TIMEOUT_FLAG"
started=$(date +%s)

(
  while kill -0 "$READS_PID" 2>/dev/null || kill -0 "$WRITES_PID" 2>/dev/null; do
    if (( $(date +%s) - started >= DEADLINE )); then
      echo "==> soak deadline reached; stopping loads" >&2
      kill "$READS_PID" "$WRITES_PID" 2>/dev/null || true
      touch "$TIMEOUT_FLAG"
      break
    fi
    sleep 1
  done
  touch "$DONE"
) &
WATCH_PID=$!

CSV="$RESULTS_DIR/soak-samples.csv"
echo "elapsed_s,cpu_pct,mem,db_bytes" > "$CSV"
next_progress=60

while [[ ! -f "$DONE" ]]; do
  elapsed=$(( $(date +%s) - started ))
  cpu=""
  mem=""
  db=""

  if (( elapsed >= next_progress )); then
    echo "==> soak: ${elapsed}s elapsed"
    next_progress=$(( next_progress + 60 ))
  fi

  if [[ "$MODE" == "docker" ]]; then
    stats="$(docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}' "$CONTAINER" 2>/dev/null || true)"
    cpu="${stats%%|*}"
    mem="${stats#*|}"
  else
    line="$(ps -o rss=,pcpu= -p "$SERVER_PID" 2>/dev/null || true)"
    cpu="$(echo "$line" | awk '{print $2}')"
    mem="$(echo "$line" | awk '{print $1}')"
    if [[ -n "$mem" ]]; then
      mem="${mem}KB"
    fi
  fi

  if [[ "$MODE" == "docker" ]]; then
    db="$(docker exec "$CONTAINER" stat -c%s /app/loadtest.db 2>/dev/null || true)"
  elif [[ -n "${DB_FILE:-}" && -f "$DB_FILE" ]]; then
    db="$(stat -f%z "$DB_FILE" 2>/dev/null || stat -c%s "$DB_FILE" 2>/dev/null || true)"
  fi

  echo "$elapsed,${cpu:-0},${mem:-0},${db:-0}" >> "$CSV"
  sleep "$SAMPLE_INTERVAL"
done

wait "$WATCH_PID" 2>/dev/null || true
wait "$READS_PID" || true
wait "$WRITES_PID" || true

if [[ -f "$TIMEOUT_FLAG" ]]; then
  echo "==> WARNING: soak loads hit the hard deadline; results may be partial"
fi

echo "==> soak results written to $RESULTS_DIR"

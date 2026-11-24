#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${LIST_ID:?LIST_ID is required}"
: "${RESULTS_DIR:?RESULTS_DIR is required}"

DURATION="${DURATION:-30s}"
CONC="${CONC:-100}"

if ! command -v oha >/dev/null 2>&1; then
  echo "oha is not installed. Install it with: brew install oha" >&2
  exit 1
fi

mkdir -p "$RESULTS_DIR"

echo "==> oha: GET /health (-z $DURATION -c $CONC)"
oha --no-tui -z "$DURATION" -c "$CONC" --output-format json \
  -o "$RESULTS_DIR/oha-health.json" "$BASE_URL/health"

echo "==> oha: GET /status-lists/$LIST_ID (-z $DURATION -c $CONC)"
oha --no-tui -z "$DURATION" -c "$CONC" --output-format json \
  -o "$RESULTS_DIR/oha-get.json" "$BASE_URL/status-lists/$LIST_ID"

echo "==> oha results written to $RESULTS_DIR"

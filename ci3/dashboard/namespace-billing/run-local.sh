#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DATA_DIR="/tmp/rkapp-test-data"

# Create venv if needed
if [ ! -d "$DASHBOARD_DIR/.venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$DASHBOARD_DIR/.venv"
    "$DASHBOARD_DIR/.venv/bin/pip" install -r "$DASHBOARD_DIR/requirements.txt"
fi

# Generate sample billing data
echo "Generating sample billing data..."
"$DASHBOARD_DIR/.venv/bin/python" "$SCRIPT_DIR/generate-sample-data.py" "$TEST_DATA_DIR/billing" 60

echo "Starting rkapp with test data..."
echo "Dashboard: http://localhost:8080/namespace-billing"
echo "Credentials: aztec / password"
echo ""

# Use a non-existent Redis port so it fails fast and we only use disk data
cd "$DASHBOARD_DIR"
LOGS_DISK_PATH="$TEST_DATA_DIR" \
REDIS_PORT=9999 \
"$DASHBOARD_DIR/.venv/bin/python" -m flask --app rk.py --debug run --port 8080

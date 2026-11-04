#!/usr/bin/env bash
# Run the CI dashboard (rk.py) locally for testing the chonk breakdowns viewer.
# Run from ci3/dashboard. Breakdowns are read from S3, so AWS credentials are needed.

set -e

echo "============================================================"
echo "Starting the CI dashboard locally for testing"
echo "============================================================"
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Installing dependencies..."
    venv/bin/pip install -q -r requirements.txt
    echo ""
fi

# No redis is needed for the breakdowns viewer: point at a port where none runs.
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-9999}"
# rk.py starts the ci-metrics sidecar, which keeps metrics.db under LOGS_DISK_PATH
# (default /logs-disk, which does not exist on a dev machine).
export LOGS_DISK_PATH="${LOGS_DISK_PATH:-/tmp/ci-dashboard-local}"
mkdir -p "$LOGS_DISK_PATH"

echo "Breakdowns are read from s3://${S3_LOGS_BUCKET:-aztec-ci-artifacts}/${S3_LOGS_PREFIX:-logs}/bench/bb-breakdown/"
echo ""

echo "Starting Flask server..."
echo "Server will be available at: http://localhost:8080"
echo "Chonk breakdowns viewer: http://localhost:8080/chonk-breakdowns"
echo ""
echo "Press Ctrl+C to stop"
echo "============================================================"
echo ""

venv/bin/python3 rk.py

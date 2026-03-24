#!/usr/bin/env bash
# Run rk.py locally for testing
# This script sets up the environment to use local test data

set -e

echo "============================================================"
echo "Starting rkapp locally for testing"
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

# Set environment variables for local testing
# Use a dummy Redis host to skip Redis and go straight to disk
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-9999}"
export REDIS_TIMEOUT="0.1"  # Very short timeout to fail fast
# Point to /tmp for test data (not committed to git)
export LOGS_DISK_PATH="/tmp/rkapp-test-data"

echo "Test data location: $LOGS_DISK_PATH"
echo ""

# Check if test data exists
if [ ! -d "$LOGS_DISK_PATH/bench/bb-breakdown" ]; then
    echo "⚠️  No test data found at: $LOGS_DISK_PATH/bench/bb-breakdown/"
    echo "    (Will fall back to Redis if available)"
else
    echo "Available test data:"
    for f in $LOGS_DISK_PATH/bench/bb-breakdown/*.log.gz; do
        if [ -f "$f" ]; then
            basename "$f" | sed -E 's/^([^-]+)-(.+)-([^-]+)\.log\.gz$/  Runtime: \1, Flow: \2, SHA: \3/'
        fi
    done
fi
echo ""

echo "Starting Flask server..."
echo "Server will be available at: http://localhost:8080"
echo "Chonk breakdowns viewer: http://localhost:8080/chonk-breakdowns"
echo ""
echo "Note: You'll need Redis access or use test data that exists locally"
echo "      Test data is in test-data/bench/bb-breakdown/"
echo ""
echo "Press Ctrl+C to stop"
echo "============================================================"
echo ""

# Run with modified LOGS_DISK_PATH if we want to use test-data
venv/bin/python3 rk.py

#!/usr/bin/env bash
# Reproduces the kv-store browser-test hang under CI3 ISOLATE constraints.
#
# Failure mode: CDP CLOSE_WAIT deadlock between vitest and chromium's network
# service at test-file transitions. Vitest closes 6 of 10 CDP TCP connections
# on file-boundary teardown; chromium's network-service event loop, starved of
# CPU under --cpus=2, never drains the closed sockets. Vitest's teardown hangs
# waiting for the close-handshake. Both processes end up with zero on-CPU
# threads. Outer `timeout -v 90s` in probe-test-browser.sh fires SIGTERM after
# 90s of silence.
#
# Crucially, this does NOT reproduce on unconstrained hardware — chromium has
# enough cores to drain sockets immediately. Must run inside docker_isolate
# (--cpus=2 --memory=8g --tmpfs /tmp:exec,size=1g) to surface the hang.
#
# Usage:
#   bash yarn-project/kv-store/scripts/repro-browser-hang.sh [JOBS]
#
#   JOBS: parallel container count (default 8). Higher = faster repro,
#   higher RAM/CPU ceiling on host. 8 reliably catches a hang in ~3min on
#   a multi-core box.
#
# On hang: parallel halts (rc=124) and the failing job's full probe diagnostic
# (vitest tail + probe.log + stacks.log) is dumped to this script's stderr by
# dump_fail. Capture stderr to a file if you want to keep it.
#
# Example: capture both streams for later analysis
#   bash yarn-project/kv-store/scripts/repro-browser-hang.sh 8 > /tmp/repro.log 2>&1

set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

JOBS=${1:-8}

echo "=== repro-browser-hang start: $(date -Is), jobs=$JOBS ==="
while true; do
  echo './ci3/dump_fail "CPUS=2 MEM=8g TMPFS_SIZE=1g ./ci3/docker_isolate \"cd yarn-project/kv-store && bash scripts/probe-test-browser.sh\"" >/dev/null'
done | parallel -j"$JOBS" --halt now,fail=1
rc=$?
echo "=== repro-browser-hang end (parallel rc=$rc): $(date -Is) ==="
exit $rc

#!/usr/bin/env bash
# Temporary diagnostic wrapper for `yarn test:browser` used to capture
# CI container state around the intermittent hang documented in PR #22693.
# Revert this and the package.local.json change once root-caused.

cd "$(dirname "$0")/.."

PROBE_LOG=/tmp/diag/probe.log
mkdir -p "$(dirname "$PROBE_LOG")"
: > "$PROBE_LOG"

echo "probe-test-browser: starting at $(date +%T) (pid $$)" >&2

probe_loop() {
  while true; do
    {
      echo "=== $(date +%T.%N | cut -c1-12) ==="
      echo "-- /tmp --"
      df -h /tmp 2>/dev/null | tail -1
      du -sh /tmp 2>/dev/null
      echo "-- cgroup mem --"
      if [ -r /sys/fs/cgroup/memory.current ]; then
        awk '{printf "current %d bytes (%.0f MB)\n", $1, $1/1048576}' /sys/fs/cgroup/memory.current
        cat /sys/fs/cgroup/memory.events 2>/dev/null
      fi
      echo "-- cgroup cpu --"
      cat /sys/fs/cgroup/cpu.stat 2>/dev/null
      echo "-- top by rss --"
      ps -eo pid,ppid,stat,rss,pcpu,wchan:20,comm --sort=-rss --no-headers 2>/dev/null | head -12
      echo "-- chromium procs --"
      for pid in $(pgrep -f 'chrome|chromium' 2>/dev/null); do
        state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
        wchan=$(cat "/proc/$pid/wchan" 2>/dev/null)
        rss_kb=$(awk '/^VmRSS:/{print $2}' "/proc/$pid/status" 2>/dev/null)
        threads=$(awk '/^Threads:/{print $2}' "/proc/$pid/status" 2>/dev/null)
        cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | cut -c1-100)
        echo "pid=$pid state=$state threads=$threads rss=${rss_kb}kB wchan=$wchan cmd=$cmd"
      done
    } >> "$PROBE_LOG" 2>&1
    sleep 1
  done
}

probe_loop &
PROBE_PID=$!

cleanup() {
  rc=$?
  kill "$PROBE_PID" 2>/dev/null
  wait "$PROBE_PID" 2>/dev/null
  {
    echo ""
    echo "=== PROBE LOG (last 400 lines, test exit=$rc) ==="
    tail -400 "$PROBE_LOG"
    echo "=== END PROBE LOG ==="
  } >&2
  exit "$rc"
}
trap cleanup EXIT

timeout -v 90s yarn test:browser

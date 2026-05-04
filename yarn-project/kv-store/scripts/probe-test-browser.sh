#!/usr/bin/env bash
# Deep diagnostic wrapper around `yarn test:browser` for investigating
# browser-test hangs and silent failures.
#
# Wraps a single vitest run with a hybrid 1s-steady / 0.1s-burst sampler
# that captures /proc state (wchan, stack, syscall, fd), cgroup CPU/memory
# counters, /proc/net socket state counts, and a CPU-availability
# microbench. When vitest goes silent for >3s the sampler enters dense
# burst mode and emits a stacks_snapshot every 1s of burst. Outer 90s
# timeout converts a hang into a clean exit with the full diagnostic dump
# emitted to stderr by the EXIT trap.
#
# Single-tenant invocation:
#   bash yarn-project/kv-store/scripts/probe-test-browser.sh
#
# Parallel invocation (avoids tmp-path collisions across slots):
#   DIAG_DIR=/tmp/diag.$$ bash yarn-project/kv-store/scripts/probe-test-browser.sh
#
# Was used to root-cause the kv-store CDP teardown deadlock that
# scripts/run-browser-tests.sh now works around; kept for future regression
# debugging. scripts/repro-browser-hang.sh runs this in a parallel grind
# under docker_isolate constraints.

cd "$(dirname "$0")/.."

DIAG_DIR=${DIAG_DIR:-/tmp/diag}
PROBE_LOG=$DIAG_DIR/probe.log
STACKS_LOG=$DIAG_DIR/stacks.log
VITEST_LOG=$DIAG_DIR/vitest.log
mkdir -p "$DIAG_DIR"
: > "$PROBE_LOG"
: > "$STACKS_LOG"
: > "$VITEST_LOG"

echo "probe-test-browser v2: starting at $(date +%T) (pid $$)" >&2

pids_of_interest() {
  pgrep -f 'chrom|node|vitest|esbuild|yarn' 2>/dev/null
}

# Force fixed CPU demand and measure what fraction we actually got.
# ratio = (user+sys)/real. ~1.0 = full CPU; <0.5 = heavily preempted by host.
# Disambiguates "processes not asking for CPU" (scenario A) from "host not
# scheduling us" (scenario B) when cgroup counters are flat.
microbench() {
  local TIMEFORMAT='microbench: real=%R user=%U sys=%S'
  { time awk 'BEGIN{x=0; for(i=0;i<100000;i++) x+=i*i; print x > "/dev/null"}' \
    </dev/null 2>/dev/null; } 2>&1
}

snapshot() {
  local tag="$1"
  echo "=== $(date +%T.%N | cut -c1-12) $tag ==="
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
  ps -eo pid,ppid,stat,rss,pcpu,wchan:20,comm --sort=-rss --no-headers 2>/dev/null | head -15
  echo "-- procs of interest --"
  for pid in $(pids_of_interest); do
    [ -d "/proc/$pid" ] || continue
    local state threads rss_kb wchan cmd
    state=$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null)
    wchan=$(cat "/proc/$pid/wchan" 2>/dev/null)
    rss_kb=$(awk '/^VmRSS:/{print $2}' "/proc/$pid/status" 2>/dev/null)
    threads=$(awk '/^Threads:/{print $2}' "/proc/$pid/status" 2>/dev/null)
    cmd=$({ tr '\0' ' ' < "/proc/$pid/cmdline"; } 2>/dev/null | cut -c1-120)
    echo "pid=$pid state=$state threads=$threads rss=${rss_kb}kB wchan=$wchan cmd=$cmd"
  done
  # TCP state hex (col 4): 01=ESTABLISHED 04=FIN_WAIT1 05=FIN_WAIT2 06=TIME_WAIT
  # 07=CLOSE 08=CLOSE_WAIT 09=LAST_ACK 0A=LISTEN 0B=CLOSING
  echo "-- tcp4 sockets (state counts) --"
  awk 'NR>1{print $4}' /proc/net/tcp 2>/dev/null | sort | uniq -c
  echo "-- tcp6 sockets (state counts) --"
  awk 'NR>1{print $4}' /proc/net/tcp6 2>/dev/null | sort | uniq -c
  # Unix socket state (col 6): 01=SS_UNCONNECTED 02=SS_CONNECTING 03=SS_CONNECTED
  # 04=SS_DISCONNECTING — CDP/vitest IPC is typically over SS_CONNECTED unix sockets.
  echo "-- unix sockets (state counts) --"
  awk 'NR>1{print $6}' /proc/net/unix 2>/dev/null | sort | uniq -c
}

stacks_snapshot() {
  local tag="$1"
  echo "=== $(date +%T.%N | cut -c1-12) $tag ==="
  echo "-- lsof tcp/unix (-n -P, head -40) --"
  lsof -n -P -i TCP 2>/dev/null | head -25
  lsof -n -P -U 2>/dev/null | head -15
  for pid in $(pids_of_interest); do
    [ -d "/proc/$pid" ] || continue
    echo "--- pid=$pid ---"
    { tr '\0' ' ' < "/proc/$pid/cmdline"; } 2>/dev/null | cut -c1-140
    echo ""
    # /proc/$pid/syscall: syscall_nr arg0..arg5 sp pc (readable by process owner)
    echo "syscall:"
    cat "/proc/$pid/syscall" 2>/dev/null | head -1
    # /proc/$pid/stack: may require CAP_SYS_ADMIN; print only if non-empty
    local stack_content
    stack_content=$(cat "/proc/$pid/stack" 2>/dev/null | head -15)
    if [ -n "$stack_content" ]; then
      echo "kernel stack:"
      echo "$stack_content"
    fi
    # Per-thread wchan — tells us if threads are stuck on different things
    echo "thread wchans (sorted | uniq -c):"
    for t in /proc/$pid/task/*/wchan; do
      cat "$t" 2>/dev/null
      echo ""
    done | sort | uniq -c | sort -rn | head -10
    echo "socket/pipe fds:"
    for fd in /proc/$pid/fd/*; do
      local target
      target=$(readlink "$fd" 2>/dev/null) || continue
      case "$target" in
        socket:*|pipe:*|anon_inode:*) echo "  $(basename "$fd") -> $target" ;;
      esac
    done
  done
}

probe_loop() {
  local last_vitest_size=0
  local silent_since
  silent_since=$(date +%s)
  local burst_count=0
  local burst_cap=200   # ~20s dense sampling at 0.1s
  local steady_count=0  # increments once per steady iteration
  while true; do
    local now_s cur_size silent_for
    now_s=$(date +%s)
    cur_size=$(stat -c %s "$VITEST_LOG" 2>/dev/null || echo 0)
    if [ "$cur_size" != "$last_vitest_size" ]; then
      last_vitest_size=$cur_size
      silent_since=$now_s
      burst_count=0
    fi
    silent_for=$((now_s - silent_since))

    if [ "$silent_for" -ge 3 ] && [ "$burst_count" -lt "$burst_cap" ]; then
      {
        snapshot "burst(${silent_for}s silent)"
        # During a hang, microbench every burst snapshot — it's the core
        # signal for "is the host giving us CPU?" Overhead is irrelevant
        # since tests aren't running.
        microbench
      } >> "$PROBE_LOG" 2>&1
      # Stacks every 10th burst tick (~every 1s of burst) to keep log size sane
      if [ $((burst_count % 10)) -eq 0 ]; then
        stacks_snapshot "burst(${silent_for}s silent)" >> "$STACKS_LOG" 2>&1
      fi
      burst_count=$((burst_count + 1))
      sleep 0.1
    else
      {
        snapshot "steady"
        # Microbench every 5th steady iteration to bound CPU overhead
        # while tests are actually running (~0.4% vs tests' CPU budget).
        if [ $((steady_count % 5)) -eq 0 ]; then
          microbench
        fi
      } >> "$PROBE_LOG" 2>&1
      # Periodic in-flight stacks baseline — gives us a "healthy waiting"
      # reference to diff against burst-triggered dumps during a hang.
      if [ $((steady_count % 10)) -eq 0 ]; then
        stacks_snapshot "steady(tick=${steady_count})" >> "$STACKS_LOG" 2>&1
      fi
      steady_count=$((steady_count + 1))
      sleep 1
    fi
  done
}

probe_loop &
PROBE_PID=$!

cleanup() {
  local rc=$?
  kill "$PROBE_PID" 2>/dev/null
  wait "$PROBE_PID" 2>/dev/null
  # One last stacks snapshot at the moment of failure
  stacks_snapshot "cleanup" >> "$STACKS_LOG" 2>&1
  {
    echo ""
    echo "=== VITEST LOG (tail -300) ==="
    tail -300 "$VITEST_LOG"
    echo ""
    echo "=== FULL PROBE LOG ($(wc -l < "$PROBE_LOG") lines) ==="
    cat "$PROBE_LOG"
    echo ""
    echo "=== FULL STACKS LOG ($(wc -l < "$STACKS_LOG") lines, test exit=$rc) ==="
    cat "$STACKS_LOG"
    echo "=== END DIAGNOSTICS ==="
  } >&2
  exit "$rc"
}
trap cleanup EXIT

# Tee vitest output to a file so the probe loop can detect silence.
# pipefail ensures we surface timeout's exit code, not tee's.
set -o pipefail
timeout -v 90s yarn test:browser 2>&1 | tee "$VITEST_LOG"

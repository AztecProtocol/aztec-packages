#!/usr/bin/env bash
# Shared helpers for the aztec-up release tests.

# Wait for a backgrounded `aztec start --local-network` to serve /status.
#
# Bounded on purpose. Previously this was an unbounded poll loop, so a local
# network that crashed on startup (e.g. a broken npm dependency making the CLI
# exit immediately) left the test spinning until its 15m timeout. That burned
# the surrounding CI leg's wall-clock budget and reported a timeout instead of
# the actual error. Now we fail as soon as the process is gone, and cap the
# wait for the case where it is up but never becomes ready.
#
# Usage: wait_for_local_network <pid> [timeout_seconds]
function wait_for_local_network {
  local pid=$1
  local timeout=${2:-300}
  local start=$SECONDS
  local elapsed

  while ! curl -fs localhost:8080/status &>/dev/null; do
    elapsed=$((SECONDS - start))
    if ! kill -0 "$pid" &>/dev/null; then
      echo "aztec start --local-network exited after ${elapsed}s without serving localhost:8080." >&2
      echo "See the output above for the underlying error." >&2
      return 1
    fi
    if ((elapsed >= timeout)); then
      echo "Timed out after ${elapsed}s waiting for the local network on localhost:8080." >&2
      return 1
    fi
    sleep 1
  done
}

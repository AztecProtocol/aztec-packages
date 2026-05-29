#!/usr/bin/env bash
#
# Run a single cross-language IPC wire-compat test.
# All binaries are expected to be prebuilt by `ipc-codegen/bootstrap.sh build`.
#
# Usage:
#   run_cross_language_test.sh golden <lang>            # lang in {rust, ts}
#   run_cross_language_test.sh matrix <server-lang> <client-lang> [transport]
#                                                       # langs in {rust, ts, cpp, zig}
#                                                       # transport in {uds, shm}, default uds
#
# SHM transport requires ipc-runtime's NAPI addon (built by
# ipc-runtime/bootstrap.sh) when TS is the client. There's no SHM TS server.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES_DIR="$(dirname "$SCRIPT_DIR")"
cd "$EXAMPLES_DIR"

# Map language -> server command / client command. Each command is run with
# `--socket <path>` appended.
server_cmd_for() {
  case "$1" in
    rust) echo "rust/target/debug/echo_server" ;;
    ts)   echo "ts/node_modules/.bin/tsx ts/src/echo_server.ts" ;;
    cpp)  echo "cpp/build/bin/echo_server" ;;
    zig)  echo "zig/zig-out/bin/echo_server" ;;
    *)    echo "unknown lang: $1" >&2; exit 1 ;;
  esac
}

client_cmd_for() {
  case "$1" in
    rust) echo "rust/target/debug/echo_client" ;;
    ts)   echo "ts/node_modules/.bin/tsx ts/src/echo_client.ts" ;;
    cpp)  echo "cpp/build/bin/echo_client" ;;
    zig)  echo "zig/zig-out/bin/echo_client" ;;
    *)    echo "unknown lang: $1" >&2; exit 1 ;;
  esac
}

run_golden() {
  local lang="$1"
  case "$lang" in
    rust)
      rust/target/debug/golden_test --golden-dir schema/golden
      ;;
    ts)
      ts/node_modules/.bin/tsx ts/src/golden_test.ts
      ;;
    *)
      echo "golden tests only defined for rust and ts (got: $lang)" >&2
      exit 1
      ;;
  esac
}

run_matrix() {
  local server_lang="$1"
  local client_lang="$2"
  local transport="${3:-uds}"
  local server_cmd client_cmd
  server_cmd=$(server_cmd_for "$server_lang")
  client_cmd=$(client_cmd_for "$client_lang")

  if [ "$transport" = "shm" ] && [ "$server_lang" = "ts" ]; then
    echo "shm transport not supported as TS server (no shm_server in ipc-runtime/ts)" >&2
    exit 1
  fi

  # SHM names go through shm_open(3), which requires a flat name (no slashes
  # after the leading slot). UDS paths can sit under /tmp because they're
  # filesystem-resident. Tag both with $$ to keep parallel test commands distinct.
  local path shm_basename
  case "$transport" in
    uds)
      path="/tmp/echo-matrix-${server_lang}-${client_lang}-uds-$$.sock"
      shm_basename=""
      ;;
    shm)
      shm_basename="echo-matrix-${server_lang}-${client_lang}-shm-$$"
      path="${shm_basename}.shm"
      ;;
    *)
      echo "unknown transport: $transport (expected uds|shm)" >&2; exit 1 ;;
  esac

  # Spawn first, then install cleanup. Cleanup kills the server + removes the
  # UDS socket + removes SHM rings (MPSC layout: _req_doorbell, _req_ring_<slot>,
  # _resp_<slot>). Note: `local server_pid=...` and `set -u` interact poorly
  # with EXIT traps that reference the variable, so we use a plain global.
  $server_cmd --socket "$path" &
  server_pid=$!
  trap "kill ${server_pid} 2>/dev/null || true; \
        rm -f '$path'; \
        [ -n '$shm_basename' ] && rm -f /dev/shm/${shm_basename}_req_doorbell /dev/shm/${shm_basename}_req_ring_* /dev/shm/${shm_basename}_resp_* || true" EXIT

  # Wait for transport readiness. UDS: socket file. SHM: the MPSC request
  # doorbell — the consumer (server) creates it last in MpscConsumer::create,
  # so its existence implies all rings + ring meta are ready for producers.
  # Same generous timeout for both — TS cold start dominates either way.
  for _ in $(seq 1 300); do
    if [ "$transport" = "uds" ]; then
      [ -S "$path" ] && break
    else
      [ -e "/dev/shm/${shm_basename}_req_doorbell" ] && break
    fi
    sleep 0.1
  done
  if [ "$transport" = "uds" ] && [ ! -S "$path" ]; then
    echo "server did not create socket within 30s" >&2
    exit 1
  fi
  if [ "$transport" = "shm" ] && [ ! -e "/dev/shm/${shm_basename}_req_doorbell" ]; then
    echo "server did not create shm rings within 30s" >&2
    exit 1
  fi

  if [ "$transport" = "shm" ] && [ "$client_lang" = "ts" ]; then
    $client_cmd --socket "$path" --transport shm
  else
    $client_cmd --socket "$path"
  fi
}

kind="${1:-}"
case "$kind" in
  golden)
    run_golden "${2:?golden requires <lang>}"
    ;;
  matrix)
    run_matrix "${2:?matrix requires <server-lang>}" "${3:?matrix requires <client-lang>}" "${4:-uds}"
    ;;
  *)
    echo "Usage: $0 golden <lang> | matrix <server-lang> <client-lang> [uds|shm]" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
#
# Run a single cross-language IPC wire-compat test.
# All binaries are expected to be prebuilt by `ipc-codegen/bootstrap.sh build`.
#
# Usage:
#   run_cross_language_test.sh golden <lang>            # lang in {rust, ts}
#   run_cross_language_test.sh matrix <server-lang> <client-lang>
#                                                       # langs in {rust, ts, cpp, zig}
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXAMPLES_DIR="$(dirname "$SCRIPT_DIR")"
cd "$EXAMPLES_DIR"

# Map language -> server command / client command. Each command is run with
# `--socket <path>` appended.
server_cmd_for() {
  case "$1" in
    rust) echo "rust/echo/target/debug/echo_server" ;;
    ts)   echo "npx tsx ts/echo/echo_server.ts" ;;
    cpp)  echo "cpp/echo/echo_server" ;;
    zig)  echo "zig/echo/zig-out/bin/echo_server" ;;
    *)    echo "unknown lang: $1" >&2; exit 1 ;;
  esac
}

client_cmd_for() {
  case "$1" in
    rust) echo "rust/echo/target/debug/echo_client" ;;
    ts)   echo "npx tsx ts/echo/echo_client.ts" ;;
    cpp)  echo "cpp/echo/echo_client" ;;
    zig)  echo "zig/echo/zig-out/bin/echo_client" ;;
    *)    echo "unknown lang: $1" >&2; exit 1 ;;
  esac
}

run_golden() {
  local lang="$1"
  case "$lang" in
    rust)
      rust/echo/target/debug/golden_test --golden-dir echo-schema/golden
      ;;
    ts)
      npx tsx ts/echo/golden_test.ts
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
  local server_cmd client_cmd
  server_cmd=$(server_cmd_for "$server_lang")
  client_cmd=$(client_cmd_for "$client_lang")
  local socket="/tmp/echo-matrix-${server_lang}-${client_lang}-$$.sock"

  # Start server in background, wait for socket, run client.
  $server_cmd --socket "$socket" &
  local server_pid=$!
  trap "kill $server_pid 2>/dev/null || true; rm -f $socket" EXIT

  for _ in $(seq 1 20); do
    [ -S "$socket" ] && break
    sleep 0.1
  done
  if [ ! -S "$socket" ]; then
    echo "server did not create socket within 2s" >&2
    exit 1
  fi

  $client_cmd --socket "$socket"
}

kind="${1:-}"
case "$kind" in
  golden)
    run_golden "${2:?golden requires <lang>}"
    ;;
  matrix)
    run_matrix "${2:?matrix requires <server-lang>}" "${3:?matrix requires <client-lang>}"
    ;;
  *)
    echo "Usage: $0 golden <lang> | matrix <server-lang> <client-lang>" >&2
    exit 1
    ;;
esac

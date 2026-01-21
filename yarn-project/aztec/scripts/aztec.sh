#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

# Re-execute using correct version if we have an .aztecrc file.
if [ "${AZTEC_VERSIONED:-0}" -eq 0 ] && [ -f .aztecrc ] && command -v aztec-up &>/dev/null; then
  env_setup=$(aztec-up env)
  eval "$env_setup"
  AZTEC_VERSIONED=1 exec aztec "$@"
fi

cmd=${1:-}
[ -n "$cmd" ] && shift

script_dir="$(dirname "$(realpath "$0")")"

function aztec {
  export AZTEC_SHELL_WRAPPER=1
  exec node --no-warnings $script_dir/../dest/bin/index.js "$@"
}

case $cmd in
  test)
    export LOG_LEVEL="${LOG_LEVEL:-error}"
    aztec start --txe --port 8081 &
    server_pid=$!
    trap 'kill $server_pid &>/dev/null || true' EXIT
    while ! nc -z 127.0.0.1 8081 &>/dev/null; do sleep 0.2; done
    export NARGO_FOREIGN_CALL_TIMEOUT=300000
    nargo test --silence-warnings --oracle-resolver http://127.0.0.1:8081 "$@"
    ;;
  start)
    if [ "${1:-}" == "--local-network" ]; then
      # TODO: Can these just be set in TS?
      export ARCHIVER_POLLING_INTERVAL_MS=500
      export P2P_BLOCK_CHECK_INTERVAL_MS=500
      export SEQ_TX_POLLING_INTERVAL_MS=500
      export WS_BLOCK_CHECK_INTERVAL_MS=500
      export ARCHIVER_VIEM_POLLING_INTERVAL_MS=500
      export TEST_ACCOUNTS=${TEST_ACCOUNTS:-true}
      export LOG_LEVEL=${LOG_LEVEL:-info;silent:sequencer;verbose:debug_log}
      export DEPLOY_AZTEC_CONTRACTS_SALT=${DEPLOY_AZTEC_CONTRACTS_SALT:-$RANDOM}

      ANVIL_PORT=${ANVIL_PORT:-8545}

      export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}
      export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:${ANVIL_PORT}"}

      anvil --version
      anvil --silent &
      anvil_pid=$!
      trap 'kill $anvil_pid &>/dev/null' EXIT
    fi

    aztec start "$@"
    ;;
  compile|new|init|flamegraph)
    $script_dir/${cmd}.sh "$@"
    ;;
  *)
    aztec $cmd "$@"
    ;;
esac

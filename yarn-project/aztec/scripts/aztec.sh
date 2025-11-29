#!/usr/bin/env bash
set -euo pipefail

function aztec {
  local script_dir="$(dirname "$(realpath "$0")")"
  node --no-warnings $script_dir/../dest/bin/index.js "$@"
}

cmd=${1:-}
[ -n "$cmd" ] && shift

case $cmd in
  test)
    export LOG_LEVEL="${LOG_LEVEL:-info}"
    aztec start --txe --port 8081 &
    local server_pid=$!
    trap 'kill $server_pid &>/dev/null' EXIT
    while ! nc -z 127.0.0.1 8081 &>/dev/null; do sleep 0.2; done
    export NARGO_FOREIGN_CALL_TIMEOUT=300000
    nargo test --silence-warnings --pedantic-solving --oracle-resolver http://127.0.0.1:8081 "$@"
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
  compile|new|init)
    $(dirname "$0")/${cmd}.sh "$@"
    ;;
  fmt|check|lsp)
    # TODO: These should be removed, just use nargo directly.
    nargo $cmd "$@"
    ;;
  *)
    aztec $cmd "$@"
    ;;
  # flamegraph)
  #   docker run -it \
  #     --entrypoint /usr/src/noir-projects/noir-contracts/scripts/flamegraph.sh \
  #     --env SERVE=${SERVE:-0} \
  #     $([ "${SERVE:-0}" == "1" ] && echo "-p 8000:8000" || echo "") \
  #     -v $(realpath $(dirname $2))/:/tmp \
  #     $DOCKER_REPO:$VERSION /tmp/$(basename $2) $3
  #   ;;
esac

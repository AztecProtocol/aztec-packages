#! /bin/bash

# Get the execution client from the first argument
execution_client=${1:-"reth"}

case "$execution_client" in
"reth")
  /eth-execution-reth.sh
  ;;
"geth")
  /eth-execution-geth.sh
  ;;
"nethermind")
  /eth-execution-nethermind.sh
  ;;
*)
  echo "Unknown execution client: $execution_client"
  exit 1
  ;;
esac

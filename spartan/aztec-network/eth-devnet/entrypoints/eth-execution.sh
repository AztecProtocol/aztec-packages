#! /bin/bash

# Get the execution client from the first argument
execution_client=${1:-"reth"}

case "$execution_client" in
"reth")
  /entrypoints/eth-execution-reth.sh
  ;;
"geth")
  /entrypoints/eth-execution-geth.sh
  ;;
"nethermind")
  /entrypoints/eth-execution-nethermind.sh
  ;;
*)
  echo "Unknown execution client: $execution_client"
  exit 1
  ;;
esac

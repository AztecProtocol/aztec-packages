#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}

if [ -n "${NOIR_CONTRACTS_SEQUENTIAL_BUILD:-""}" ]; then
  echo "Compiling contracts sequentially..."
  for contract in ./contracts/*; do
    if [ -d "$contract" ]; then
      if [[ $contract == *_contract ]]; then 
        echo "Compiling $(basename $contract)..."
        $NARGO compile --silence-warnings --package $(basename $contract)
      else 
        echo "Skipping non-contract $(basename $contract)"
      fi
    fi
  done
else
  echo "Compiling all contracts..."
  $NARGO compile --silence-warnings
fi


echo "Transpiling contracts..."
scripts/transpile.sh
#!/bin/bash

set -eu
# Run our test assuming the port in pxe.sh
# Wait for the Aztec Node to be ready
echo "Waiting for Aztec Node..."
until curl -s http://127.0.0.1:8080/status >/dev/null ; do
  sleep 1
done
echo "Waiting for PXE service..."
until curl -s -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"pxe_getNodeInfo","params":[],"id":67}' \
  http://127.0.0.1:8079 | grep -q '"enr:-'; do
  sleep 1
done
echo "Waiting for l2 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/l2-contracts.env ] ; do
  sleep 1
done

export DEBUG="aztec:*"
export LOG_LEVEL=debug
export PXE_URL=http://localhost:8079
cd $(git rev-parse --show-toplevel)/yarn-project/end-to-end
yarn test src/spartan/transfer.test.ts
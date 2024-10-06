#!/bin/bash

set -eu
# Run our test assuming the port in pxe.sh

export DEBUG="aztec:*"
export LOG_LEVEL=debug
export PXE_URL=http://localhost:8079
cd $(git rev-parse --show-toplevel)/yarn-project/end-to-end
yarn test src/spartan/transfer.test.ts
cwd $(git rev-parse --show-toplevel)/yarn-project/end-to-end
#! /bin/bash

REPO_ROOT=$(git rev-parse --show-toplevel)

${REPO_ROOT}/spartan/aztec-network/eth-devnet/create.sh
(cd ${REPO_ROOT}/spartan/aztec-network/eth-devnet && docker compose down -v && docker compose build && docker compose up)

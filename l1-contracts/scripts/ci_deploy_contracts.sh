#!/bin/bash

FORCE_DEPLOY=${2:-"false"}

export ETHEREUM_HOST=$DEPLOY_TAG-mainnet-fork.aztec.network:8545/$FORK_API_KEY

# If we have previously successful commit, we can early out if nothing relevant has changed since.
if [[ $FORCE_DEPLOY == 'false' ]] && check_rebuild cache-"$CONTENT_HASH" $REPOSITORY; then
  echo "No deploy necessary."
  exit 0
fi

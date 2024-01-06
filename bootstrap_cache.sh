#!/usr/bin/env bash

cd "$(dirname "$0")"

source ./build-system/scripts/setup_env '' '' mainframe_$USER > /dev/null

extract_repo bb.js /usr/src/barretenberg/ts/dest ./barretenberg/ts
extract_repo noir-packages /usr/src/noir/packages ./noir

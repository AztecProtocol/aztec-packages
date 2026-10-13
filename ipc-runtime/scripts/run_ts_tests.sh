#!/usr/bin/env bash
# Run the TS package tests (UDS transport, in-process server + client).
source $(git rev-parse --show-toplevel)/ci3/source
cd ../ts
yarn install --immutable
yarn test

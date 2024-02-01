#!/usr/bin/env bash

if ! ls ../../noir-contracts/target/*.json >/dev/null 2>&1; then
  echo "Error: No .json files found in ../target folder"
  exit 1
fi

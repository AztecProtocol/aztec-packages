#!/bin/bash
# Compiles all noir contracts

# Runs the compile scripts for all contracts.
echo "Compiling all contracts"

./scripts/compile.sh $(./scripts/get_all_contracts.sh)

#!/bin/bash
# meant to be run from the root of the subpackage
echo "Compiling all contracts"
./src/scripts/compile.sh $(./src/scripts/get_all_contracts.sh)

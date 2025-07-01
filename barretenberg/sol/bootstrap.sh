#!/usr/bin/env bash

rm -rf broadcast cache out
forge install

# cd ../../sol

echo "Building c++ binaries..."
cd ../cpp
cmake --build --preset clang16 --parallel --target honk_solidity_proof_gen honk_solidity_key_gen
cd ../sol

# Keys of non-zk and zk verifier should be the same
echo "Generating verification keys..."
./scripts/init_honk.sh

echo "Formatting code..."
forge fmt
forge build

echo "Targets built, you are good to go!"

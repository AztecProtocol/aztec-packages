#!/usr/bin/env bash

rm -rf broadcast cache out
forge install
# Ensure libraries are at the correct version
git submodule update --init --recursive ./lib

echo "Installing barretenberg..."
git submodule init
git submodule update

echo "Downloading srs..."
cd ../cpp/srs_db
./download_ignition.sh 3
#./download_ignition_lagrange.sh 12
cd ../../sol

echo "Building c++ binaries..."
cd ../cpp
cmake --build --preset clang16 --parallel --target solidity_key_gen solidity_proof_gen honk_solidity_proof_gen honk_solidity_key_gen
cd ../sol

# Keys of non-zk and zk verifier should be the same
echo "Generating verification keys..."
./scripts/init.sh
./scripts/init_honk.sh

echo "Formatting code..."
forge fmt
forge build

echo "Targets built, you are good to go!"

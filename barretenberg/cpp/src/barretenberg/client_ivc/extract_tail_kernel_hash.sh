#!/bin/bash
# filepath: /mnt/user-data/raju/aztec-packages/barretenberg/cpp/src/barretenberg/client_ivc/extract_tail_kernel_hash.sh

set -e

cd /mnt/user-data/raju/aztec-packages/barretenberg/cpp

echo "Building extract_tail_kernel_hash..."
cmake --build build-debug --target extract_tail_kernel_hash

echo "Extracting the hashes of the verification keys of the tail kernels..."
./build-debug/bin/extract_tail_kernel_hash

echo "Done!"

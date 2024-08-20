#!/usr/bin/env bash

# Run from within barretenberg/acir_tests

# Optional argument that can be passed to rebuild.sh
optional_arg=${1:-}

# Clean and rebuild noir then compile the test programs
cd ../../noir/noir-repo
cargo clean
noirup -p .
cd test_programs

# Check if the optional argument exists and pass it to rebuild.sh
if [ -n "$optional_arg" ]; then
    ./rebuild.sh "$optional_arg"
else
    ./rebuild.sh
fi

# Remove and repopulate the test artifacts in bberg
cd ../../../barretenberg/acir_tests
rm -rf acir_tests
./clone_test_vectors.sh
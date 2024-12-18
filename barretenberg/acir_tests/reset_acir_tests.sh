#!/usr/bin/env bash
set -e

# Run from within barretenberg/acir_tests

# Initialize variables for flags
REBUILD_NARGO_FLAG=true
PROGRAMS=""

# Parse the arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --no-rebuild-nargo)
            REBUILD_NARGO_FLAG=false
            ;;
        --programs)
            shift
            PROGRAMS="$@"
            break  # Exit loop after collecting all programs
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
    shift
done

    cd ../../noir/noir-repo
# Clean and rebuild noir unless --no-rebuild-nargo is specified, then compile the test programs
if [[ "$REBUILD_NARGO_FLAG" == true ]]; then
    cargo clean
    noirup -p .
else
    echo "Skipping noir nargo build."
fi

# Rebuild test programs with rebuild.sh
cd test_programs
if [[ -n "$PROGRAMS" ]]; then
    ./rebuild.sh $PROGRAMS
else
    ./rebuild.sh
fi

# Remove and repopulate the test artifacts in bberg
cd ../../../barretenberg/acir_tests
rm -rf acir_tests
./clone_test_vectors.sh

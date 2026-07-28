#!/usr/bin/env bash

# Warn when constants.nr is staged. The generated projections (constants.gen.ts,
# aztec_constants.hpp, ConstantsGen.sol, constants_gen.pil) regenerate at build time,
# but two downstream artifacts still need a manual step, and forgetting them has
# historically cost hours of debugging. This hook only warns; it never blocks the commit.

set -euo pipefail

cd "$(dirname "$0")"

FILE_TO_WATCH="noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr"

if git diff --cached --name-only | grep -Fxq "$FILE_TO_WATCH"; then
    echo "It looks like you changed $FILE_TO_WATCH."
    echo ""
    echo -e "\033[33mIf you changed AVM-related constants, rerun barretenberg/cpp/scripts/avm2_gen.sh and commit the vm2/generated changes.\033[0m"
    echo -e "\033[33mIf you changed tree sizes, also run ./yarn-project/update-snapshots.sh.\033[0m"
    echo ""
fi

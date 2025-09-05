#!/usr/bin/env bash

# Precommit hook simply to warn the user that their protocol contract instances are inconsistent
# with what the AVM expects. This could be due to changes in noir that happen during the compilation
# of the protocol-contracts or it could be because the contract themselves have been changed.
#
# It relies on a simple md5 checksum of the gitignore'd artifacts folder, this does probably capture
# more than what we want but should be fine for now. There is a small risk that this ends up being "noisy"
# for users as it relies on them keeping their local artifacts up to date (via bootstrap), but this is also a
# requirement to be able to test anything that utilises the AVM.

set -euo pipefail  # Fail on errors, unset variables, and pipeline failures

export FORCE_COLOR=true
# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

gittop="$(git rev-parse --show-toplevel)"
FOLDER_TO_WATCH="$gittop/yarn-project/protocol-contracts/artifacts"

CHECKSUM_FILE="$gittop/yarn-project/protocol-contracts/.artifacts_checksum"

COMMANDS_TO_RUN=(
"(cd $gittop/yarn-project/protocol-contracts && yarn generate)"
"(cd $gittop/barretenberg/cpp && cmake --build --preset clang20 --target bb)"
)

# Computes artifact checksum
computed_artifacts_checksum() {
    
    if [[ ! -d "$FOLDER_TO_WATCH" ]]; then
        echo "FOLDER_NOT_FOUND" 
        return
    fi
    
    # Don't hash the .d.json.ts files
    find "$FOLDER_TO_WATCH" -type f ! -name "*.ts" -exec md5sum {} \; 2>/dev/null | \
        sort | \
        cut -d' ' -f1 |\
        md5sum | \
        cut -d' ' -f1
}

# WWrite the computed checksum to the checksum file
save_checksums() {
    
    local checksum=$(computed_artifacts_checksum $FOLDER_TO_WATCH)
    echo "$checksum" > "$CHECKSUM_FILE"
    echo -e "${GREEN}✓ Checksums saved${NC}"
}

# Function to check for changes
check_changes() {
    if [[ ! -f "$CHECKSUM_FILE" ]]; then
        echo -e "${YELLOW}⚠ No checksum file found. Creating initial checksums...${NC}"
        save_checksums
        return 0
    fi
    
    local changes_detected=false
    
    echo -e "Checking artifacts checksums...${NC}"
    
        
    local current_checksum=$(computed_artifacts_checksum "$FOLDER_TO_WATCH")
    local stored_checksum=$(cat "$CHECKSUM_FILE" 2>/dev/null | cut -d: -f2)

    if [[ "$current_checksum" == "FOLDER_NOT_FOUND" ]]; then
        echo -e "${RED}Current checksum not found${NC}"
    fi

    if [[ -z "$stored_checksum" ]]; then
        echo -e "${YELLOW}No checksum in checksum file${NC}"
        changes_detected=true
    elif [[ "$current_checksum" != "$stored_checksum" ]]; then
        changes_detected=true
    fi

    if [[ "$changes_detected" == true ]]; then
        echo ""
        echo -e "${RED}⚠ Changes detected between your protocol contracts and the expected values!${NC}"
        echo "    Old checksum: ${stored_checksum:0:8}...${stored_checksum:(-8)}"
        echo "    New checksum: ${current_checksum:0:8}...${current_checksum:(-8)}"
        echo ""
        echo -e "${YELLOW}If you have changed the protocol contracts directly or if noir code-gen has changed, run these suggested coammands:${NC}"
        for cmd in "${COMMANDS_TO_RUN[@]}"; do
            echo -e "  ${GREEN}\$${NC} $cmd"
        done
        echo ""
        echo -e "${YELLOW}If you did not expect this, check that you have run ${GREEN}./bootstrap ${YELLOW}in ${GREEN}noir-projects/noir-contract ${YELLOW}recently${NC}"
        echo -e "${YELLOW}If you're still confused, ping someone on the AVM team !${NC}"
        # return 1 - if we want to prevent people committing with mismatched checksums
        echo ""
        return 0
    else
        echo -e "${GREEN}✓ No changes to protocol contracts detected${NC}"
        echo ""
        return 0
    fi
}

check_changes


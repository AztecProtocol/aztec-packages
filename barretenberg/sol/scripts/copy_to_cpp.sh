#!/bin/bash

# Script to copy Solidity verifier files into the C++ honk_contract.hpp file
# This automates the manual process of copying verifier contracts

set -e  # Exit on error

# Parse command line arguments
SKIP_BACKUP=false
while getopts "f" opt; do
    case $opt in
        f)
            SKIP_BACKUP=true
            ;;
        \?)
            echo "Usage: $0 [-f]"
            echo "  -f    Skip creating backup file"
            exit 1
            ;;
    esac
done

REPO_ROOT=$(git rev-parse --show-toplevel)

# Define paths relative to the barretenberg directory
BARRETENBERG_DIR="$REPO_ROOT/barretenberg"
SOL_SRC_DIR="$BARRETENBERG_DIR/sol/src/honk"
CPP_FILE="$BARRETENBERG_DIR/cpp/src/barretenberg/dsl/acir_proofs/honk_contract.hpp"

# Check if source directory exists
if [ ! -d "$SOL_SRC_DIR" ]; then
    echo "Error: Solidity source directory not found at $SOL_SRC_DIR"
    exit 1
fi

# Check if target file exists
if [ ! -f "$CPP_FILE" ]; then
    echo "Error: Target C++ file not found at $CPP_FILE"
    exit 1
fi

echo "Processing Solidity files from: $SOL_SRC_DIR"
echo "Target C++ file: $CPP_FILE"

# Create temporary file for the combined Solidity code
TEMP_SOL_FILE=$(mktemp)
trap "rm -f $TEMP_SOL_FILE" EXIT

# Function to strip imports and pragma from a file
strip_imports_and_pragma() {
    local file=$1
    # Use awk to handle multi-line imports
    awk '
        # Skip pragma and SPDX lines
        /^pragma/ || /^\/\/ SPDX-License-Identifier:/ { next }
        
        # Skip lines containing copyright
        /[Cc]opyright/ { next }
        
        # Handle imports (including multi-line)
        /^import/ { 
            in_import = 1
            # Check if import ends on same line
            if (/;/) in_import = 0
            next 
        }
        
        # If we are in a multi-line import, skip until we find the semicolon
        in_import && /;/ { 
            in_import = 0
            next 
        }
        
        # Skip lines that are part of multi-line import
        in_import { next }
        
        # For lines with TODO comments, remove only the comment part
        /\/\/.*[Tt][Oo][Dd][Oo]/ {
            # Remove everything from // onwards if it contains TODO
            sub(/\/\/.*[Tt][Oo][Dd][Oo].*$/, "")
            # Only print if there is still content left
            if (NF > 0) print
            next
        }
        
        # Print all other lines
        { print }
    ' "$file" | sed '/./,$!d'  # Remove leading empty lines
}

# Start with pragma statement
echo "pragma solidity ^0.8.27;" > "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

# Process files in dependency order
# Core files first
echo "Processing Fr.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/Fr.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

echo "Processing HonkTypes.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/HonkTypes.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

echo "Processing Transcript.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/Transcript.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

# Process utility files
echo "Processing Relations.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/Relations.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

echo "Processing CommitmentScheme.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/CommitmentScheme.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

echo "Processing utils.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/utils.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

echo "Processing BaseHonkVerifier.sol..."
strip_imports_and_pragma "$SOL_SRC_DIR/BaseHonkVerifier.sol" >> "$TEMP_SOL_FILE"
echo "" >> "$TEMP_SOL_FILE"

# Add the final contract that will use the verification key
cat >> "$TEMP_SOL_FILE" << 'EOF'
contract HonkVerifier is BaseHonkVerifier(N, LOG_N, NUMBER_OF_PUBLIC_INPUTS) {
     function loadVerificationKey() internal pure override returns (Honk.VerificationKey memory) {
       return HonkVerificationKey.loadVerificationKey();
    }
}
EOF

# Optionally create a backup of the original file
if [ "$SKIP_BACKUP" = false ]; then
    echo "Creating backup of honk_contract.hpp..."
    cp "$CPP_FILE" "${CPP_FILE}.bak"
    echo "Backup saved as ${CPP_FILE}.bak"
fi

# Create a new version of the C++ file
TEMP_CPP_FILE=$(mktemp)

# Copy everything up to and including the R"( marker
sed -n '1,/^static const char HONK_CONTRACT_SOURCE\[\] = R"(/p' "$CPP_FILE" > "$TEMP_CPP_FILE"

# Add the combined Solidity code
cat "$TEMP_SOL_FILE" >> "$TEMP_CPP_FILE"

# Add the closing )"; and everything after
echo ')";' >> "$TEMP_CPP_FILE"
sed -n '/^)";/,$p' "$CPP_FILE" | tail -n +2 >> "$TEMP_CPP_FILE"

# Replace the original file
mv "$TEMP_CPP_FILE" "$CPP_FILE"

echo "Successfully updated $CPP_FILE"
echo "Done!"

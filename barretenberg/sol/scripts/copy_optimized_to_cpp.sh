#!/bin/bash

# Script to copy optimized Solidity verifier files into the C++ honk_optimized_contract.hpp file
# This automates the manual process of copying optimized verifier contracts
# while preserving template placeholders

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
SOL_SRC_FILE="$BARRETENBERG_DIR/sol/src/honk/optimised/blake-opt.sol"
CPP_FILE="$BARRETENBERG_DIR/cpp/src/barretenberg/dsl/acir_proofs/honk_optimized_contract.hpp"

# Check if source file exists
if [ ! -f "$SOL_SRC_FILE" ]; then
    echo "Error: Solidity source file not found at $SOL_SRC_FILE"
    exit 1
fi

# Check if target file exists
if [ ! -f "$CPP_FILE" ]; then
    echo "Error: Target C++ file not found at $CPP_FILE"
    exit 1
fi

echo "Processing Solidity file from: $SOL_SRC_FILE"
echo "Target C++ file: $CPP_FILE"

# Optionally create a backup
if [ "$SKIP_BACKUP" = false ]; then
    echo "Creating backup..."
    cp "$CPP_FILE" "${CPP_FILE}.bak"
    echo "Backup saved as ${CPP_FILE}.bak"
fi

# Create temporary files
TEMP_CPP=$(mktemp)
TEMP_SOL=$(mktemp)
TEMP_PROCESSED=$(mktemp)
FINAL_SOL=$(mktemp)
trap "rm -f $TEMP_CPP $TEMP_SOL $TEMP_PROCESSED $FINAL_SOL" EXIT

# First, copy blake-opt.sol to a temp file for processing
cp "$SOL_SRC_FILE" "$TEMP_SOL"

# Replace the hardcoded constants with template placeholders
sed -i -E 's/(uint256 constant VK_HASH = )0x[0-9a-fA-F]+;/\1{{ VK_HASH }};/' "$TEMP_SOL"
sed -i -E 's/(uint256 constant CIRCUIT_SIZE = )[0-9]+;/\1{{ CIRCUIT_SIZE }};/' "$TEMP_SOL"
sed -i -E 's/(uint256 constant LOG_N = )[0-9]+;/\1{{ LOG_CIRCUIT_SIZE }};/' "$TEMP_SOL"
sed -i -E 's/(uint256 constant NUMBER_PUBLIC_INPUTS = )[0-9]+;/\1{{ NUM_PUBLIC_INPUTS }};/' "$TEMP_SOL"
sed -i -E 's/(uint256 constant REAL_NUMBER_PUBLIC_INPUTS = )[0-9]+ - 16;/\1{{ NUM_PUBLIC_INPUTS }} - 16;/' "$TEMP_SOL"
sed -i -E 's/(uint256 constant NUMBER_OF_BARYCENTRIC_INVERSES = )[0-9]+;/\1{{ NUMBER_OF_BARYCENTRIC_INVERSES }};/' "$TEMP_SOL"

# Replace the contract name
sed -i 's/contract BlakeOptHonkVerifier/contract HonkVerifier/' "$TEMP_SOL"

# Process the file to replace _14 values with template placeholders, but only in code, not in constant declarations
awk '
    # Skip constant declarations - they should keep their hardcoded values
    /^[[:space:]]*uint256[[:space:]]+internal[[:space:]]+constant/ {
        print
        next
    }
    # For all other lines, replace the _14 values with templates
    {
        gsub(/POWERS_OF_EVALUATION_CHALLENGE_14_LOC/, "POWERS_OF_EVALUATION_CHALLENGE_{{ LOG_N_MINUS_ONE }}_LOC")
        gsub(/SUM_U_CHALLENGE_14/, "SUM_U_CHALLENGE_{{ LOG_N_MINUS_ONE }}")
        gsub(/GEMINI_A_EVAL_14/, "GEMINI_A_EVAL_{{ LOG_N_MINUS_ONE }}")
        gsub(/INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC/, "INVERTED_CHALLENEGE_POW_MINUS_U_{{ LOG_N_MINUS_ONE }}_LOC")
        gsub(/FOLD_POS_EVALUATIONS_14_LOC/, "FOLD_POS_EVALUATIONS_{{ LOG_N_MINUS_ONE }}_LOC")
        gsub(/mcopy\(0x20, GEMINI_FOLD_UNIVARIATE_0_X_LOC, 0x380\)/, "mcopy(0x20, GEMINI_FOLD_UNIVARIATE_0_X_LOC, {{ GEMINI_FOLD_UNIVARIATE_LENGTH }})")
        gsub(/prev_challenge := mod\(keccak256\(0x00, 0x3a0\), p\)/, "prev_challenge := mod(keccak256(0x00, {{ GEMINI_FOLD_UNIVARIATE_HASH_LENGTH }}), p)")
        gsub(/mcopy\(0x20, GEMINI_A_EVAL_0, 0x1e0\)/, "mcopy(0x20, GEMINI_A_EVAL_0, {{ GEMINI_EVALS_LENGTH }})")
        gsub(/prev_challenge := mod\(keccak256\(0x00, 0x200\), p\)/, "prev_challenge := mod(keccak256(0x00, {{ GEMINI_EVALS_HASH_LENGTH }}), p)")
        print
    }
' "$TEMP_SOL" > "${TEMP_SOL}.tmp" && mv "${TEMP_SOL}.tmp" "$TEMP_SOL"

# Process the file to remove code inside UNROLL_SECTION blocks while preserving the markers
awk '
    BEGIN {
        in_unroll = 0
        unroll_label = ""
    }
    # Detect UNROLL_SECTION_START
    /\{\{[[:space:]]*UNROLL_SECTION_START[[:space:]]+[^}]+\}\}/ {
        print  # Print the start marker
        in_unroll = 1
        # Extract the label for matching with END
        match($0, /UNROLL_SECTION_START[[:space:]]+([^[:space:]}\]]+)/, arr)
        unroll_label = arr[1]
        next
    }
    # Detect UNROLL_SECTION_END
    /\{\{[[:space:]]*UNROLL_SECTION_END[[:space:]]+[^}]+\}\}/ {
        print  # Print the end marker
        in_unroll = 0
        unroll_label = ""
        next
    }
    # Skip lines inside unroll sections
    in_unroll { next }
    # Print all other lines
    { print }
' "$TEMP_SOL" > "${TEMP_SOL}.tmp" && mv "${TEMP_SOL}.tmp" "$TEMP_SOL"

# Process the file to remove code inside ACCUMULATE_GEMINI_FOLD_UNIVARIATE section while preserving the markers
awk '
    BEGIN {
        in_accumulate_gemini = 0
    }
    # Detect UNROLL_SECTION_START ACCUMULATE_GEMINI_FOLD_UNIVARIATE
    /\/\/\/ \{\{ UNROLL_SECTION_START ACCUMULATE_GEMINI_FOLD_UNIVARIATE \}\}/ {
        print  # Print the start marker
        in_accumulate_gemini = 1
        next
    }
    # Detect UNROLL_SECTION_END ACCUMULATE_GEMINI_FOLD_UNIVARIATE
    /\/\/\/ \{\{ UNROLL_SECTION_END ACCUMULATE_GEMINI_FOLD_UNIVARIATE \}\}/ {
        print  # Print the end marker
        in_accumulate_gemini = 0
        next
    }
    # Skip lines inside accumulate gemini section
    in_accumulate_gemini { next }
    # Print all other lines
    { print }
' "$TEMP_SOL" > "${TEMP_SOL}.tmp" && mv "${TEMP_SOL}.tmp" "$TEMP_SOL"

# Process the file to remove code inside GEMINI_FOLD_UNIVARIATE_ON_CURVE section while preserving the markers
awk '
    BEGIN {
        in_gemini_fold = 0
    }
    # Detect UNROLL_SECTION_START GEMINI_FOLD_UNIVARIATE_ON_CURVE
    /\/\/\/ \{\{ UNROLL_SECTION_START GEMINI_FOLD_UNIVARIATE_ON_CURVE \}\}/ {
        print  # Print the start marker
        in_gemini_fold = 1
        next
    }
    # Detect UNROLL_SECTION_END GEMINI_FOLD_UNIVARIATE_ON_CURVE
    /\/\/\/ \{\{ UNROLL_SECTION_END GEMINI_FOLD_UNIVARIATE_ON_CURVE \}\}/ {
        print  # Print the end marker
        in_gemini_fold = 0
        next
    }
    # Skip lines inside gemini fold section
    in_gemini_fold { next }
    # Print all other lines
    { print }
' "$TEMP_SOL" > "${TEMP_SOL}.tmp" && mv "${TEMP_SOL}.tmp" "$TEMP_SOL"

# Process the file to remove code inside MEMORY_LAYOUT section while preserving the markers
awk '
    BEGIN {
        in_memory_layout = 0
    }
    # Detect SECTION_START MEMORY_LAYOUT
    /\{\{[[:space:]]*SECTION_START[[:space:]]+MEMORY_LAYOUT[[:space:]]*\}\}/ {
        print  # Print the start marker
        in_memory_layout = 1
        next
    }
    # Detect SECTION_END MEMORY_LAYOUT
    /\{\{[[:space:]]*SECTION_END[[:space:]]+MEMORY_LAYOUT[[:space:]]*\}\}/ {
        print  # Print the end marker
        in_memory_layout = 0
        next
    }
    # Skip lines inside memory layout section
    in_memory_layout { next }
    # Print all other lines
    { print }
' "$TEMP_SOL" > "${TEMP_SOL}.tmp" && mv "${TEMP_SOL}.tmp" "$TEMP_SOL"

# Process the file to replace hardcoded values in loadVk with templates
awk '
BEGIN { in_loadVk = 0 }
# Detect start of loadVk function
/function loadVk\(\)/ {
    in_loadVk = 1
    print
    next
}
# Inside loadVk function
in_loadVk {
    # Replace hardcoded hex values with template placeholders
    if (/mstore\(Q_L_X_LOC,/) { print "                mstore(Q_L_X_LOC, {{ Q_L_X_LOC }})"; next }
    if (/mstore\(Q_L_Y_LOC,/) { print "                mstore(Q_L_Y_LOC, {{ Q_L_Y_LOC }})"; next }
    if (/mstore\(Q_R_X_LOC,/) { print "                mstore(Q_R_X_LOC, {{ Q_R_X_LOC }})"; next }
    if (/mstore\(Q_R_Y_LOC,/) { print "                mstore(Q_R_Y_LOC, {{ Q_R_Y_LOC }})"; next }
    if (/mstore\(Q_O_X_LOC,/) { print "                mstore(Q_O_X_LOC, {{ Q_O_X_LOC }})"; next }
    if (/mstore\(Q_O_Y_LOC,/) { print "                mstore(Q_O_Y_LOC, {{ Q_O_Y_LOC }})"; next }
    if (/mstore\(Q_4_X_LOC,/) { print "                mstore(Q_4_X_LOC, {{ Q_4_X_LOC }})"; next }
    if (/mstore\(Q_4_Y_LOC,/) { print "                mstore(Q_4_Y_LOC, {{ Q_4_Y_LOC }})"; next }
    if (/mstore\(Q_M_X_LOC,/) { print "                mstore(Q_M_X_LOC, {{ Q_M_X_LOC }})"; next }
    if (/mstore\(Q_M_Y_LOC,/) { print "                mstore(Q_M_Y_LOC, {{ Q_M_Y_LOC }})"; next }
    if (/mstore\(Q_C_X_LOC,/) { print "                mstore(Q_C_X_LOC, {{ Q_C_X_LOC }})"; next }
    if (/mstore\(Q_C_Y_LOC,/) { print "                mstore(Q_C_Y_LOC, {{ Q_C_Y_LOC }})"; next }
    if (/mstore\(Q_LOOKUP_X_LOC,/) { print "                mstore(Q_LOOKUP_X_LOC, {{ Q_LOOKUP_X_LOC }})"; next }
    if (/mstore\(Q_LOOKUP_Y_LOC,/) { print "                mstore(Q_LOOKUP_Y_LOC, {{ Q_LOOKUP_Y_LOC }})"; next }
    if (/mstore\(Q_ARITH_X_LOC,/) { print "                mstore(Q_ARITH_X_LOC, {{ Q_ARITH_X_LOC }})"; next }
    if (/mstore\(Q_ARITH_Y_LOC,/) { print "                mstore(Q_ARITH_Y_LOC, {{ Q_ARITH_Y_LOC }})"; next }
    if (/mstore\(Q_DELTA_RANGE_X_LOC,/) { print "                mstore(Q_DELTA_RANGE_X_LOC, {{ Q_DELTA_RANGE_X_LOC }})"; next }
    if (/mstore\(Q_DELTA_RANGE_Y_LOC,/) { print "                mstore(Q_DELTA_RANGE_Y_LOC, {{ Q_DELTA_RANGE_Y_LOC }})"; next }
    if (/mstore\(Q_ELLIPTIC_X_LOC,/) { print "                mstore(Q_ELLIPTIC_X_LOC, {{ Q_ELLIPTIC_X_LOC }})"; next }
    if (/mstore\(Q_ELLIPTIC_Y_LOC,/) { print "                mstore(Q_ELLIPTIC_Y_LOC, {{ Q_ELLIPTIC_Y_LOC }})"; next }
    if (/mstore\(Q_MEMORY_X_LOC,/) { print "                mstore(Q_MEMORY_X_LOC, {{ Q_MEMORY_X_LOC }})"; next }
    if (/mstore\(Q_MEMORY_Y_LOC,/) { print "                mstore(Q_MEMORY_Y_LOC, {{ Q_MEMORY_Y_LOC }})"; next }
    if (/mstore\(Q_NNF_X_LOC,/) { print "                mstore(Q_NNF_X_LOC, {{ Q_NNF_X_LOC }})"; next }
    if (/mstore\(Q_NNF_Y_LOC,/) { print "                mstore(Q_NNF_Y_LOC, {{ Q_NNF_Y_LOC }})"; next }
    if (/mstore\(Q_POSEIDON_2_EXTERNAL_X_LOC,/) { print "                mstore(Q_POSEIDON_2_EXTERNAL_X_LOC, {{ Q_POSEIDON_2_EXTERNAL_X_LOC }})"; next }
    if (/mstore\(Q_POSEIDON_2_EXTERNAL_Y_LOC,/) { print "                mstore(Q_POSEIDON_2_EXTERNAL_Y_LOC, {{ Q_POSEIDON_2_EXTERNAL_Y_LOC }})"; next }
    if (/mstore\(Q_POSEIDON_2_INTERNAL_X_LOC,/) { print "                mstore(Q_POSEIDON_2_INTERNAL_X_LOC, {{ Q_POSEIDON_2_INTERNAL_X_LOC }})"; next }
    if (/mstore\(Q_POSEIDON_2_INTERNAL_Y_LOC,/) { print "                mstore(Q_POSEIDON_2_INTERNAL_Y_LOC, {{ Q_POSEIDON_2_INTERNAL_Y_LOC }})"; next }
    if (/mstore\(SIGMA_1_X_LOC,/) { print "                mstore(SIGMA_1_X_LOC, {{ SIGMA_1_X_LOC }})"; next }
    if (/mstore\(SIGMA_1_Y_LOC,/) { print "                mstore(SIGMA_1_Y_LOC, {{ SIGMA_1_Y_LOC }})"; next }
    if (/mstore\(SIGMA_2_X_LOC,/) { print "                mstore(SIGMA_2_X_LOC, {{ SIGMA_2_X_LOC }})"; next }
    if (/mstore\(SIGMA_2_Y_LOC,/) { print "                mstore(SIGMA_2_Y_LOC, {{ SIGMA_2_Y_LOC }})"; next }
    if (/mstore\(SIGMA_3_X_LOC,/) { print "                mstore(SIGMA_3_X_LOC, {{ SIGMA_3_X_LOC }})"; next }
    if (/mstore\(SIGMA_3_Y_LOC,/) { print "                mstore(SIGMA_3_Y_LOC, {{ SIGMA_3_Y_LOC }})"; next }
    if (/mstore\(SIGMA_4_X_LOC,/) { print "                mstore(SIGMA_4_X_LOC, {{ SIGMA_4_X_LOC }})"; next }
    if (/mstore\(SIGMA_4_Y_LOC,/) { print "                mstore(SIGMA_4_Y_LOC, {{ SIGMA_4_Y_LOC }})"; next }
    if (/mstore\(TABLE_1_X_LOC,/) { print "                mstore(TABLE_1_X_LOC, {{ TABLE_1_X_LOC }})"; next }
    if (/mstore\(TABLE_1_Y_LOC,/) { print "                mstore(TABLE_1_Y_LOC, {{ TABLE_1_Y_LOC }})"; next }
    if (/mstore\(TABLE_2_X_LOC,/) { print "                mstore(TABLE_2_X_LOC, {{ TABLE_2_X_LOC }})"; next }
    if (/mstore\(TABLE_2_Y_LOC,/) { print "                mstore(TABLE_2_Y_LOC, {{ TABLE_2_Y_LOC }})"; next }
    if (/mstore\(TABLE_3_X_LOC,/) { print "                mstore(TABLE_3_X_LOC, {{ TABLE_3_X_LOC }})"; next }
    if (/mstore\(TABLE_3_Y_LOC,/) { print "                mstore(TABLE_3_Y_LOC, {{ TABLE_3_Y_LOC }})"; next }
    if (/mstore\(TABLE_4_X_LOC,/) { print "                mstore(TABLE_4_X_LOC, {{ TABLE_4_X_LOC }})"; next }
    if (/mstore\(TABLE_4_Y_LOC,/) { print "                mstore(TABLE_4_Y_LOC, {{ TABLE_4_Y_LOC }})"; next }
    if (/mstore\(ID_1_X_LOC,/) { print "                mstore(ID_1_X_LOC, {{ ID_1_X_LOC }})"; next }
    if (/mstore\(ID_1_Y_LOC,/) { print "                mstore(ID_1_Y_LOC, {{ ID_1_Y_LOC }})"; next }
    if (/mstore\(ID_2_X_LOC,/) { print "                mstore(ID_2_X_LOC, {{ ID_2_X_LOC }})"; next }
    if (/mstore\(ID_2_Y_LOC,/) { print "                mstore(ID_2_Y_LOC, {{ ID_2_Y_LOC }})"; next }
    if (/mstore\(ID_3_X_LOC,/) { print "                mstore(ID_3_X_LOC, {{ ID_3_X_LOC }})"; next }
    if (/mstore\(ID_3_Y_LOC,/) { print "                mstore(ID_3_Y_LOC, {{ ID_3_Y_LOC }})"; next }
    if (/mstore\(ID_4_X_LOC,/) { print "                mstore(ID_4_X_LOC, {{ ID_4_X_LOC }})"; next }
    if (/mstore\(ID_4_Y_LOC,/) { print "                mstore(ID_4_Y_LOC, {{ ID_4_Y_LOC }})"; next }
    if (/mstore\(LAGRANGE_FIRST_X_LOC,/) { print "                mstore(LAGRANGE_FIRST_X_LOC, {{ LAGRANGE_FIRST_X_LOC }})"; next }
    if (/mstore\(LAGRANGE_FIRST_Y_LOC,/) { print "                mstore(LAGRANGE_FIRST_Y_LOC, {{ LAGRANGE_FIRST_Y_LOC }})"; next }
    if (/mstore\(LAGRANGE_LAST_X_LOC,/) { print "                mstore(LAGRANGE_LAST_X_LOC, {{ LAGRANGE_LAST_X_LOC }})"; next }
    if (/mstore\(LAGRANGE_LAST_Y_LOC,/) { print "                mstore(LAGRANGE_LAST_Y_LOC, {{ LAGRANGE_LAST_Y_LOC }})"; next }
    # Detect end of loadVk function
    if (/^[[:space:]]*}[[:space:]]*$/) {
        in_loadVk = 0
    }
}
# Print all other lines as-is
{ print }
' "$TEMP_SOL" > "$TEMP_PROCESSED"

# Build the final Solidity content
FINAL_SOL=$(mktemp)

# Start with SPDX license identifier
echo "// SPDX-License-Identifier: Apache-2.0" > "$FINAL_SOL"
echo "// Copyright 2022 Aztec" >> "$FINAL_SOL"
echo "pragma solidity ^0.8.27;" >> "$FINAL_SOL"
echo "" >> "$FINAL_SOL"

# Add the IVerifier interface (stripping pragma and SPDX)
IVERIFIER_FILE="$BARRETENBERG_DIR/sol/src/interfaces/IVerifier.sol"
if [ -f "$IVERIFIER_FILE" ]; then
    # Skip SPDX, copyright, and pragma lines
    sed -n '/^interface IVerifier/,/^}$/p' "$IVERIFIER_FILE" >> "$FINAL_SOL"
    echo "" >> "$FINAL_SOL"
else
    echo "Warning: IVerifier.sol not found at $IVERIFIER_FILE"
fi

# Add the processed Solidity content, skipping SPDX, pragma, copyright, and any import statements
awk '
    /^\/\/ SPDX-License-Identifier:/ { next }
    /^pragma/ { next }
    /^import/ { next }
    /[Cc]opyright/ { next }
    { print }
' "$TEMP_PROCESSED" >> "$FINAL_SOL"

# Now build the complete C++ file
# Copy everything up to and including the R"( marker
sed -n '1,/^static const char HONK_CONTRACT_OPT_SOURCE\[\] = R"($/p' "$CPP_FILE" > "$TEMP_CPP"

# Add the final Solidity content
cat "$FINAL_SOL" >> "$TEMP_CPP"

# Clean up
rm -f "$FINAL_SOL"

# Add the closing )"; and everything after from the original file
echo ')";' >> "$TEMP_CPP"
sed -n '/^)";/,$p' "$CPP_FILE" | tail -n +2 >> "$TEMP_CPP"

# Replace the original file
mv "$TEMP_CPP" "$CPP_FILE"

echo ""
echo "Optimized verifier copied successfully!"

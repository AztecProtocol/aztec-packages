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
ZK_CPP_FILE="$BARRETENBERG_DIR/cpp/src/barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"

# Check if source directory exists
if [ ! -d "$SOL_SRC_DIR" ]; then
    echo "Error: Solidity source directory not found at $SOL_SRC_DIR"
    exit 1
fi

# Check if target files exist
if [ ! -f "$CPP_FILE" ]; then
    echo "Error: Target C++ file not found at $CPP_FILE"
    exit 1
fi

echo "Processing Solidity files from: $SOL_SRC_DIR"
echo "Target C++ files: $CPP_FILE and $ZK_CPP_FILE"

# Create temporary files for the combined Solidity code
TEMP_SOL_FILE=$(mktemp)
TEMP_ZK_SOL_FILE=$(mktemp)
trap "rm -f $TEMP_SOL_FILE $TEMP_ZK_SOL_FILE" EXIT

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

# Function to process a solidity file
process_sol_file() {
    local file=$1
    local output_file=$2
    local label=${3:-$(basename "$file")}
    
    echo "Processing $label..."
    strip_imports_and_pragma "$file" >> "$output_file"
    echo "" >> "$output_file"
}

# Function to update a C++ file with combined Solidity code
update_cpp_file() {
    local cpp_file=$1
    local sol_file=$2
    local marker_name=$3
    local file_label=$4
    
    if [ ! -f "$cpp_file" ]; then
        echo "Warning: C++ file not found at $cpp_file"
        return 1
    fi
    
    # Optionally create a backup
    if [ "$SKIP_BACKUP" = false ]; then
        echo "Creating backup of $file_label..."
        cp "$cpp_file" "${cpp_file}.bak"
        echo "Backup saved as ${cpp_file}.bak"
    fi
    
    # Create a new version of the C++ file
    local temp_cpp=$(mktemp)
    
    # Copy everything up to and including the R"( marker
    sed -n "1,/^static const char ${marker_name}\[\] = R\"(/p" "$cpp_file" > "$temp_cpp"
    
    # Add the combined Solidity code
    cat "$sol_file" >> "$temp_cpp"
    
    # Add the closing )"; and everything after
    echo ')";' >> "$temp_cpp"
    sed -n '/^)";/,$p' "$cpp_file" | tail -n +2 >> "$temp_cpp"
    
    # Replace the original file
    mv "$temp_cpp" "$cpp_file"
    
    echo "Successfully updated $cpp_file"
}

# Function to build verifier files
build_verifier() {
    local output_file=$1
    local is_zk=$2
    local verifier_type=${3:-"Honk"}
    
    echo ""
    echo "Building ${verifier_type} verifier..."
    
    # Start with pragma statement
    echo "pragma solidity ^0.8.27;" > "$output_file"
    echo "" >> "$output_file"
    
    # Process core files
    process_sol_file "$SOL_SRC_DIR/Fr.sol" "$output_file"
    process_sol_file "$SOL_SRC_DIR/HonkTypes.sol" "$output_file"
    
    # Use appropriate transcript file
    if [ "$is_zk" = true ]; then
        process_sol_file "$SOL_SRC_DIR/ZKTranscript.sol" "$output_file"
    else
        process_sol_file "$SOL_SRC_DIR/Transcript.sol" "$output_file"
    fi
    
    # Process common files
    process_sol_file "$SOL_SRC_DIR/Relations.sol" "$output_file"
    process_sol_file "$SOL_SRC_DIR/CommitmentScheme.sol" "$output_file"
    process_sol_file "$SOL_SRC_DIR/utils.sol" "$output_file"
    
    # Use appropriate base verifier
    if [ "$is_zk" = true ]; then
        process_sol_file "$SOL_SRC_DIR/BaseZKHonkVerifier.sol" "$output_file"
    else
        process_sol_file "$SOL_SRC_DIR/BaseHonkVerifier.sol" "$output_file"
    fi
    
    # Add the final contract template
    if [ "$is_zk" = false ]; then
        cat >> "$output_file" << 'EOF'
contract HonkVerifier is BaseHonkVerifier(N, LOG_N, NUMBER_OF_PUBLIC_INPUTS) {
     function loadVerificationKey() internal pure override returns (Honk.VerificationKey memory) {
       return HonkVerificationKey.loadVerificationKey();
    }
}
EOF
    fi
}

# Process standard Honk verifier
build_verifier "$TEMP_SOL_FILE" false "standard Honk"
update_cpp_file "$CPP_FILE" "$TEMP_SOL_FILE" "HONK_CONTRACT_SOURCE" "honk_contract.hpp"

# Process ZK Honk verifier
build_verifier "$TEMP_ZK_SOL_FILE" true "ZK Honk"
update_cpp_file "$ZK_CPP_FILE" "$TEMP_ZK_SOL_FILE" "HONK_ZK_CONTRACT_SOURCE" "honk_zk_contract.hpp"

echo ""
echo "All files processed successfully!"
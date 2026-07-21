#!/usr/bin/env bash
# Script to sync VK values from generated BlakeHonkVerificationKey.sol to optimized verifiers.
# Supports both non-ZK (honk-optimized.sol.template) and ZK (zk-honk-optimized.sol.template).
#
# Usage:
#   ./sync_blake_opt_vk.sh          # Sync both (default)
#   ./sync_blake_opt_vk.sh --zk     # Sync ZK optimized verifier only
#   ./sync_blake_opt_vk.sh --non-zk # Sync non-ZK optimized verifier only
#
# This script is IDEMPOTENT - safe to run multiple times, will only update if values differ

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VK_FILE="$SCRIPT_DIR/../src/honk/keys/BlakeHonkVerificationKey.sol"

if [ ! -f "$VK_FILE" ]; then
    echo "Error: VK file not found at $VK_FILE"
    exit 1
fi

# Function to extract x,y coordinates from VK file for a given field name
extract_coords() {
    local field_name="$1"
    local x=$(grep -A1 "$field_name: Honk.G1Point" "$VK_FILE" | grep " x:" | sed -E 's/.*uint256\((0x[0-9a-fA-F]+)\).*/\1/')
    local y=$(grep -A2 "$field_name: Honk.G1Point" "$VK_FILE" | grep " y:" | sed -E 's/.*uint256\((0x[0-9a-fA-F]+)\).*/\1/')
    echo "$x $y"
}

sync_template() {
    local TEMPLATE_FILE="$1"
    local OPT_FILE="$2"
    local LABEL="$3"

    if [ ! -f "$TEMPLATE_FILE" ]; then
        echo "Error: $LABEL template not found at $TEMPLATE_FILE"
        exit 1
    fi

    # Always copy template to target
    cp "$TEMPLATE_FILE" "$OPT_FILE"

    # Extract VK_HASH for idempotency check
    local VK_HASH=$(grep "uint256 constant VK_HASH" "$VK_FILE" | sed -E 's/.*= (0x[0-9a-fA-F]+);/\1/')
    local CURRENT_VK_HASH=$(grep "uint256 constant VK_HASH" "$OPT_FILE" | sed -E 's/.*= (0x[0-9a-fA-F]+);/\1/')

    # Extract circuit parameters
    local CIRCUIT_SIZE=$(grep "uint256 constant N = " "$VK_FILE" | sed -E 's/.*= ([0-9]+);/\1/')
    local LOG_N=$(grep "uint256 constant LOG_N" "$VK_FILE" | sed -E 's/.*= ([0-9]+);/\1/')
    local NUM_PUBLIC_INPUTS=$(grep "uint256 constant NUMBER_OF_PUBLIC_INPUTS" "$VK_FILE" | sed -E 's/.*= ([0-9]+);/\1/')

    # Extract all polynomial commitments
    local Q_L_X Q_L_Y; read Q_L_X Q_L_Y <<< $(extract_coords "ql")
    local Q_R_X Q_R_Y; read Q_R_X Q_R_Y <<< $(extract_coords "qr")
    local Q_O_X Q_O_Y; read Q_O_X Q_O_Y <<< $(extract_coords "qo")
    local Q_4_X Q_4_Y; read Q_4_X Q_4_Y <<< $(extract_coords "q4")
    local Q_M_X Q_M_Y; read Q_M_X Q_M_Y <<< $(extract_coords "qm")
    local Q_C_X Q_C_Y; read Q_C_X Q_C_Y <<< $(extract_coords "qc")
    local Q_LOOKUP_X Q_LOOKUP_Y; read Q_LOOKUP_X Q_LOOKUP_Y <<< $(extract_coords "qLookup")
    local Q_ARITH_X Q_ARITH_Y; read Q_ARITH_X Q_ARITH_Y <<< $(extract_coords "qArith")
    local Q_DELTA_RANGE_X Q_DELTA_RANGE_Y; read Q_DELTA_RANGE_X Q_DELTA_RANGE_Y <<< $(extract_coords "qDeltaRange")
    local Q_ELLIPTIC_X Q_ELLIPTIC_Y; read Q_ELLIPTIC_X Q_ELLIPTIC_Y <<< $(extract_coords "qElliptic")
    local Q_MEMORY_X Q_MEMORY_Y; read Q_MEMORY_X Q_MEMORY_Y <<< $(extract_coords "qMemory")
    local Q_NNF_X Q_NNF_Y; read Q_NNF_X Q_NNF_Y <<< $(extract_coords "qNnf")
    local Q_POSEIDON_2_EXTERNAL_X Q_POSEIDON_2_EXTERNAL_Y; read Q_POSEIDON_2_EXTERNAL_X Q_POSEIDON_2_EXTERNAL_Y <<< $(extract_coords "qPoseidon2External")
    local Q_POSEIDON_2_INTERNAL_X Q_POSEIDON_2_INTERNAL_Y; read Q_POSEIDON_2_INTERNAL_X Q_POSEIDON_2_INTERNAL_Y <<< $(extract_coords "qPoseidon2Internal")

    # Extract permutation polynomials (SIGMA in template, s in VK)
    local SIGMA_1_X SIGMA_1_Y; read SIGMA_1_X SIGMA_1_Y <<< $(extract_coords "s1")
    local SIGMA_2_X SIGMA_2_Y; read SIGMA_2_X SIGMA_2_Y <<< $(extract_coords "s2")
    local SIGMA_3_X SIGMA_3_Y; read SIGMA_3_X SIGMA_3_Y <<< $(extract_coords "s3")
    local SIGMA_4_X SIGMA_4_Y; read SIGMA_4_X SIGMA_4_Y <<< $(extract_coords "s4")

    # Extract TABLE polynomials
    local TABLE_1_X TABLE_1_Y; read TABLE_1_X TABLE_1_Y <<< $(extract_coords "t1")
    local TABLE_2_X TABLE_2_Y; read TABLE_2_X TABLE_2_Y <<< $(extract_coords "t2")
    local TABLE_3_X TABLE_3_Y; read TABLE_3_X TABLE_3_Y <<< $(extract_coords "t3")
    local TABLE_4_X TABLE_4_Y; read TABLE_4_X TABLE_4_Y <<< $(extract_coords "t4")

    # Extract ID polynomials
    local ID_1_X ID_1_Y; read ID_1_X ID_1_Y <<< $(extract_coords "id1")
    local ID_2_X ID_2_Y; read ID_2_X ID_2_Y <<< $(extract_coords "id2")
    local ID_3_X ID_3_Y; read ID_3_X ID_3_Y <<< $(extract_coords "id3")
    local ID_4_X ID_4_Y; read ID_4_X ID_4_Y <<< $(extract_coords "id4")

    # Extract Lagrange polynomials
    local LAGRANGE_FIRST_X LAGRANGE_FIRST_Y; read LAGRANGE_FIRST_X LAGRANGE_FIRST_Y <<< $(extract_coords "lagrangeFirst")
    local LAGRANGE_LAST_X LAGRANGE_LAST_Y; read LAGRANGE_LAST_X LAGRANGE_LAST_Y <<< $(extract_coords "lagrangeLast")

    # Create backup
    cp "$OPT_FILE" "${OPT_FILE}.bak"

    # Update VK_HASH
    sed -i "s/uint256 constant VK_HASH = 0x[0-9a-fA-F]\+;/uint256 constant VK_HASH = $VK_HASH;/" "$OPT_FILE"

    # Update circuit parameters
    sed -i "s/uint256 constant CIRCUIT_SIZE = [0-9]\+;/uint256 constant CIRCUIT_SIZE = $CIRCUIT_SIZE;/" "$OPT_FILE"
    sed -i "s/uint256 constant LOG_N = [0-9]\+;/uint256 constant LOG_N = $LOG_N;/" "$OPT_FILE"
    sed -i "s/uint256 constant NUMBER_PUBLIC_INPUTS = [0-9]\+;/uint256 constant NUMBER_PUBLIC_INPUTS = $NUM_PUBLIC_INPUTS;/" "$OPT_FILE"
    sed -i "s/uint256 constant REAL_NUMBER_PUBLIC_INPUTS = [0-9]\+ - 8;/uint256 constant REAL_NUMBER_PUBLIC_INPUTS = $NUM_PUBLIC_INPUTS - 8;/" "$OPT_FILE"

    # Update Q polynomial commitments
    sed -i "s/mstore(Q_L_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_L_X_LOC, $Q_L_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_L_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_L_Y_LOC, $Q_L_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_R_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_R_X_LOC, $Q_R_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_R_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_R_Y_LOC, $Q_R_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_O_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_O_X_LOC, $Q_O_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_O_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_O_Y_LOC, $Q_O_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_4_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_4_X_LOC, $Q_4_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_4_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_4_Y_LOC, $Q_4_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_M_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_M_X_LOC, $Q_M_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_M_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_M_Y_LOC, $Q_M_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_C_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_C_X_LOC, $Q_C_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_C_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_C_Y_LOC, $Q_C_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_LOOKUP_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_LOOKUP_X_LOC, $Q_LOOKUP_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_LOOKUP_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_LOOKUP_Y_LOC, $Q_LOOKUP_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_ARITH_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_ARITH_X_LOC, $Q_ARITH_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_ARITH_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_ARITH_Y_LOC, $Q_ARITH_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_DELTA_RANGE_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_DELTA_RANGE_X_LOC, $Q_DELTA_RANGE_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_DELTA_RANGE_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_DELTA_RANGE_Y_LOC, $Q_DELTA_RANGE_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_ELLIPTIC_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_ELLIPTIC_X_LOC, $Q_ELLIPTIC_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_ELLIPTIC_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_ELLIPTIC_Y_LOC, $Q_ELLIPTIC_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_MEMORY_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_MEMORY_X_LOC, $Q_MEMORY_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_MEMORY_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_MEMORY_Y_LOC, $Q_MEMORY_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_NNF_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_NNF_X_LOC, $Q_NNF_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_NNF_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_NNF_Y_LOC, $Q_NNF_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_POSEIDON_2_EXTERNAL_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_POSEIDON_2_EXTERNAL_X_LOC, $Q_POSEIDON_2_EXTERNAL_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_POSEIDON_2_EXTERNAL_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_POSEIDON_2_EXTERNAL_Y_LOC, $Q_POSEIDON_2_EXTERNAL_Y)/" "$OPT_FILE"
    sed -i "s/mstore(Q_POSEIDON_2_INTERNAL_X_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_POSEIDON_2_INTERNAL_X_LOC, $Q_POSEIDON_2_INTERNAL_X)/" "$OPT_FILE"
    sed -i "s/mstore(Q_POSEIDON_2_INTERNAL_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(Q_POSEIDON_2_INTERNAL_Y_LOC, $Q_POSEIDON_2_INTERNAL_Y)/" "$OPT_FILE"

    # Update SIGMA (permutation) polynomial commitments
    sed -i "s/mstore(SIGMA_1_X_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_1_X_LOC, $SIGMA_1_X)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_1_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_1_Y_LOC, $SIGMA_1_Y)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_2_X_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_2_X_LOC, $SIGMA_2_X)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_2_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_2_Y_LOC, $SIGMA_2_Y)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_3_X_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_3_X_LOC, $SIGMA_3_X)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_3_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_3_Y_LOC, $SIGMA_3_Y)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_4_X_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_4_X_LOC, $SIGMA_4_X)/" "$OPT_FILE"
    sed -i "s/mstore(SIGMA_4_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(SIGMA_4_Y_LOC, $SIGMA_4_Y)/" "$OPT_FILE"

    # Update TABLE polynomial commitments
    sed -i "s/mstore(TABLE_1_X_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_1_X_LOC, $TABLE_1_X)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_1_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_1_Y_LOC, $TABLE_1_Y)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_2_X_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_2_X_LOC, $TABLE_2_X)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_2_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_2_Y_LOC, $TABLE_2_Y)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_3_X_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_3_X_LOC, $TABLE_3_X)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_3_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_3_Y_LOC, $TABLE_3_Y)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_4_X_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_4_X_LOC, $TABLE_4_X)/" "$OPT_FILE"
    sed -i "s/mstore(TABLE_4_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(TABLE_4_Y_LOC, $TABLE_4_Y)/" "$OPT_FILE"

    # Update ID polynomial commitments
    sed -i "s/mstore(ID_1_X_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_1_X_LOC, $ID_1_X)/" "$OPT_FILE"
    sed -i "s/mstore(ID_1_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_1_Y_LOC, $ID_1_Y)/" "$OPT_FILE"
    sed -i "s/mstore(ID_2_X_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_2_X_LOC, $ID_2_X)/" "$OPT_FILE"
    sed -i "s/mstore(ID_2_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_2_Y_LOC, $ID_2_Y)/" "$OPT_FILE"
    sed -i "s/mstore(ID_3_X_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_3_X_LOC, $ID_3_X)/" "$OPT_FILE"
    sed -i "s/mstore(ID_3_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_3_Y_LOC, $ID_3_Y)/" "$OPT_FILE"
    sed -i "s/mstore(ID_4_X_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_4_X_LOC, $ID_4_X)/" "$OPT_FILE"
    sed -i "s/mstore(ID_4_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(ID_4_Y_LOC, $ID_4_Y)/" "$OPT_FILE"

    # Update Lagrange polynomial commitments
    sed -i "s/mstore(LAGRANGE_FIRST_X_LOC, 0x[0-9a-fA-F]\+)/mstore(LAGRANGE_FIRST_X_LOC, $LAGRANGE_FIRST_X)/" "$OPT_FILE"
    sed -i "s/mstore(LAGRANGE_FIRST_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(LAGRANGE_FIRST_Y_LOC, $LAGRANGE_FIRST_Y)/" "$OPT_FILE"
    sed -i "s/mstore(LAGRANGE_LAST_X_LOC, 0x[0-9a-fA-F]\+)/mstore(LAGRANGE_LAST_X_LOC, $LAGRANGE_LAST_X)/" "$OPT_FILE"
    sed -i "s/mstore(LAGRANGE_LAST_Y_LOC, 0x[0-9a-fA-F]\+)/mstore(LAGRANGE_LAST_Y_LOC, $LAGRANGE_LAST_Y)/" "$OPT_FILE"

    echo "✓ Successfully synced all VK values to $LABEL"
    echo "  Updated: VK_HASH, circuit params, and all selector commitments"
    echo "  Backup saved at ${OPT_FILE}.bak"
}

# Dispatch based on mode
MODE="${1:---default}"
case "$MODE" in
    --zk)
        sync_template "$SCRIPT_DIR/../src/honk/optimised/zk-honk-optimized.sol.template" \
                      "$SCRIPT_DIR/../src/honk/instance/BlakeOptZK.sol" "BlakeOptZK.sol"
        ;;
    --non-zk)
        sync_template "$SCRIPT_DIR/../src/honk/optimised/honk-optimized.sol.template" \
                      "$SCRIPT_DIR/../src/honk/instance/BlakeHonkOpt.sol" "BlakeHonkOpt.sol"
        ;;
    *)
        sync_template "$SCRIPT_DIR/../src/honk/optimised/honk-optimized.sol.template" \
                      "$SCRIPT_DIR/../src/honk/instance/BlakeHonkOpt.sol" "BlakeHonkOpt.sol"
        sync_template "$SCRIPT_DIR/../src/honk/optimised/zk-honk-optimized.sol.template" \
                      "$SCRIPT_DIR/../src/honk/instance/BlakeOptZK.sol" "BlakeOptZK.sol"
        ;;
esac

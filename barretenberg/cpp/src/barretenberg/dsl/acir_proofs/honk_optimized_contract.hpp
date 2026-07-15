// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "honk_optimized_common.hpp"
#include <sstream>
#include <vector>

// Source code for the Ultrahonk Solidity verifier.
// It's expected that the AcirComposer will inject a library which will load the verification key into memory.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
static const char HONK_CONTRACT_OPT_SOURCE[] = R"(
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity ^0.8.27;

interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}



uint256 constant NUMBER_OF_SUBRELATIONS = 29;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 8;
uint256 constant ZK_BATCHED_RELATION_PARTIAL_LENGTH = 9;
uint256 constant NUMBER_OF_ENTITIES = 41;
uint256 constant NUMBER_UNSHIFTED = 36;
uint256 constant NUMBER_TO_BE_SHIFTED = 5;
uint256 constant PAIRING_POINTS_SIZE = 8;

uint256 constant VK_HASH = {{ VK_HASH }};
uint256 constant CIRCUIT_SIZE = {{ CIRCUIT_SIZE }};
uint256 constant LOG_N = {{ LOG_CIRCUIT_SIZE }};
uint256 constant NUMBER_PUBLIC_INPUTS = {{ NUM_PUBLIC_INPUTS }};
uint256 constant REAL_NUMBER_PUBLIC_INPUTS = {{ REAL_NUM_PUBLIC_INPUTS }};
uint256 constant PUBLIC_INPUTS_OFFSET = 5; // NUM_DISABLED_ROWS_IN_SUMCHECK + NUM_ZERO_ROWS = 4 + 1

contract HonkVerifier is IVerifier {
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                    SLAB ALLOCATION                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    /**
     * We manually manage memory within this optimised implementation.
     * Memory is loaded into a large slab with the following layout:
     *
     * HIGH MEMORY (persistent, non-overlapping regions from 0x1000 upward):
     *
     *                    VK Data (circuit size, num PIs, offset, 28 G1 commitment points)
     *                    Proof: Pairing point limbs (8 field elements)
     *                    Proof: Witness commitments (W_L..Z_PERM, 8 G1 points)
     *                    Proof: Sumcheck univariates (LOG_N rounds x 8 coefficients)
     *                    Proof: Sumcheck evaluations (41 entity evaluations)
     *                    Proof: Gemini fold commitments (LOG_N-1 G1 points)
     *                    Proof: Gemini A evaluations (LOG_N field elements)
     *                    Proof: Shplonk Q + KZG quotient (2 G1 points)
     *                    Challenges (eta..sum_u, alpha[0..26], gate + sum_u challenges)
     *                    Subrelation evaluations (28 slots, used during sumcheck)
     *                    Subrelation intermediates (7 slots: round target, pow, AUX)
     *                    Powers of evaluation challenge (LOG_N slots)
     *                    Batch scalars (69 slots, for MSM)
     *                    Gemini R inverse (1 slot)
     *                    Inverted Gemini denominators (LOG_N+1 = 16 slots)
     *                    Batch evaluation accumulator inversions (LOG_N slots)
     *                    Batched eval, constant term accumulator, pos/neg inv denom
     *                    Inverted challenge^pow - u (LOG_N slots)
     *                    Pos inverted denominators (LOG_N slots)
     *                    Neg inverted denominators (LOG_N slots)
     *                    Fold pos evaluations (LOG_N slots)
     *                    LATER_SCRATCH_SPACE (batch inversion products marker)
     *                    Temporary space (45 slots, ephemeral computation)
     *
     * LOW MEMORY / SCRATCH SPACE (barycentric evaluation during sumcheck):
     *                    Barycentric Lagrange denominators (8 domain points)
     *                    Barycentric denominator inverses (LOG_N x 8 slots)
     *                     [Slots at 0x1000-0x10E0 overlap VK data; VK is re-loaded later]
     *
     *   Scratch aliases (0x00-0x40): CHALL_POW/SUMCHECK_U/GEMINI_A during sumcheck;
     *   SS_POS_INV_DENOM/SS_NEG_INV_DENOM/SS_GEMINI_EVALS during shplemini.
     *   MSM stage reuses 0x00-0xA0 for ACCUMULATOR, G1_LOCATION, SCALAR.
     */

    // {{ SECTION_START MEMORY_LAYOUT }}
    // {{ SECTION_END MEMORY_LAYOUT }}

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                 SUMCHECK - MEMORY ALIASES                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant EC_X_1 = W2_EVAL_LOC;
    uint256 internal constant EC_Y_1 = W3_EVAL_LOC;
    uint256 internal constant EC_X_2 = W1_SHIFT_EVAL_LOC;
    uint256 internal constant EC_Y_2 = W4_SHIFT_EVAL_LOC;
    uint256 internal constant EC_Y_3 = W3_SHIFT_EVAL_LOC;
    uint256 internal constant EC_X_3 = W2_SHIFT_EVAL_LOC;

    // Aliases for selectors (Elliptic curve gadget)
    uint256 internal constant EC_Q_SIGN = QL_EVAL_LOC;
    uint256 internal constant EC_Q_IS_DOUBLE = QM_EVAL_LOC;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                          CONSTANTS                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant GRUMPKIN_CURVE_B_PARAMETER_NEGATED = 17; // -(-17)

    // Auxiliary relation constants
    // In the Non Native Field Arithmetic Relation, large field elements are broken up into 4 LIMBs of 68 `LIMB_SIZE` bits each.
    uint256 internal constant LIMB_SIZE = 0x100000000000000000; // 1<<68

    // In the Delta Range Check Relation, there is a range checking relation that can validate 14-bit range checks with only 1
    // extra relation in the execution trace.
    // For large range checks, we decompose them into a collection of 14-bit range checks.
    uint256 internal constant SUBLIMB_SHIFT = 0x4000; // 1<<14

    // Poseidon2 internal constants
    // https://github.com/HorizenLabs/poseidon2/blob/main/poseidon2_rust_params.sage - derivation code
    uint256 internal constant POS_INTERNAL_MATRIX_D_0 =
        0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7;
    uint256 internal constant POS_INTERNAL_MATRIX_D_1 =
        0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b;
    uint256 internal constant POS_INTERNAL_MATRIX_D_2 =
        0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15;
    uint256 internal constant POS_INTERNAL_MATRIX_D_3 =
        0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b;

    // Constants inspecting proof components
    uint256 internal constant NUMBER_OF_UNSHIFTED_ENTITIES = 36;
    // Shifted columns are columns that are duplicates of existing columns but right-shifted by 1
    uint256 internal constant NUMBER_OF_SHIFTED_ENTITIES = 5;
    uint256 internal constant TOTAL_NUMBER_OF_ENTITIES = 41;

    // Constants for performing batch multiplication
    uint256 internal constant ACCUMULATOR = 0x00;
    uint256 internal constant ACCUMULATOR_2 = 0x40;
    uint256 internal constant G1_LOCATION = 0x60;
    uint256 internal constant G1_Y_LOCATION = 0x80;
    uint256 internal constant SCALAR_LOCATION = 0xa0;

    uint256 internal constant LOWER_127_MASK = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    // Group order
    uint256 internal constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order

    // Field order constants
    // -1/2 mod p
    uint256 internal constant NEG_HALF_MODULO_P = 0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000000;
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant P_SUB_1 = 21888242871839275222246405745257275088548364400416034343698204186575808495616;
    uint256 internal constant P_SUB_2 = 21888242871839275222246405745257275088548364400416034343698204186575808495615;
    uint256 internal constant P_SUB_3 = 21888242871839275222246405745257275088548364400416034343698204186575808495614;

    // Barycentric evaluation constants
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_0 =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_1 =
        0x00000000000000000000000000000000000000000000000000000000000002d0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_2 =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff11;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_3 =
        0x0000000000000000000000000000000000000000000000000000000000000090;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_4 =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff71;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_5 =
        0x00000000000000000000000000000000000000000000000000000000000000f0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_6 =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_7 =
        0x00000000000000000000000000000000000000000000000000000000000013b0;

    // Constants for computing public input delta
    uint256 internal constant PERMUTATION_ARGUMENT_VALUE_SEPARATOR = 1 << 28;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         ERRORS                             */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    // The errors match Errors.sol

    bytes4 internal constant VALUE_GE_LIMB_MAX_SELECTOR = 0xeb73e0bd;
    bytes4 internal constant VALUE_GE_GROUP_ORDER_SELECTOR = 0x607be13e;
    bytes4 internal constant VALUE_GE_FIELD_ORDER_SELECTOR = 0x20a33589;
    bytes4 internal constant SUMCHECK_FAILED_SELECTOR = 0x9fc3a218;
    bytes4 internal constant SHPLEMINI_FAILED_SELECTOR = 0xa5d82e8a;

    bytes4 internal constant PROOF_LENGTH_WRONG_WITH_LOG_N_SELECTOR = 0x59895a53;
    bytes4 internal constant PUBLIC_INPUTS_LENGTH_WRONG_SELECTOR = 0xfa066593;

    bytes4 internal constant MODEXP_FAILED_SELECTOR = 0xf442f163;

    constructor() {}

    function verify(
        bytes calldata,
        /*proof*/
        bytes32[] calldata /*public_inputs*/
    )
        public
        view
        override
        returns (bool)
    {
        // Load the proof from calldata in one large chunk
        assembly {
            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                   LOAD VERIFCATION KEY                     */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            // Write the verification key into memory
            //
            // Although defined at the top of the file, it is used towards the end of the algorithm when batching in the commitment scheme.
            function loadVk() {
                mstore(Q_L_X_LOC, {{ Q_L_X_LOC }})
                mstore(Q_L_Y_LOC, {{ Q_L_Y_LOC }})
                mstore(Q_R_X_LOC, {{ Q_R_X_LOC }})
                mstore(Q_R_Y_LOC, {{ Q_R_Y_LOC }})
                mstore(Q_O_X_LOC, {{ Q_O_X_LOC }})
                mstore(Q_O_Y_LOC, {{ Q_O_Y_LOC }})
                mstore(Q_4_X_LOC, {{ Q_4_X_LOC }})
                mstore(Q_4_Y_LOC, {{ Q_4_Y_LOC }})
                mstore(Q_M_X_LOC, {{ Q_M_X_LOC }})
                mstore(Q_M_Y_LOC, {{ Q_M_Y_LOC }})
                mstore(Q_C_X_LOC, {{ Q_C_X_LOC }})
                mstore(Q_C_Y_LOC, {{ Q_C_Y_LOC }})
                mstore(Q_LOOKUP_X_LOC, {{ Q_LOOKUP_X_LOC }})
                mstore(Q_LOOKUP_Y_LOC, {{ Q_LOOKUP_Y_LOC }})
                mstore(Q_ARITH_X_LOC, {{ Q_ARITH_X_LOC }})
                mstore(Q_ARITH_Y_LOC, {{ Q_ARITH_Y_LOC }})
                mstore(Q_DELTA_RANGE_X_LOC, {{ Q_DELTA_RANGE_X_LOC }})
                mstore(Q_DELTA_RANGE_Y_LOC, {{ Q_DELTA_RANGE_Y_LOC }})
                mstore(Q_ELLIPTIC_X_LOC, {{ Q_ELLIPTIC_X_LOC }})
                mstore(Q_ELLIPTIC_Y_LOC, {{ Q_ELLIPTIC_Y_LOC }})
                mstore(Q_MEMORY_X_LOC, {{ Q_MEMORY_X_LOC }})
                mstore(Q_MEMORY_Y_LOC, {{ Q_MEMORY_Y_LOC }})
                mstore(Q_NNF_X_LOC, {{ Q_NNF_X_LOC }})
                mstore(Q_NNF_Y_LOC, {{ Q_NNF_Y_LOC }})
                mstore(Q_POSEIDON_2_EXTERNAL_X_LOC, {{ Q_POSEIDON_2_EXTERNAL_X_LOC }})
                mstore(Q_POSEIDON_2_EXTERNAL_Y_LOC, {{ Q_POSEIDON_2_EXTERNAL_Y_LOC }})
                mstore(Q_POSEIDON_2_INTERNAL_X_LOC, {{ Q_POSEIDON_2_INTERNAL_X_LOC }})
                mstore(Q_POSEIDON_2_INTERNAL_Y_LOC, {{ Q_POSEIDON_2_INTERNAL_Y_LOC }})
                mstore(SIGMA_1_X_LOC, {{ SIGMA_1_X_LOC }})
                mstore(SIGMA_1_Y_LOC, {{ SIGMA_1_Y_LOC }})
                mstore(SIGMA_2_X_LOC, {{ SIGMA_2_X_LOC }})
                mstore(SIGMA_2_Y_LOC, {{ SIGMA_2_Y_LOC }})
                mstore(SIGMA_3_X_LOC, {{ SIGMA_3_X_LOC }})
                mstore(SIGMA_3_Y_LOC, {{ SIGMA_3_Y_LOC }})
                mstore(SIGMA_4_X_LOC, {{ SIGMA_4_X_LOC }})
                mstore(SIGMA_4_Y_LOC, {{ SIGMA_4_Y_LOC }})
                mstore(TABLE_1_X_LOC, {{ TABLE_1_X_LOC }})
                mstore(TABLE_1_Y_LOC, {{ TABLE_1_Y_LOC }})
                mstore(TABLE_2_X_LOC, {{ TABLE_2_X_LOC }})
                mstore(TABLE_2_Y_LOC, {{ TABLE_2_Y_LOC }})
                mstore(TABLE_3_X_LOC, {{ TABLE_3_X_LOC }})
                mstore(TABLE_3_Y_LOC, {{ TABLE_3_Y_LOC }})
                mstore(TABLE_4_X_LOC, {{ TABLE_4_X_LOC }})
                mstore(TABLE_4_Y_LOC, {{ TABLE_4_Y_LOC }})
                mstore(ID_1_X_LOC, {{ ID_1_X_LOC }})
                mstore(ID_1_Y_LOC, {{ ID_1_Y_LOC }})
                mstore(ID_2_X_LOC, {{ ID_2_X_LOC }})
                mstore(ID_2_Y_LOC, {{ ID_2_Y_LOC }})
                mstore(ID_3_X_LOC, {{ ID_3_X_LOC }})
                mstore(ID_3_Y_LOC, {{ ID_3_Y_LOC }})
                mstore(ID_4_X_LOC, {{ ID_4_X_LOC }})
                mstore(ID_4_Y_LOC, {{ ID_4_Y_LOC }})
                mstore(LAGRANGE_FIRST_X_LOC, {{ LAGRANGE_FIRST_X_LOC }})
                mstore(LAGRANGE_FIRST_Y_LOC, {{ LAGRANGE_FIRST_Y_LOC }})
                mstore(LAGRANGE_LAST_X_LOC, {{ LAGRANGE_LAST_X_LOC }})
                mstore(LAGRANGE_LAST_Y_LOC, {{ LAGRANGE_LAST_Y_LOC }})
            }

            // Prime field order - placing on the stack
            let p := P

            {
                let proof_ptr := add(calldataload(0x04), 0x24)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*              VALIDATE INPUT LENGTHS                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Validate proof byte length matches expected size for this circuit's LOG_N.
                // Expected = (8*2 + LOG_N*BATCHED_RELATION_PARTIAL_LENGTH + NUMBER_OF_ENTITIES
                //             + (LOG_N-1)*2 + LOG_N + 2*2 + PAIRING_POINTS_SIZE) * 32
                {
                    let expected_proof_size := mul(
                        add(
                            add(
                                add(16, mul(LOG_N, BATCHED_RELATION_PARTIAL_LENGTH)),
                                add(NUMBER_OF_ENTITIES, mul(sub(LOG_N, 1), 2))
                            ),
                            add(add(LOG_N, 4), PAIRING_POINTS_SIZE)
                        ),
                        32
                    )
                    let proof_length := calldataload(add(calldataload(0x04), 0x04))
                    if iszero(eq(proof_length, expected_proof_size)) {
                        mstore(0x00, PROOF_LENGTH_WRONG_WITH_LOG_N_SELECTOR)
                        mstore(0x04, LOG_N)
                        mstore(0x24, proof_length)
                        mstore(0x44, expected_proof_size)
                        revert(0x00, 0x64)
                    }
                }
                // Validate public inputs array length matches expected count.
                {
                    let pi_count := calldataload(add(calldataload(0x24), 0x04))
                    if iszero(eq(pi_count, REAL_NUMBER_PUBLIC_INPUTS)) {
                        mstore(0x00, PUBLIC_INPUTS_LENGTH_WRONG_SELECTOR)
                        revert(0x00, 0x04)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    GENERATE CHALLENGES                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                /*
                 * Proof points (affine coordinates) in the proof are in the following format, where offset is
                 * the offset in the entire proof until the first bit of the x coordinate
                 * offset + 0x00: x
                 * offset + 0x20: y
                 */

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   GENERATE ETA CHALLENGE                   */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                /* Eta challenge participants
                 * - circuit size
                 * - number of public inputs
                 * - public inputs offset
                 * - w1
                 * - w2
                 * - w3
                 *
                 * Where circuit size, number of public inputs and public inputs offset are all 32 byte values
                 * and w1,w2,w3 are all proof points values
                 */

                mstore(0x00, VK_HASH)

                let public_inputs_start := add(calldataload(0x24), 0x24)
                let public_inputs_size := mul(REAL_NUMBER_PUBLIC_INPUTS, 0x20)

                // Copy the public inputs into the eta buffer
                calldatacopy(0x20, public_inputs_start, public_inputs_size)

                // Copy Pairing points into eta buffer
                let public_inputs_end := add(0x20, public_inputs_size)

                calldatacopy(public_inputs_end, proof_ptr, 0x100)

                // 0x20 * 8 = 0x100 (8 pairing point limbs)
                // End of public inputs + pairing points
                calldatacopy(add(0x120, public_inputs_size), add(proof_ptr, 0x100), 0x100)

                // 0x1e0 = 1 * 32 bytes + 3 * 64 bytes for (w1,w2,w3) + 0x100 for pairing points
                let eta_input_length := add(0x1e0, public_inputs_size)

                // Get single eta challenge and compute powers (eta, eta², eta³)
                let prev_challenge := mod(keccak256(0x00, eta_input_length), p)
                mstore(0x00, prev_challenge)

                let eta := and(prev_challenge, LOWER_127_MASK)
                let eta_two := mulmod(eta, eta, p)
                let eta_three := mulmod(eta_two, eta, p)

                mstore(ETA_CHALLENGE, eta)
                mstore(ETA_TWO_CHALLENGE, eta_two)
                mstore(ETA_THREE_CHALLENGE, eta_three)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                  LOAD PROOF INTO MEMORY                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // As all of our proof points are written in contiguous parts of memory, we call use a single
                // calldatacopy to place all of our proof into the correct memory regions
                // We copy the entire proof into memory as we must hash each proof section for challenge
                // evaluation
                // The last item in the proof, and the first item in the proof (pairing point 0)
                let proof_size := sub(ETA_CHALLENGE, PAIRING_POINT_0_X_0_LOC)

                calldatacopy(PAIRING_POINT_0_X_0_LOC, proof_ptr, proof_size)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*               VALIDATE PROOF INPUTS                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Validate all proof elements are within their expected ranges.
                // Pairing limbs: lo < 2^136, hi < 2^120. G1 coordinates < Q. Fr elements < P.
                {
                    let valid := true
                    let lo_limb_max := shl(136, 1)
                    let hi_limb_max := shl(120, 1)
                    let q_mod := Q

                    // 1. Pairing limbs: lo < 2^136, hi < 2^120 (4 pairs, stride 0x40)
                    let ptr := PAIRING_POINT_0_X_0_LOC
                    for {} lt(ptr, W_L_X_LOC) { ptr := add(ptr, 0x40) } {
                        valid := and(valid, lt(mload(ptr), lo_limb_max))
                        valid := and(valid, lt(mload(add(ptr, 0x20)), hi_limb_max))
                    }
                    if iszero(valid) {
                        mstore(0x00, VALUE_GE_LIMB_MAX_SELECTOR)
                        revert(0x00, 0x04)
                    }

                    // 2. G1 coordinates: each < Q
                    //    - Witness commitments: W_L through Z_PERM (16 slots)
                    for { ptr := W_L_X_LOC } lt(ptr, SUMCHECK_UNIVARIATE_0_0_LOC) { ptr := add(ptr, 0x20) } {
                        valid := and(valid, lt(mload(ptr), q_mod))
                    }
                    //    - Gemini fold commitments (28 slots)
                    for { ptr := GEMINI_FOLD_UNIVARIATE_0_X_LOC } lt(ptr, GEMINI_A_EVAL_0) { ptr := add(ptr, 0x20) } {
                        valid := and(valid, lt(mload(ptr), q_mod))
                    }
                    //    - Shplonk Q + KZG quotient (4 slots)
                    for { ptr := SHPLONK_Q_X_LOC } lt(ptr, ETA_CHALLENGE) { ptr := add(ptr, 0x20) } {
                        valid := and(valid, lt(mload(ptr), q_mod))
                    }
                    if iszero(valid) {
                        mstore(0x00, VALUE_GE_GROUP_ORDER_SELECTOR)
                        revert(0x00, 0x04)
                    }

                    // 2b. G1 points: identity (0,0) is accepted.
                    //     Polynomial commitments to identically-zero polynomials are
                    //     legitimately the identity, and the ecAdd/ecMul precompiles
                    //     treat (0,0) as the additive identity per EIP-196. Soundness
                    //     against (0,0) substitution for a non-zero commitment is upheld
                    //     by sumcheck/Shplemini downstream.

                    // 3. Fr elements: each < P
                    //    - Sumcheck univariates + evaluations (161 slots)
                    for { ptr := SUMCHECK_UNIVARIATE_0_0_LOC } lt(ptr, GEMINI_FOLD_UNIVARIATE_0_X_LOC) {
                        ptr := add(ptr, 0x20)
                    } {
                        valid := and(valid, lt(mload(ptr), p))
                    }
                    //    - Gemini evaluations (15 slots)
                    for { ptr := GEMINI_A_EVAL_0 } lt(ptr, SHPLONK_Q_X_LOC) { ptr := add(ptr, 0x20) } {
                        valid := and(valid, lt(mload(ptr), p))
                    }
                    if iszero(valid) {
                        mstore(0x00, VALUE_GE_FIELD_ORDER_SELECTOR)
                        revert(0x00, 0x04)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*             GENERATE BETA and GAMMA  CHALLENGE            */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                // Generate Beta and Gamma Challenges
                // - prevChallenge
                // - LOOKUP_READ_COUNTS
                // - LOOKUP_READ_TAGS
                // - W4
                mcopy(0x20, LOOKUP_READ_COUNTS_X_LOC, 0xc0)

                prev_challenge := mod(keccak256(0x00, 0xe0), p)
                mstore(0x00, prev_challenge)
                let beta := and(prev_challenge, LOWER_127_MASK)
                let gamma := shr(127, prev_challenge)

                mstore(BETA_CHALLENGE, beta)
                mstore(GAMMA_CHALLENGE, gamma)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                      ALPHA CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Generate Alpha challenges - non-linearise the gate contributions
                //
                // There are 28 total subrelations in this honk relation, we do not need to non linearise the first sub relation.
                // There are 27 total gate contributions, a gate contribution is analogous to
                // a custom gate, it is an expression which must evaluate to zero for each
                // row in the constraint matrix
                //
                // If we do not non-linearise sub relations, then sub relations which rely
                // on the same wire will interact with each other's sums.

                mcopy(0x20, LOOKUP_INVERSES_X_LOC, 0x80)

                prev_challenge := mod(keccak256(0x00, 0xa0), p)
                mstore(0x00, prev_challenge)
                let alpha := and(prev_challenge, LOWER_127_MASK)
                mstore(ALPHA_CHALLENGE_0, alpha)

                // Compute powers of alpha: alpha^2, alpha^3, ..., alpha^26
                let alpha_off_set := ALPHA_CHALLENGE_1
                for {} lt(alpha_off_set, add(ALPHA_CHALLENGE_27, 0x20)) {} {
                    let prev_alpha := mload(sub(alpha_off_set, 0x20))
                    mstore(alpha_off_set, mulmod(prev_alpha, alpha, p))
                    alpha_off_set := add(alpha_off_set, 0x20)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                       GATE CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                // Store the first gate challenge
                prev_challenge := mod(keccak256(0x00, 0x20), p)
                mstore(0x00, prev_challenge)
                let gate_challenge := and(prev_challenge, LOWER_127_MASK)
                mstore(GATE_CHALLENGE_0, gate_challenge)

                let gate_off := GATE_CHALLENGE_1
                for {} lt(gate_off, SUM_U_CHALLENGE_0) {} {
                    let prev := mload(sub(gate_off, 0x20))

                    mstore(gate_off, mulmod(prev, prev, p))
                    gate_off := add(gate_off, 0x20)
                }

                // Sumcheck Univariate challenges
                // The algebraic relations of the Honk protocol are max degree-7.
                // To prove satifiability, we multiply the relation by a random (POW) polynomial. We do this as we want all of our relations
                // to be zero on every row - not for the sum of the relations to be zero. (Which is all sumcheck can do without this modification)
                //
                // As a result, in every round of sumcheck, the prover sends an degree-8 univariate polynomial.
                // The sumcheck univariate challenge produces a challenge for each round of sumcheck, hashing the prev_challenge with
                // a hash of the degree 8 univariate polynomial provided by the prover.
                //
                // 8 points are sent as it is enough to uniquely identify the polynomial
                let read_off := SUMCHECK_UNIVARIATE_0_0_LOC
                let write_off := SUM_U_CHALLENGE_0
                for {} lt(read_off, SIGMA1_EVAL_LOC) {} {
                    // Increase by 20 * batched relation length (8)
                    // 0x20 * 0x8 = 0x100
                    mcopy(0x20, read_off, 0x100)

                    // Hash 0x100 + 0x20 (prev hash) = 0x120
                    prev_challenge := mod(keccak256(0x00, 0x120), p)
                    mstore(0x00, prev_challenge)

                    let sumcheck_u_challenge := and(prev_challenge, LOWER_127_MASK)
                    mstore(write_off, sumcheck_u_challenge)

                    // Progress read / write pointers
                    read_off := add(read_off, 0x100)
                    write_off := add(write_off, 0x20)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                        RHO CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The RHO challenge is the hash of the evaluations of all of the wire values
                // As per usual, it includes the previous challenge
                // Evaluations of the following wires and their shifts (for relevant wires):
                // - QM
                // - QC
                // - Q1 (QL)
                // - Q2 (QR)
                // - Q3 (QO)
                // - Q4
                // - QLOOKUP
                // - QARITH
                // - QRANGE
                // - QELLIPTIC
                // - QMEMORY
                // - QNNF (NNF = Non Native Field)
                // - QPOSEIDON2_EXTERNAL
                // - QPOSEIDON2_INTERNAL
                // - SIGMA1
                // - SIGMA2
                // - SIGMA3
                // - SIGMA4
                // - ID1
                // - ID2
                // - ID3
                // - ID4
                // - TABLE1
                // - TABLE2
                // - TABLE3
                // - TABLE4
                // - W1 (WL)
                // - W2 (WR)
                // - W3 (WO)
                // - W4
                // - Z_PERM
                // - LOOKUP_INVERSES
                // - LOOKUP_READ_COUNTS
                // - LOOKUP_READ_TAGS
                // - W1_SHIFT
                // - W2_SHIFT
                // - W3_SHIFT
                // - W4_SHIFT
                // - Z_PERM_SHIFT
                //
                // Hash of all of the above evaluations
                // Number of bytes to copy = 0x20 * NUMBER_OF_ENTITIES (41) = 0x520
                mcopy(0x20, SIGMA1_EVAL_LOC, 0x520)
                prev_challenge := mod(keccak256(0x00, 0x540), p)
                mstore(0x00, prev_challenge)

                let rho := and(prev_challenge, LOWER_127_MASK)

                mstore(RHO_CHALLENGE, rho)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                      GEMINI R CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The Gemini R challenge contains a of all of commitments to all of the univariates
                // evaluated in the Gemini Protocol
                // So for multivariate polynomials in l variables, we will hash l - 1 commitments.
                // For this implementation, we have logN number of of rounds and thus logN - 1 committments
                // The format of these commitments are proof points, which are explained above
                // 0x40 * (logN - 1)

                mcopy(0x20, GEMINI_FOLD_UNIVARIATE_0_X_LOC, {{ GEMINI_FOLD_UNIVARIATE_LENGTH }})

                prev_challenge := mod(keccak256(0x00, {{ GEMINI_FOLD_UNIVARIATE_HASH_LENGTH }}), p)
                mstore(0x00, prev_challenge)

                let geminiR := and(prev_challenge, LOWER_127_MASK)

                mstore(GEMINI_R_CHALLENGE, geminiR)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK NU CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The shplonk nu challenge hashes the evaluations of the above gemini univariates
                // 0x20 * logN = 0x20 * 15 = 0x1e0

                mcopy(0x20, GEMINI_A_EVAL_0, {{ GEMINI_EVALS_LENGTH }})
                prev_challenge := mod(keccak256(0x00, {{ GEMINI_EVALS_HASH_LENGTH }}), p)
                mstore(0x00, prev_challenge)

                let shplonkNu := and(prev_challenge, LOWER_127_MASK)
                mstore(SHPLONK_NU_CHALLENGE, shplonkNu)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK Z CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Generate Shplonk Z
                // Hash of the single shplonk Q commitment
                mcopy(0x20, SHPLONK_Q_X_LOC, 0x40)
                prev_challenge := mod(keccak256(0x00, 0x60), p)

                let shplonkZ := and(prev_challenge, LOWER_127_MASK)
                mstore(SHPLONK_Z_CHALLENGE, shplonkZ)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                     CHALLENGES COMPLETE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            }

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                     PUBLIC INPUT DELTA                     */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            /**
             * Generate public inputs delta
             *
             * The public inputs delta leverages plonk's copy constraints in order to
             * evaluate public inputs.
             *
             * For each row of the execution trace, the prover will calculate the following value
             * There are 4 witness wires, 4 id wires and 4 sigma wires in this instantiation of the proof system
             * So there will be 4 groups of wires (w_i, id_i and sigma_i)
             *
             *   (w_0 + β(id_0) + γ) * ∏(w_1 + β(id_1) + γ) * ∏(w_2 + β(id_2) + γ) * ∏(w_3 + β(id_3) + γ)
             * ∏------------------------------------------------------------------------------------------ * public_inputs_delta
             *   (w_0 + β(σ_0) + γ) * ∏(w_1 + β(σ_1) + γ) * ∏(w_2 + β(σ_2) + γ) * ∏(w_3 + β(σ_3) + γ)
             *
             * The above product is accumulated for all rows in the trace.
             *
             * The above equation enforces that for each cell in the trace, if the id and sigma pair are equal, then the
             * witness value in that cell is equal.
             *
             * We extra terms to add to this product that correspond to public input values.
             *
             * The values of id_i and σ_i polynomials are related to a generalized PLONK permutation argument, in the original paper, there
             * were no id_i polynomials.
             *
             * These are required under the multilinear setting as we cannot use cosets of the roots of unity to represent unique sets, rather
             * we just use polynomials that include unique values. In implementation, id_0 can be {0 .. n} and id_1 can be {n .. 2n} and so forth.
             *
             */
            {
                let beta := mload(BETA_CHALLENGE)
                let gamma := mload(GAMMA_CHALLENGE)
                let pub_off := PUBLIC_INPUTS_OFFSET

                let numerator_value := 1
                let denominator_value := 1

                let p_clone := p // move p to the front of the stack

                // Assume offset is less than p
                // numerator_acc = gamma + (beta * (PERMUTATION_ARGUMENT_VALUE_SEPARATOR + offset))
                let numerator_acc :=
                    addmod(gamma, mulmod(beta, add(PERMUTATION_ARGUMENT_VALUE_SEPARATOR, pub_off), p_clone), p_clone)
                // denominator_acc = gamma - (beta * (offset + 1))
                let beta_x_off := mulmod(beta, add(pub_off, 1), p_clone)
                let denominator_acc := addmod(gamma, sub(p_clone, beta_x_off), p_clone)

                let valid_inputs := true
                // Load the starting point of the public inputs (jump over the selector and the length of public inputs [0x24])
                let public_inputs_ptr := add(calldataload(0x24), 0x24)

                // endpoint_ptr = public_inputs_ptr + num_inputs * 0x20. // every public input is 0x20 bytes
                let endpoint_ptr := add(public_inputs_ptr, mul(REAL_NUMBER_PUBLIC_INPUTS, 0x20))

                for {} lt(public_inputs_ptr, endpoint_ptr) { public_inputs_ptr := add(public_inputs_ptr, 0x20) } {
                    // Get public inputs from calldata
                    let input := calldataload(public_inputs_ptr)

                    valid_inputs := and(valid_inputs, lt(input, p_clone))

                    numerator_value := mulmod(numerator_value, addmod(numerator_acc, input, p_clone), p_clone)
                    denominator_value := mulmod(denominator_value, addmod(denominator_acc, input, p_clone), p_clone)

                    numerator_acc := addmod(numerator_acc, beta, p_clone)
                    denominator_acc := addmod(denominator_acc, sub(p_clone, beta), p_clone)
                }

                // Revert if not all public inputs are field elements (i.e. < p)
                if iszero(valid_inputs) {
                    mstore(0x00, VALUE_GE_FIELD_ORDER_SELECTOR)
                    revert(0x00, 0x04)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*           PUBLIC INPUT DELTA - Pairing points accum        */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Pairing points contribution to public inputs delta
                let pairing_points_ptr := PAIRING_POINT_0_X_0_LOC
                for {} lt(pairing_points_ptr, W_L_X_LOC) { pairing_points_ptr := add(pairing_points_ptr, 0x20) } {
                    let input := mload(pairing_points_ptr)

                    numerator_value := mulmod(numerator_value, addmod(numerator_acc, input, p_clone), p_clone)
                    denominator_value := mulmod(denominator_value, addmod(denominator_acc, input, p_clone), p_clone)

                    numerator_acc := addmod(numerator_acc, beta, p_clone)
                    denominator_acc := addmod(denominator_acc, sub(p_clone, beta), p_clone)
                }

                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE, numerator_value)
                mstore(PUBLIC_INPUTS_DELTA_DENOMINATOR_CHALLENGE, denominator_value)

                // PI delta denominator inversion is deferred to the barycentric
                // batch inversion below.
            }
            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*             PUBLIC INPUT DELTA - complete                  */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                        SUMCHECK                            */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            //
            // Sumcheck is used to prove that every relation 0 on each row of the witness.
            //
            // Given each of the columns of our trace is a multilinear polynomial 𝑃1,…,𝑃𝑁∈𝔽[𝑋0,…,𝑋𝑑−1]. We run sumcheck over the polynomial
            //
            //                         𝐹̃ (𝑋0,…,𝑋𝑑−1)=𝑝𝑜𝑤𝛽(𝑋0,…,𝑋𝑑−1)⋅𝐹(𝑃1(𝑋0,…,𝑋𝑑−1),…,𝑃𝑁(𝑋0,…,𝑋𝑑−1))
            //
            // The Pow polynomial is a random polynomial that allows us to ceritify that the relations sum to 0 on each row of the witness,
            // rather than the entire sum just targeting 0.
            //
            // Each polynomial P in our implementation are the polys in the proof and the verification key. (W_1, W_2, W_3, W_4, Z_PERM, etc....)
            //
            // We start with a LOG_N variate multilinear polynomial, each round fixes a variable to a challenge value.
            // Each round the prover sends a round univariate poly, since the degree of our honk relations is 7 + the pow polynomial the prover
            // sends a degree-8 univariate on each round.
            // This is sent efficiently by sending 8 values, enough to represent a unique polynomial.
            // Barycentric evaluation is used to evaluate the polynomial at any point on the domain, given these 8 unique points.
            //
            // In the sumcheck protocol, the target sum for each round is the sum of the round univariate evaluated on 0 and 1.
            //                                               𝜎𝑖=?𝑆̃ 𝑖(0)+𝑆̃ 𝑖(1)
            // This is efficiently checked as S(0) and S(1) are sent by the prover as values of the round univariate.
            //
            // We compute the next challenge by evaluating the round univariate at a random challenge value.
            //                                                  𝜎𝑖+1←𝑆̃ 𝑖(𝑢𝑖)
            // This evaluation is performed via barycentric evaluation.
            //
            // Once we have reduced the multilinear polynomials into single dimensional polys, we check the entire sumcheck relation matches the target sum.
            //
            // Below this is composed of 8 relations:
            // 1. Arithmetic relation - constrains arithmetic
            // 2. Permutaiton Relation - efficiently encodes copy constraints
            // 3. Log Derivative Lookup Relation - used for lookup operations
            // 4. Delta Range Relation - used for efficient range checks
            // 5. Memory Relation - used for efficient memory operations
            // 6. NNF Relation - used for efficient Non Native Field operations
            // 7. Poseidon2 External Relation - used for efficient in-circuit hashing
            // 8. Poseidon2 Internal Relation - used for efficient in-circuit hashing
            //
            // These are batched together and evaluated at the same time using the alpha challenges.
            //
            {
                // We write the barycentric domain values into memory
                // These are written once per program execution, and reused across all
                // sumcheck rounds
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_0)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_1_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_1)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_2_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_2)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_3_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_3)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_4_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_4)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_5_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_5)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_6_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_6)
                mstore(BARYCENTRIC_LAGRANGE_DENOMINATOR_7_LOC, BARYCENTRIC_LAGRANGE_DENOMINATOR_7)

                // Compute the target sums for each round of sumcheck
                {
                    // This requires the barycentric inverses to be computed for each round
                    // Write all of the non inverted barycentric denominators into memory
                    let accumulator := 1
                    let temp := FOLD_POS_EVALUATIONS_{{ LOG_N_MINUS_ONE }}_LOC // we use fold pos evaluations as we add 0x20 immediately to get to `BARYCENTRIC_TEMP_0_LOC`
                    let bary_centric_inverses_off := BARYCENTRIC_DENOMINATOR_INVERSES_0_0_LOC
                    {
                        let round_challenge_off := SUM_U_CHALLENGE_0
                        for { let round := 0 } lt(round, LOG_N) { round := add(round, 1) } {
                            let round_challenge := mload(round_challenge_off)
                            let bary_lagrange_denominator_off := BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC

                            // Unrolled as this loop as it only has 8 iterations - somehow this saves >10k gas
                            {
                                let bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                let pre_inv :=
                                    mulmod(
                                        bary_lagrange_denominator,
                                        addmod(round_challenge, p, p), // sub(p, 0) = p
                                        p
                                    )
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 1
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 1), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 2
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 2), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 3
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 3), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 4
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 4), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 5
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 5), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 6
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 6), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 7
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, sub(p, 7), p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)
                            }
                            round_challenge_off := add(round_challenge_off, 0x20)
                        }
                    }

                    // Append PI delta denominator to the batch inversion
                    {
                        let pi_denom := mload(PUBLIC_INPUTS_DELTA_DENOMINATOR_CHALLENGE)
                        mstore(PUBLIC_INPUTS_DENOM_TEMP_LOC, accumulator)
                        accumulator := mulmod(accumulator, pi_denom, p)
                    }

                    // --- Phase 2: Shplemini forward pass ---
                    // Compute shplemini denominators and accumulate into the running product.
                    // Pre-inversion values stored in shplemini runtime memory
                    {
                        // Compute powers of evaluation challenge: gemini_r^{2^i}
                        let cache := mload(GEMINI_R_CHALLENGE)
                        mstore(POWERS_OF_EVALUATION_CHALLENGE_0_LOC, cache)
                        /// {{ UNROLL_SECTION_START POWERS_OF_EVALUATION_COMPUTATION }}
                        /// {{ UNROLL_SECTION_END POWERS_OF_EVALUATION_COMPUTATION }}

                        // Element 0: gemini_r (seed)
                        {
                            let val := mload(GEMINI_R_CHALLENGE)
                            mstore(GEMINI_R_INV_TEMP_LOC, accumulator)
                            accumulator := mulmod(accumulator, val, p)
                        }

                        // Elements 1..LOG_N: INVERTED_CHALLENGE_POW_MINUS_U
                        /// {{ UNROLL_SECTION_START ACCUMULATE_INVERSES }}
                    /// {{ UNROLL_SECTION_END ACCUMULATE_INVERSES }}

                    // Invert all elements (barycentric + PI delta + shplemini) as a single batch
                    {
                        {
                            mstore(0, 0x20)
                            mstore(0x20, 0x20)
                            mstore(0x40, 0x20)
                            mstore(0x60, accumulator)
                            mstore(0x80, P_SUB_2)
                            mstore(0xa0, p)
                            if iszero(staticcall(gas(), 0x05, 0x00, 0xc0, 0x00, 0x20)) {
                                mstore(0x00, MODEXP_FAILED_SELECTOR)
                                revert(0x00, 0x04)
                            }

                            accumulator := mload(0x00)
                            if iszero(accumulator) {
                                mstore(0x00, MODEXP_FAILED_SELECTOR)
                                revert(0x00, 0x04)
                            }
                        }

                        // --- Shplemini backward pass ---
                        // Extract shplemini inverses in strict reverse order.
                        /// {{ UNROLL_SECTION_START COLLECT_INVERSES }}
                            /// {{ UNROLL_SECTION_END COLLECT_INVERSES }}

                            // gemini_r inverse (staging[0])
                            {
                                let tmp := mulmod(accumulator, mload(GEMINI_R_INV_TEMP_LOC), p)
                                accumulator := mulmod(accumulator, mload(GEMINI_R_CHALLENGE), p)
                                mstore(GEMINI_R_INV_LOC, tmp) // 1/gemini_r at staging[0]
                            }
                        }

                        // Extract PI delta denominator inverse from the batch
                        {
                            let pi_delta_inv := mulmod(accumulator, mload(PUBLIC_INPUTS_DENOM_TEMP_LOC), p)
                            accumulator := mulmod(accumulator, mload(PUBLIC_INPUTS_DELTA_DENOMINATOR_CHALLENGE), p)

                            // Finalize: public_inputs_delta = numerator * (1/denominator)
                            mstore(
                                PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE,
                                mulmod(mload(PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE), pi_delta_inv, p)
                            )
                        }

                        // Normalise as last loop will have incremented the offset
                        bary_centric_inverses_off := sub(bary_centric_inverses_off, 0x20)
                        for {} gt(bary_centric_inverses_off, BARYCENTRIC_LAGRANGE_DENOMINATOR_7_LOC) {
                            bary_centric_inverses_off := sub(bary_centric_inverses_off, 0x20)
                        } {
                            let tmp := mulmod(accumulator, mload(temp), p)
                            accumulator := mulmod(accumulator, mload(bary_centric_inverses_off), p)
                            mstore(bary_centric_inverses_off, tmp)

                            temp := sub(temp, 0x20)
                        }
                    }
                }

                let valid := true
                let round_target := 0
                let pow_partial_evaluation := 1
                let gate_challenge_off := GATE_CHALLENGE_0
                let round_univariates_off := SUMCHECK_UNIVARIATE_0_0_LOC

                let challenge_off := SUM_U_CHALLENGE_0
                let bary_inverses_off := BARYCENTRIC_DENOMINATOR_INVERSES_0_0_LOC

                for { let round := 0 } lt(round, LOG_N) { round := add(round, 1) } {
                    let round_challenge := mload(challenge_off)

                    // Total sum = u[0] + u[1]
                    let total_sum := addmod(mload(round_univariates_off), mload(add(round_univariates_off, 0x20)), p)
                    valid := and(valid, eq(total_sum, round_target))

                    // Compute next target sum
                    let numerator_value := round_challenge
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 1), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 2), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 3), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 4), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 5), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 6), p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p, 7), p), p)

                    // // Compute the next round target
                    round_target := 0
                    for { let i := 0 } lt(i, BATCHED_RELATION_PARTIAL_LENGTH) { i := add(i, 1) } {
                        let term := mload(round_univariates_off)
                        let inverse := mload(bary_inverses_off)

                        term := mulmod(term, inverse, p)
                        round_target := addmod(round_target, term, p)
                        round_univariates_off := add(round_univariates_off, 0x20)
                        bary_inverses_off := add(bary_inverses_off, 0x20)
                    }

                    round_target := mulmod(round_target, numerator_value, p)

                    // Partially evaluate POW
                    let gate_challenge := mload(gate_challenge_off)
                    let gate_challenge_minus_one := addmod(gate_challenge, sub(p, 1), p)

                    let univariate_evaluation := addmod(1, mulmod(round_challenge, gate_challenge_minus_one, p), p)

                    pow_partial_evaluation := mulmod(pow_partial_evaluation, univariate_evaluation, p)

                    gate_challenge_off := add(gate_challenge_off, 0x20)
                    challenge_off := add(challenge_off, 0x20)
                }

                if iszero(valid) {
                    mstore(0x00, SUMCHECK_FAILED_SELECTOR)
                    revert(0x00, 0x04)
                }

                // The final sumcheck round; accumulating evaluations
                // Uses pow partial evaluation as the gate scaling factor

                mstore(POW_PARTIAL_EVALUATION_LOC, pow_partial_evaluation)
                mstore(FINAL_ROUND_TARGET_LOC, round_target)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    ARITHMETIC RELATION                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    /**
                     * The basic arithmetic gate identity in standard plonk is as follows.
                     * (w_1 . w_2 . q_m) + (w_1 . q_1) + (w_2 . q_2) + (w_3 . q_3) + (w_4 . q_4) + q_c = 0
                     * However, for Ultraplonk, we extend this to support "passing" wires between rows (shown without alpha scaling below):
                     * q_arith * ( ( (-1/2) * (q_arith - 3) * q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c ) +
                     * (q_arith - 1)*( α * (q_arith - 2) * (w_1 + w_4 - w_1_omega + q_m) + w_4_omega) ) = 0
                     *
                     * This formula results in several cases depending on q_arith:
                     * 1. q_arith == 0: Arithmetic gate is completely disabled
                     *
                     * 2. q_arith == 1: Everything in the minigate on the right is disabled. The equation is just a standard plonk equation
                     * with extra wires: q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c = 0
                     *
                     * 3. q_arith == 2: The (w_1 + w_4 - ...) term is disabled. THe equation is:
                     * (1/2) * q_m * w_1 * w_2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + w_4_omega = 0
                     * It allows defining w_4 at next index (w_4_omega) in terms of current wire values
                     *
                     * 4. q_arith == 3: The product of w_1 and w_2 is disabled, but a mini addition gate is enabled. α allows us to split
                     * the equation into two:
                     *
                     * q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + 2 * w_4_omega = 0
                     * and
                     * w_1 + w_4 - w_1_omega + q_m = 0  (we are reusing q_m here)
                     *
                     * 5. q_arith > 3: The product of w_1 and w_2 is scaled by (q_arith - 3), while the w_4_omega term is scaled by (q_arith - 1).
                     * The equation can be split into two:
                     *
                     * (q_arith - 3)* q_m * w_1 * w_ 2 + q_1 * w_1 + q_2 * w_2 + q_3 * w_3 + q_4 * w_4 + q_c + (q_arith - 1) * w_4_omega = 0
                     * and
                     * w_1 + w_4 - w_1_omega + q_m = 0
                     *
                     * The problem that q_m is used both in both equations can be dealt with by appropriately changing selector values at
                     * the next gate. Then we can treat (q_arith - 1) as a simulated q_6 selector and scale q_m to handle (q_arith - 3) at
                     * product.
                     */
                    let w1q1 := mulmod(mload(W1_EVAL_LOC), mload(QL_EVAL_LOC), p)
                    let w2q2 := mulmod(mload(W2_EVAL_LOC), mload(QR_EVAL_LOC), p)
                    let w3q3 := mulmod(mload(W3_EVAL_LOC), mload(QO_EVAL_LOC), p)
                    let w4q3 := mulmod(mload(W4_EVAL_LOC), mload(Q4_EVAL_LOC), p)

                    let q_arith := mload(QARITH_EVAL_LOC)
                    // w1w2qm := (w_1 . w_2 . q_m . (QARITH_EVAL_LOC - 3)) / 2
                    let w1w2qm :=
                        mulmod(
                            mulmod(
                                mulmod(mulmod(mload(W1_EVAL_LOC), mload(W2_EVAL_LOC), p), mload(QM_EVAL_LOC), p),
                                addmod(q_arith, sub(p, 3), p),
                                p
                            ),
                            NEG_HALF_MODULO_P,
                            p
                        )

                    // (w_1 . w_2 . q_m . (q_arith - 3)) / -2) + (w_1 . q_1) + (w_2 . q_2) + (w_3 . q_3) + (w_4 . q_4) + q_c
                    let identity :=
                        addmod(
                            mload(QC_EVAL_LOC),
                            addmod(w4q3, addmod(w3q3, addmod(w2q2, addmod(w1q1, w1w2qm, p), p), p), p),
                            p
                        )

                    // if q_arith == 3 we evaluate an additional mini addition gate (on top of the regular one), where:
                    // w_1 + w_4 - w_1_omega + q_m = 0
                    // we use this gate to save an addition gate when adding or subtracting non-native field elements
                    // α * (q_arith - 2) * (w_1 + w_4 - w_1_omega + q_m)
                    let extra_small_addition_gate_identity :=
                        mulmod(
                            addmod(q_arith, sub(p, 2), p),
                            addmod(
                                mload(QM_EVAL_LOC),
                                addmod(
                                    sub(p, mload(W1_SHIFT_EVAL_LOC)),
                                    addmod(mload(W1_EVAL_LOC), mload(W4_EVAL_LOC), p),
                                    p
                                ),
                                p
                            ),
                            p
                        )

                    // Split up the two relations
                    let contribution_0 :=
                        addmod(identity, mulmod(addmod(q_arith, sub(p, 1), p), mload(W4_SHIFT_EVAL_LOC), p), p)
                    contribution_0 := mulmod(mulmod(contribution_0, q_arith, p), mload(POW_PARTIAL_EVALUATION_LOC), p)
                    mstore(SUBRELATION_EVAL_6_LOC, contribution_0)

                    let contribution_1 := mulmod(extra_small_addition_gate_identity, addmod(q_arith, sub(p, 1), p), p)
                    contribution_1 := mulmod(contribution_1, q_arith, p)
                    contribution_1 := mulmod(contribution_1, mload(POW_PARTIAL_EVALUATION_LOC), p)
                    mstore(SUBRELATION_EVAL_7_LOC, contribution_1)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   PERMUTATION RELATION                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    let beta := mload(BETA_CHALLENGE)
                    let gamma := mload(GAMMA_CHALLENGE)

                    /**
                     * t1 = (W1 + gamma + beta * ID1) * (W2 + gamma + beta * ID2)
                     * t2 = (W3 + gamma + beta * ID3) * (W4 + gamma + beta * ID4)
                     * gp_numerator = t1 * t2
                     * t1 = (W1 + gamma + beta * sigma_1_eval) * (W2 + gamma + beta * sigma_2_eval)
                     * t2 = (W3 + gamma + beta * sigma_3_eval) * (W4 + gamma + beta * sigma_4_eval)
                     * gp_denominator = t1 * t2
                     */
                    let t1 :=
                        mulmod(
                            add(add(mload(W1_EVAL_LOC), gamma), mulmod(beta, mload(ID1_EVAL_LOC), p)),
                            add(add(mload(W2_EVAL_LOC), gamma), mulmod(beta, mload(ID2_EVAL_LOC), p)),
                            p
                        )
                    let t2 :=
                        mulmod(
                            add(add(mload(W3_EVAL_LOC), gamma), mulmod(beta, mload(ID3_EVAL_LOC), p)),
                            add(add(mload(W4_EVAL_LOC), gamma), mulmod(beta, mload(ID4_EVAL_LOC), p)),
                            p
                        )
                    let numerator := mulmod(t1, t2, p)
                    t1 := mulmod(
                        add(add(mload(W1_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA1_EVAL_LOC), p)),
                        add(add(mload(W2_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA2_EVAL_LOC), p)),
                        p
                    )
                    t2 := mulmod(
                        add(add(mload(W3_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA3_EVAL_LOC), p)),
                        add(add(mload(W4_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA4_EVAL_LOC), p)),
                        p
                    )
                    let denominator := mulmod(t1, t2, p)

                    {
                        let acc :=
                            mulmod(addmod(mload(Z_PERM_EVAL_LOC), mload(LAGRANGE_FIRST_EVAL_LOC), p), numerator, p)

                        acc := addmod(
                            acc,
                            sub(
                                p,
                                mulmod(
                                    addmod(
                                        mload(Z_PERM_SHIFT_EVAL_LOC),
                                        mulmod(
                                            mload(LAGRANGE_LAST_EVAL_LOC),
                                            mload(PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE),
                                            p
                                        ),
                                        p
                                    ),
                                    denominator,
                                    p
                                )
                            ),
                            p
                        )

                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_0_LOC, acc)

                        acc := mulmod(
                            mulmod(mload(LAGRANGE_LAST_EVAL_LOC), mload(Z_PERM_SHIFT_EVAL_LOC), p),
                            mload(POW_PARTIAL_EVALUATION_LOC),
                            p
                        )
                        mstore(SUBRELATION_EVAL_1_LOC, acc)
                    }

                    // Contribution 4: z_perm initialization (lagrange_first * z_perm = 0)
                    {
                        let acc := mulmod(
                            mulmod(mload(LAGRANGE_FIRST_EVAL_LOC), mload(Z_PERM_EVAL_LOC), p),
                            mload(POW_PARTIAL_EVALUATION_LOC),
                            p
                        )
                        mstore(SUBRELATION_EVAL_2_LOC, acc)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   LOGUP WIDGET EVALUATION                  */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Note: Using beta powers for column batching and gamma for offset ensures soundness
                // beta and gamma must be independent challenges (they come from splitting the same hash)
                {
                    let gamma := mload(GAMMA_CHALLENGE)
                    let beta := mload(BETA_CHALLENGE)
                    // Compute beta powers inline (β², β³) for lookup column batching
                    let beta_sqr := mulmod(beta, beta, p)
                    let beta_cube := mulmod(beta_sqr, beta, p)

                    // table_term = table_1 + γ + table_2 * β + table_3 * β² + table_4 * β³
                    let t0 :=
                        addmod(addmod(mload(TABLE1_EVAL_LOC), gamma, p), mulmod(mload(TABLE2_EVAL_LOC), beta, p), p)
                    let t1 :=
                        addmod(
                            mulmod(mload(TABLE3_EVAL_LOC), beta_sqr, p),
                            mulmod(mload(TABLE4_EVAL_LOC), beta_cube, p),
                            p
                        )
                    let table_term := addmod(t0, t1, p)

                    // lookup_term = derived_entry_1 + γ + derived_entry_2 * β + derived_entry_3 * β² + q_index * β³
                    t0 := addmod(
                        addmod(mload(W1_EVAL_LOC), gamma, p),
                        mulmod(mload(QR_EVAL_LOC), mload(W1_SHIFT_EVAL_LOC), p),
                        p
                    )
                    t1 := addmod(mload(W2_EVAL_LOC), mulmod(mload(QM_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p), p)
                    let t2 := addmod(mload(W3_EVAL_LOC), mulmod(mload(QC_EVAL_LOC), mload(W3_SHIFT_EVAL_LOC), p), p)

                    let lookup_term := addmod(t0, mulmod(t1, beta, p), p)
                    lookup_term := addmod(lookup_term, mulmod(t2, beta_sqr, p), p)
                    lookup_term := addmod(lookup_term, mulmod(mload(QO_EVAL_LOC), beta_cube, p), p)

                    let lookup_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), table_term, p)
                    let table_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), lookup_term, p)

                    let inverse_exists_xor := addmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)
                    inverse_exists_xor := addmod(
                        inverse_exists_xor,
                        sub(p, mulmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)),
                        p
                    )

                    let accumulator_none := mulmod(mulmod(lookup_term, table_term, p), mload(LOOKUP_INVERSES_EVAL_LOC), p)
                    accumulator_none := addmod(accumulator_none, sub(p, inverse_exists_xor), p)
                    accumulator_none := mulmod(accumulator_none, mload(POW_PARTIAL_EVALUATION_LOC), p)

                    let accumulator_one := mulmod(mload(QLOOKUP_EVAL_LOC), lookup_inverse, p)
                    accumulator_one := addmod(
                        accumulator_one,
                        sub(p, mulmod(mload(LOOKUP_READ_COUNTS_EVAL_LOC), table_inverse, p)),
                        p
                    )

                    let read_tag := mload(LOOKUP_READ_TAGS_EVAL_LOC)
                    let read_tag_boolean_relation := mulmod(read_tag, addmod(read_tag, sub(p, 1), p), p)
                    read_tag_boolean_relation := mulmod(read_tag_boolean_relation, mload(POW_PARTIAL_EVALUATION_LOC), p)

                    mstore(SUBRELATION_EVAL_3_LOC, accumulator_none)
                    mstore(SUBRELATION_EVAL_4_LOC, accumulator_one)
                    mstore(SUBRELATION_EVAL_5_LOC, read_tag_boolean_relation)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   DELTA RANGE RELATION                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    let minus_one := P_SUB_1
                    let minus_two := P_SUB_2
                    let minus_three := P_SUB_3

                    let delta_1 := addmod(mload(W2_EVAL_LOC), sub(p, mload(W1_EVAL_LOC)), p)
                    let delta_2 := addmod(mload(W3_EVAL_LOC), sub(p, mload(W2_EVAL_LOC)), p)
                    let delta_3 := addmod(mload(W4_EVAL_LOC), sub(p, mload(W3_EVAL_LOC)), p)
                    let delta_4 := addmod(mload(W1_SHIFT_EVAL_LOC), sub(p, mload(W4_EVAL_LOC)), p)

                    {
                        let acc := delta_1
                        acc := mulmod(acc, addmod(delta_1, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_1, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_1, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_8_LOC, acc)
                    }

                    {
                        let acc := delta_2
                        acc := mulmod(acc, addmod(delta_2, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_9_LOC, acc)
                    }

                    {
                        let acc := delta_3
                        acc := mulmod(acc, addmod(delta_3, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_10_LOC, acc)
                    }

                    {
                        let acc := delta_4
                        acc := mulmod(acc, addmod(delta_4, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_11_LOC, acc)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    ELLIPTIC CURVE RELATION                 */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    // Contribution 10 point addition, x-coordinate check
                    // q_elliptic * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
                    let x_diff := addmod(mload(EC_X_2), sub(p, mload(EC_X_1)), p)
                    let y1_sqr := mulmod(mload(EC_Y_1), mload(EC_Y_1), p)
                    {
                        let y2_sqr := mulmod(mload(EC_Y_2), mload(EC_Y_2), p)
                        let y1y2 := mulmod(mulmod(mload(EC_Y_1), mload(EC_Y_2), p), mload(EC_Q_SIGN), p)
                        let x_add_identity := addmod(mload(EC_X_3), addmod(mload(EC_X_2), mload(EC_X_1), p), p)
                        x_add_identity := mulmod(mulmod(x_add_identity, x_diff, p), x_diff, p)
                        x_add_identity := addmod(x_add_identity, sub(p, y2_sqr), p)
                        x_add_identity := addmod(x_add_identity, sub(p, y1_sqr), p)
                        x_add_identity := addmod(x_add_identity, y1y2, p)
                        x_add_identity := addmod(x_add_identity, y1y2, p)

                        let eval := mulmod(x_add_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        eval := mulmod(eval, mload(QELLIPTIC_EVAL_LOC), p)
                        eval := mulmod(eval, addmod(1, sub(p, mload(EC_Q_IS_DOUBLE)), p), p)
                        mstore(SUBRELATION_EVAL_12_LOC, eval)
                    }

                    {
                        let y1_plus_y3 := addmod(mload(EC_Y_1), mload(EC_Y_3), p)
                        let y_diff := mulmod(mload(EC_Y_2), mload(EC_Q_SIGN), p)
                        y_diff := addmod(y_diff, sub(p, mload(EC_Y_1)), p)
                        let y_add_identity := mulmod(y1_plus_y3, x_diff, p)
                        y_add_identity := addmod(
                            y_add_identity,
                            mulmod(addmod(mload(EC_X_3), sub(p, mload(EC_X_1)), p), y_diff, p),
                            p
                        )

                        let eval := mulmod(y_add_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        eval := mulmod(eval, mload(QELLIPTIC_EVAL_LOC), p)
                        eval := mulmod(eval, addmod(1, sub(p, mload(EC_Q_IS_DOUBLE)), p), p)
                        mstore(SUBRELATION_EVAL_13_LOC, eval)
                    }

                    {
                        let x_pow_4 := mulmod(addmod(y1_sqr, GRUMPKIN_CURVE_B_PARAMETER_NEGATED, p), mload(EC_X_1), p)
                        let y1_sqr_mul_4 := addmod(y1_sqr, y1_sqr, p)
                        y1_sqr_mul_4 := addmod(y1_sqr_mul_4, y1_sqr_mul_4, p)

                        let x1_pow_4_mul_9 := mulmod(x_pow_4, 9, p)

                        let ep_x_double_identity := addmod(mload(EC_X_3), addmod(mload(EC_X_1), mload(EC_X_1), p), p)
                        ep_x_double_identity := mulmod(ep_x_double_identity, y1_sqr_mul_4, p)
                        ep_x_double_identity := addmod(ep_x_double_identity, sub(p, x1_pow_4_mul_9), p)

                        let acc := mulmod(ep_x_double_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        acc := mulmod(mulmod(acc, mload(QELLIPTIC_EVAL_LOC), p), mload(EC_Q_IS_DOUBLE), p)
                        acc := addmod(acc, mload(SUBRELATION_EVAL_12_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_12_LOC, acc)
                    }

                    {
                        let x1_sqr_mul_3 :=
                            mulmod(addmod(addmod(mload(EC_X_1), mload(EC_X_1), p), mload(EC_X_1), p), mload(EC_X_1), p)
                        let y_double_identity :=
                            mulmod(x1_sqr_mul_3, addmod(mload(EC_X_1), sub(p, mload(EC_X_3)), p), p)
                        y_double_identity := addmod(
                            y_double_identity,
                            sub(
                                p,
                                mulmod(
                                    addmod(mload(EC_Y_1), mload(EC_Y_1), p),
                                    addmod(mload(EC_Y_1), mload(EC_Y_3), p),
                                    p
                                )
                            ),
                            p
                        )

                        let acc := mulmod(y_double_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        acc := mulmod(mulmod(acc, mload(QELLIPTIC_EVAL_LOC), p), mload(EC_Q_IS_DOUBLE), p)
                        acc := addmod(acc, mload(SUBRELATION_EVAL_13_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_13_LOC, acc)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    MEMORY RELATION                         */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    {
                        /**
                         * MEMORY
                         *
                         * A RAM memory record contains a tuple of the following fields:
                         *  * i: `index` of memory cell being accessed
                         *  * t: `timestamp` of memory cell being accessed (used for RAM, set to 0 for ROM)
                         *  * v: `value` of memory cell being accessed
                         *  * a: `access` type of record. read: 0 = read, 1 = write
                         *  * r: `record` of memory cell. record = access + index * eta + timestamp * eta_two + value * eta_three
                         *
                         * A ROM memory record contains a tuple of the following fields:
                         *  * i: `index` of memory cell being accessed
                         *  * v: `value1` of memory cell being accessed (ROM tables can store up to 2 values per index)
                         *  * v2:`value2` of memory cell being accessed (ROM tables can store up to 2 values per index)
                         *  * r: `record` of memory cell. record = index * eta + value2 * eta_two + value1 * eta_three
                         *
                         *  When performing a read/write access, the values of i, t, v, v2, a, r are stored in the following wires +
                         * selectors, depending on whether the gate is a RAM read/write or a ROM read
                         *
                         *  | gate type | i  | v2/t  |  v | a  | r  |
                         *  | --------- | -- | ----- | -- | -- | -- |
                         *  | ROM       | w1 | w2    | w3 | -- | w4 |
                         *  | RAM       | w1 | w2    | w3 | qc | w4 |
                         *
                         * (for accesses where `index` is a circuit constant, it is assumed the circuit will apply a copy constraint on
                         * `w2` to fix its value)
                         *
                         *
                         */

                        /**
                         * Memory Record Check
                         * Partial degree: 1
                         * Total degree: 4
                         *
                         * A ROM/ROM access gate can be evaluated with the identity:
                         *
                         * qc + w1 \eta + w2 \eta_two + w3 \eta_three - w4 = 0
                         *
                         * For ROM gates, qc = 0
                         */
                        /**
                         * memory_record_check = w_3 * eta_three;
                         * memory_record_check += w_2 * eta_two;
                         * memory_record_check += w_1 * eta;
                         * memory_record_check += q_c;
                         *
                         * partial_record_check = memory_record_check;
                         *
                         * memory_record_check -= w_4;
                         */
                        let memory_record_check := mulmod(mload(W3_EVAL_LOC), mload(ETA_THREE_CHALLENGE), p)
                        memory_record_check := addmod(
                            memory_record_check,
                            mulmod(mload(W2_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p),
                            p
                        )
                        memory_record_check := addmod(
                            memory_record_check,
                            mulmod(mload(W1_EVAL_LOC), mload(ETA_CHALLENGE), p),
                            p
                        )
                        memory_record_check := addmod(memory_record_check, mload(QC_EVAL_LOC), p)

                        let partial_record_check := memory_record_check
                        memory_record_check := addmod(memory_record_check, sub(p, mload(W4_EVAL_LOC)), p)

                        mstore(AUX_MEMORY_CHECK_IDENTITY, memory_record_check)

                        /**
                         * ROM Consistency Check
                         * Partial degree: 1
                         * Total degree: 4
                         *
                         * For every ROM read, a set equivalence check is applied between the record witnesses, and a second set of
                         * records that are sorted.
                         *
                         * We apply the following checks for the sorted records:
                         *
                         * 1. w1, w2, w3 correctly map to 'index', 'v1, 'v2' for a given record value at w4
                         * 2. index values for adjacent records are monotonically increasing
                         * 3. if, at gate i, index_i == index_{i + 1}, then value1_i == value1_{i + 1} and value2_i == value2_{i + 1}
                         *
                         */
                        // index_delta = w_1_omega - w_1
                        let index_delta := addmod(mload(W1_SHIFT_EVAL_LOC), sub(p, mload(W1_EVAL_LOC)), p)

                        // record_delta = w_4_omega - w_4
                        let record_delta := addmod(mload(W4_SHIFT_EVAL_LOC), sub(p, mload(W4_EVAL_LOC)), p)

                        // index_is_monotonically_increasing = index_delta * (index_delta - 1)
                        let index_is_monotonically_increasing := mulmod(index_delta, addmod(index_delta, P_SUB_1, p), p)

                        // adjacent_values_match_if_adjacent_indices_match = record_delta * (1 - index_delta)
                        let adjacent_values_match_if_adjacent_indices_match :=
                            mulmod(record_delta, addmod(1, sub(p, index_delta), p), p)

                        mstore(
                            SUBRELATION_EVAL_15_LOC,
                            mulmod(
                                adjacent_values_match_if_adjacent_indices_match,
                                mulmod(
                                    mload(QL_EVAL_LOC),
                                    mulmod(
                                        mload(QR_EVAL_LOC),
                                        mulmod(mload(QMEMORY_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                                        p
                                    ),
                                    p
                                ),
                                p
                            )
                        )

                        // ROM_CONSISTENCY_CHECK_2
                        mstore(
                            SUBRELATION_EVAL_16_LOC,
                            mulmod(
                                index_is_monotonically_increasing,
                                mulmod(
                                    mload(QL_EVAL_LOC),
                                    mulmod(
                                        mload(QR_EVAL_LOC),
                                        mulmod(mload(QMEMORY_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                                        p
                                    ),
                                    p
                                ),
                                p
                            )
                        )

                        mstore(
                            AUX_ROM_CONSISTENCY_CHECK_IDENTITY,
                            mulmod(memory_record_check, mulmod(mload(QL_EVAL_LOC), mload(QR_EVAL_LOC), p), p)
                        )

                        {
                            /**
                             * RAM Consistency Check
                             *
                             * The 'access' type of the record is extracted with the expression `w_4 - ap.partial_record_check`
                             * (i.e. for an honest Prover `w1 * eta + w2 * eta^2 + w3 * eta^3 - w4 = access`.
                             * This is validated by requiring `access` to be boolean
                             *
                             * For two adjacent entries in the sorted list if _both_
                             *  A) index values match
                             *  B) adjacent access value is 0 (i.e. next gate is a READ)
                             * then
                             *  C) both values must match.
                             * The gate boolean check is
                             * (A && B) => C  === !(A && B) || C ===  !A || !B || C
                             *
                             * N.B. it is the responsibility of the circuit writer to ensure that every RAM cell is initialized
                             * with a WRITE operation.
                             */
                            /**
                             * next_gate_access_type = w_3_shift * eta_three;
                             * next_gate_access_type += (w_2_shift * eta_two);
                             * next_gate_access_type += (w_1_shift * eta);
                             * next_gate_access_type += w_4_shift;
                             * next_gate_access_type *= eta;
                             * next_gate_access_type = w_4_omega - next_gate_access_type;
                             */
                            let next_gate_access_type := mulmod(mload(W3_SHIFT_EVAL_LOC), mload(ETA_THREE_CHALLENGE), p)
                            next_gate_access_type := addmod(
                                next_gate_access_type,
                                mulmod(mload(W2_SHIFT_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p),
                                p
                            )
                            next_gate_access_type := addmod(
                                next_gate_access_type,
                                mulmod(mload(W1_SHIFT_EVAL_LOC), mload(ETA_CHALLENGE), p),
                                p
                            )
                            next_gate_access_type := addmod(mload(W4_SHIFT_EVAL_LOC), sub(p, next_gate_access_type), p)

                            // value_delta = w_3_omega - w_3
                            let value_delta := addmod(mload(W3_SHIFT_EVAL_LOC), sub(p, mload(W3_EVAL_LOC)), p)
                            //  adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation = (1 - index_delta) * value_delta * (1 - next_gate_access_type);

                            let adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation :=
                                mulmod(
                                    addmod(1, sub(p, index_delta), p),
                                    mulmod(value_delta, addmod(1, sub(p, next_gate_access_type), p), p),
                                    p
                                )

                            // We can't apply the RAM consistency check identity on the final entry in the sorted list (the wires in the
                            // next gate would make the identity fail).  We need to validate that its 'access type' bool is correct. Can't
                            // do  with an arithmetic gate because of the  `eta` factors. We need to check that the *next* gate's access
                            // type is  correct, to cover this edge case
                            // deg 2 or 4
                            /**
                             * access_type = w_4 - partial_record_check
                             * access_check = access_type^2 - access_type
                             * next_gate_access_type_is_boolean = next_gate_access_type^2 - next_gate_access_type
                             */
                            let access_type := addmod(mload(W4_EVAL_LOC), sub(p, partial_record_check), p)
                            let access_check := mulmod(access_type, addmod(access_type, P_SUB_1, p), p)
                            let next_gate_access_type_is_boolean :=
                                mulmod(next_gate_access_type, addmod(next_gate_access_type, P_SUB_1, p), p)

                            // scaled_activation_selector = q_arith * q_aux * alpha
                            let scaled_activation_selector :=
                                mulmod(
                                    mload(QO_EVAL_LOC),
                                    mulmod(mload(QMEMORY_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                                    p
                                )

                            mstore(
                                SUBRELATION_EVAL_17_LOC,
                                mulmod(
                                    adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation,
                                    scaled_activation_selector,
                                    p
                                )
                            )

                            mstore(
                                SUBRELATION_EVAL_18_LOC,
                                mulmod(index_is_monotonically_increasing, scaled_activation_selector, p)
                            )

                            mstore(
                                SUBRELATION_EVAL_19_LOC,
                                mulmod(next_gate_access_type_is_boolean, scaled_activation_selector, p)
                            )

                            mstore(AUX_RAM_CONSISTENCY_CHECK_IDENTITY, mulmod(access_check, mload(QO_EVAL_LOC), p))
                        }

                        {
                            // timestamp_delta = w_2_omega - w_2
                            let timestamp_delta := addmod(mload(W2_SHIFT_EVAL_LOC), sub(p, mload(W2_EVAL_LOC)), p)

                            // RAM_timestamp_check_identity = (1 - index_delta) * timestamp_delta - w_3
                            let RAM_TIMESTAMP_CHECK_IDENTITY :=
                                addmod(
                                    mulmod(timestamp_delta, addmod(1, sub(p, index_delta), p), p),
                                    sub(p, mload(W3_EVAL_LOC)),
                                    p
                                )

                            /**
                             * memory_identity = ROM_consistency_check_identity;
                             * memory_identity += RAM_timestamp_check_identity * q_4;
                             * memory_identity += memory_record_check * q_m;
                             * memory_identity *= q_1;
                             * memory_identity += (RAM_consistency_check_identity * q_arith);
                             *
                             * auxiliary_identity = memory_identity + non_native_field_identity + limb_accumulator_identity;
                             * auxiliary_identity *= q_aux;
                             * auxiliary_identity *= alpha_base;
                             */
                            let memory_identity := mload(AUX_ROM_CONSISTENCY_CHECK_IDENTITY)
                            memory_identity := addmod(
                                memory_identity,
                                mulmod(
                                    RAM_TIMESTAMP_CHECK_IDENTITY,
                                    mulmod(mload(Q4_EVAL_LOC), mload(QL_EVAL_LOC), p),
                                    p
                                ),
                                p
                            )

                            memory_identity := addmod(
                                memory_identity,
                                mulmod(
                                    mload(AUX_MEMORY_CHECK_IDENTITY),
                                    mulmod(mload(QM_EVAL_LOC), mload(QL_EVAL_LOC), p),
                                    p
                                ),
                                p
                            )
                            memory_identity := addmod(memory_identity, mload(AUX_RAM_CONSISTENCY_CHECK_IDENTITY), p)

                            memory_identity := mulmod(
                                memory_identity,
                                mulmod(mload(QMEMORY_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                                p
                            )
                            mstore(SUBRELATION_EVAL_14_LOC, memory_identity)
                        }
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*               NON NATIVE FIELD RELATION                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    /**
                     * Non native field arithmetic gate 2
                     *             _                                                                               _
                     *            /   _                   _                               _       14                \
                     * q_2 . q_4 |   (w_1 . w_2) + (w_1 . w_2) + (w_1 . w_4 + w_2 . w_3 - w_3) . 2    - w_3 - w_4   |
                     *            \_                                                                               _/
                     *
                     * limb_subproduct = w_1 . w_2_shift + w_1_shift . w_2
                     * non_native_field_gate_2 = w_1 * w_4 + w_2 * w_3 - w_3_shift
                     * non_native_field_gate_2 = non_native_field_gate_2 * limb_size
                     * non_native_field_gate_2 -= w_4_shift
                     * non_native_field_gate_2 += limb_subproduct
                     * non_native_field_gate_2 *= q_4
                     * limb_subproduct *= limb_size
                     * limb_subproduct += w_1_shift * w_2
                     * non_native_field_gate_1 = (limb_subproduct + w_3 + w_4) * q_3
                     * non_native_field_gate_3 = (limb_subproduct + w_4 - (w_3_shift + w_4_shift)) * q_m
                     * non_native_field_identity = (non_native_field_gate_1 + non_native_field_gate_2 + non_native_field_gate_3) * q_2
                     */
                    let limb_subproduct :=
                        addmod(
                            mulmod(mload(W1_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p),
                            mulmod(mload(W1_SHIFT_EVAL_LOC), mload(W2_EVAL_LOC), p),
                            p
                        )

                    let non_native_field_gate_2 :=
                        addmod(
                            addmod(
                                mulmod(mload(W1_EVAL_LOC), mload(W4_EVAL_LOC), p),
                                mulmod(mload(W2_EVAL_LOC), mload(W3_EVAL_LOC), p),
                                p
                            ),
                            sub(p, mload(W3_SHIFT_EVAL_LOC)),
                            p
                        )
                    non_native_field_gate_2 := mulmod(non_native_field_gate_2, LIMB_SIZE, p)
                    non_native_field_gate_2 := addmod(non_native_field_gate_2, sub(p, mload(W4_SHIFT_EVAL_LOC)), p)
                    non_native_field_gate_2 := addmod(non_native_field_gate_2, limb_subproduct, p)
                    non_native_field_gate_2 := mulmod(non_native_field_gate_2, mload(Q4_EVAL_LOC), p)

                    limb_subproduct := mulmod(limb_subproduct, LIMB_SIZE, p)
                    limb_subproduct := addmod(
                        limb_subproduct,
                        mulmod(mload(W1_SHIFT_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p),
                        p
                    )

                    let non_native_field_gate_1 :=
                        mulmod(
                            addmod(limb_subproduct, sub(p, addmod(mload(W3_EVAL_LOC), mload(W4_EVAL_LOC), p)), p),
                            mload(QO_EVAL_LOC),
                            p
                        )

                    let non_native_field_gate_3 :=
                        mulmod(
                            addmod(
                                addmod(limb_subproduct, mload(W4_EVAL_LOC), p),
                                sub(p, addmod(mload(W3_SHIFT_EVAL_LOC), mload(W4_SHIFT_EVAL_LOC), p)),
                                p
                            ),
                            mload(QM_EVAL_LOC),
                            p
                        )
                    let non_native_field_identity :=
                        mulmod(
                            addmod(
                                addmod(non_native_field_gate_1, non_native_field_gate_2, p),
                                non_native_field_gate_3,
                                p
                            ),
                            mload(QR_EVAL_LOC),
                            p
                        )

                    mstore(AUX_NON_NATIVE_FIELD_IDENTITY, non_native_field_identity)
                }

                {
                    /**
                     * limb_accumulator_1 = w_2_omega;
                     * limb_accumulator_1 *= SUBLIMB_SHIFT;
                     * limb_accumulator_1 += w_1_omega;
                     * limb_accumulator_1 *= SUBLIMB_SHIFT;
                     * limb_accumulator_1 += w_3;
                     * limb_accumulator_1 *= SUBLIMB_SHIFT;
                     * limb_accumulator_1 += w_2;
                     * limb_accumulator_1 *= SUBLIMB_SHIFT;
                     * limb_accumulator_1 += w_1;
                     * limb_accumulator_1 -= w_4;
                     * limb_accumulator_1 *= q_4;
                     */
                    let limb_accumulator_1 := mulmod(mload(W2_SHIFT_EVAL_LOC), SUBLIMB_SHIFT, p)
                    limb_accumulator_1 := addmod(limb_accumulator_1, mload(W1_SHIFT_EVAL_LOC), p)
                    limb_accumulator_1 := mulmod(limb_accumulator_1, SUBLIMB_SHIFT, p)
                    limb_accumulator_1 := addmod(limb_accumulator_1, mload(W3_EVAL_LOC), p)
                    limb_accumulator_1 := mulmod(limb_accumulator_1, SUBLIMB_SHIFT, p)
                    limb_accumulator_1 := addmod(limb_accumulator_1, mload(W2_EVAL_LOC), p)
                    limb_accumulator_1 := mulmod(limb_accumulator_1, SUBLIMB_SHIFT, p)
                    limb_accumulator_1 := addmod(limb_accumulator_1, mload(W1_EVAL_LOC), p)
                    limb_accumulator_1 := addmod(limb_accumulator_1, sub(p, mload(W4_EVAL_LOC)), p)
                    limb_accumulator_1 := mulmod(limb_accumulator_1, mload(Q4_EVAL_LOC), p)

                    /**
                     * limb_accumulator_2 = w_3_omega;
                     * limb_accumulator_2 *= SUBLIMB_SHIFT;
                     * limb_accumulator_2 += w_2_omega;
                     * limb_accumulator_2 *= SUBLIMB_SHIFT;
                     * limb_accumulator_2 += w_1_omega;
                     * limb_accumulator_2 *= SUBLIMB_SHIFT;
                     * limb_accumulator_2 += w_4;
                     * limb_accumulator_2 *= SUBLIMB_SHIFT;
                     * limb_accumulator_2 += w_3;
                     * limb_accumulator_2 -= w_4_omega;
                     * limb_accumulator_2 *= q_m;
                     */
                    let limb_accumulator_2 := mulmod(mload(W3_SHIFT_EVAL_LOC), SUBLIMB_SHIFT, p)
                    limb_accumulator_2 := addmod(limb_accumulator_2, mload(W2_SHIFT_EVAL_LOC), p)
                    limb_accumulator_2 := mulmod(limb_accumulator_2, SUBLIMB_SHIFT, p)
                    limb_accumulator_2 := addmod(limb_accumulator_2, mload(W1_SHIFT_EVAL_LOC), p)
                    limb_accumulator_2 := mulmod(limb_accumulator_2, SUBLIMB_SHIFT, p)
                    limb_accumulator_2 := addmod(limb_accumulator_2, mload(W4_EVAL_LOC), p)
                    limb_accumulator_2 := mulmod(limb_accumulator_2, SUBLIMB_SHIFT, p)
                    limb_accumulator_2 := addmod(limb_accumulator_2, mload(W3_EVAL_LOC), p)
                    limb_accumulator_2 := addmod(limb_accumulator_2, sub(p, mload(W4_SHIFT_EVAL_LOC)), p)
                    limb_accumulator_2 := mulmod(limb_accumulator_2, mload(QM_EVAL_LOC), p)

                    let limb_accumulator_identity := addmod(limb_accumulator_1, limb_accumulator_2, p)
                    limb_accumulator_identity := mulmod(limb_accumulator_identity, mload(QO_EVAL_LOC), p)

                    let nnf_identity := addmod(mload(AUX_NON_NATIVE_FIELD_IDENTITY), limb_accumulator_identity, p)
                    nnf_identity := mulmod(
                        nnf_identity,
                        mulmod(mload(QNNF_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                        p
                    )

                    mstore(SUBRELATION_EVAL_20_LOC, nnf_identity)
                }

                /*
                * Poseidon External Relation
                */
                {
                    let s1 := addmod(mload(W1_EVAL_LOC), mload(QL_EVAL_LOC), p)
                    let s2 := addmod(mload(W2_EVAL_LOC), mload(QR_EVAL_LOC), p)
                    let s3 := addmod(mload(W3_EVAL_LOC), mload(QO_EVAL_LOC), p)
                    let s4 := addmod(mload(W4_EVAL_LOC), mload(Q4_EVAL_LOC), p)

                    // u1 := s1 * s1 * s1 * s1 * s1;
                    let t0 := mulmod(s1, s1, p)
                    let u1 := mulmod(t0, mulmod(t0, s1, p), p)

                    // u2 := s2 * s2 * s2 * s2 * s2;
                    t0 := mulmod(s2, s2, p)
                    let u2 := mulmod(t0, mulmod(t0, s2, p), p)

                    // u3 := s3 * s3 * s3 * s3 * s3;
                    t0 := mulmod(s3, s3, p)
                    let u3 := mulmod(t0, mulmod(t0, s3, p), p)

                    // u4 := s4 * s4 * s4 * s4 * s4;
                    t0 := mulmod(s4, s4, p)
                    let u4 := mulmod(t0, mulmod(t0, s4, p), p)

                    // matrix mul v = M_E * u with 14 additions
                    t0 := addmod(u1, u2, p)
                    let t1 := addmod(u3, u4, p)

                    let t2 := addmod(u2, u2, p)
                    t2 := addmod(t2, t1, p)

                    let t3 := addmod(u4, u4, p)
                    t3 := addmod(t3, t0, p)

                    let v4 := addmod(t1, t1, p)
                    v4 := addmod(v4, v4, p)
                    v4 := addmod(v4, t3, p)

                    let v2 := addmod(t0, t0, p)
                    v2 := addmod(v2, v2, p)
                    v2 := addmod(v2, t2, p)

                    let v1 := addmod(t3, v2, p)
                    let v3 := addmod(t2, v4, p)

                    let q_pos_by_scaling :=
                        mulmod(mload(QPOSEIDON2_EXTERNAL_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p)

                    mstore(
                        SUBRELATION_EVAL_21_LOC,
                        mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_22_LOC,
                        mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_23_LOC,
                        mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_24_LOC,
                        mulmod(q_pos_by_scaling, addmod(v4, sub(p, mload(W4_SHIFT_EVAL_LOC)), p), p)
                    )
                }

                /*
                * Poseidon Internal Relation
                */
                {
                    let s1 := addmod(mload(W1_EVAL_LOC), mload(QL_EVAL_LOC), p)

                    // apply s-box round
                    let t0 := mulmod(s1, s1, p)
                    let u1 := mulmod(t0, mulmod(t0, s1, p), p)
                    let u2 := mload(W2_EVAL_LOC)
                    let u3 := mload(W3_EVAL_LOC)
                    let u4 := mload(W4_EVAL_LOC)

                    // matrix mul v = M_I * u 4 muls and 7 additions
                    let u_sum := addmod(u1, u2, p)
                    u_sum := addmod(u_sum, addmod(u3, u4, p), p)

                    let q_pos_by_scaling :=
                        mulmod(mload(QPOSEIDON2_INTERNAL_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p)

                    let v1 := addmod(mulmod(u1, POS_INTERNAL_MATRIX_D_0, p), u_sum, p)

                    mstore(
                        SUBRELATION_EVAL_25_LOC,
                        mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p)
                    )
                    let v2 := addmod(mulmod(u2, POS_INTERNAL_MATRIX_D_1, p), u_sum, p)

                    mstore(
                        SUBRELATION_EVAL_26_LOC,
                        mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p)
                    )
                    let v3 := addmod(mulmod(u3, POS_INTERNAL_MATRIX_D_2, p), u_sum, p)

                    mstore(
                        SUBRELATION_EVAL_27_LOC,
                        mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p)
                    )

                    let v4 := addmod(mulmod(u4, POS_INTERNAL_MATRIX_D_3, p), u_sum, p)
                    mstore(
                        SUBRELATION_EVAL_28_LOC,
                        mulmod(q_pos_by_scaling, addmod(v4, sub(p, mload(W4_SHIFT_EVAL_LOC)), p), p)
                    )
                }

                // Scale and batch subrelations by subrelation challenges
                // linear combination of subrelations
                let accumulator := mload(SUBRELATION_EVAL_0_LOC)

                // Below is an unrolled variant of the following loop
                // for (uint256 i = 1; i < NUMBER_OF_SUBRELATIONS; ++i) {
                //     accumulator = accumulator + evaluations[i] * subrelationChallenges[i - 1];
                // }

                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_1_LOC), mload(ALPHA_CHALLENGE_0), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_2_LOC), mload(ALPHA_CHALLENGE_1), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_3_LOC), mload(ALPHA_CHALLENGE_2), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_4_LOC), mload(ALPHA_CHALLENGE_3), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_5_LOC), mload(ALPHA_CHALLENGE_4), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_6_LOC), mload(ALPHA_CHALLENGE_5), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_7_LOC), mload(ALPHA_CHALLENGE_6), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_8_LOC), mload(ALPHA_CHALLENGE_7), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_9_LOC), mload(ALPHA_CHALLENGE_8), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_10_LOC), mload(ALPHA_CHALLENGE_9), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_11_LOC), mload(ALPHA_CHALLENGE_10), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_12_LOC), mload(ALPHA_CHALLENGE_11), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_13_LOC), mload(ALPHA_CHALLENGE_12), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_14_LOC), mload(ALPHA_CHALLENGE_13), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_15_LOC), mload(ALPHA_CHALLENGE_14), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_16_LOC), mload(ALPHA_CHALLENGE_15), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_17_LOC), mload(ALPHA_CHALLENGE_16), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_18_LOC), mload(ALPHA_CHALLENGE_17), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_19_LOC), mload(ALPHA_CHALLENGE_18), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_20_LOC), mload(ALPHA_CHALLENGE_19), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_21_LOC), mload(ALPHA_CHALLENGE_20), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_22_LOC), mload(ALPHA_CHALLENGE_21), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_23_LOC), mload(ALPHA_CHALLENGE_22), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_24_LOC), mload(ALPHA_CHALLENGE_23), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_25_LOC), mload(ALPHA_CHALLENGE_24), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_26_LOC), mload(ALPHA_CHALLENGE_25), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_27_LOC), mload(ALPHA_CHALLENGE_26), p),
                    p
                )
                accumulator := addmod(
                    accumulator,
                    mulmod(mload(SUBRELATION_EVAL_28_LOC), mload(ALPHA_CHALLENGE_27), p),
                    p
                )

                let sumcheck_valid := eq(accumulator, mload(FINAL_ROUND_TARGET_LOC))

                if iszero(sumcheck_valid) {
                    mstore(0x00, SUMCHECK_FAILED_SELECTOR)
                    revert(0x00, 0x04)
                }
            }

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                 SUMCHECK -- Complete                       */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                       SHPLEMINI                            */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

            // ============= SHPLEMINI INVERSES ==============
            // Inverses were computed in the unified batch inversion above.
            let unshifted_scalar := 0
            let shifted_scalar := 0
            {
                // staging[0] = 1/gemini_r -- needed for shifted_scalar computation
                let gemini_r_inv := mload(GEMINI_R_INV_LOC)

                // staging[1..3*LOG_N] maps contiguously to:
                //   INVERTED_CHALLENGE_POW_MINUS_U_0..14
                //   POS_INVERTED_DENOM_0..14
                //   NEG_INVERTED_DENOM_0..14
                // Total: 3*LOG_N

                // Compute unshifted_scalar and shifted_scalar using the copied inverses
                let pos_inverted_denominator := mload(POS_INVERTED_DENOM_0_LOC)
                let neg_inverted_denominator := mload(NEG_INVERTED_DENOM_0_LOC)
                let shplonk_nu := mload(SHPLONK_NU_CHALLENGE)

                unshifted_scalar := addmod(pos_inverted_denominator, mulmod(shplonk_nu, neg_inverted_denominator, p), p)

                shifted_scalar := mulmod(
                    gemini_r_inv, // (1 / gemini_r_challenge) from staging[0]
                    // (inverse_vanishing_evals[0]) - (shplonk_nu * inverse_vanishing_evals[1])
                    addmod(
                        pos_inverted_denominator,
                        // - (shplonk_nu * inverse_vanishing_evals[1])
                        sub(p, mulmod(shplonk_nu, neg_inverted_denominator, p)),
                        p
                    ),
                    p
                )
            }

            // Commitment Accumulation (MSM via sequential ecAdd/ecMul):
            // For each commitment C_i with batch scalar s_i, we compute:
            //   accumulator += s_i * C_i
            // The commitments include: shplonk_Q, VK points, wire commitments,
            // lookup commitments, Z_PERM, gemini fold univariates.
            // The KZG quotient is handled separately.
            // The final accumulator is the LHS of the pairing equation.

            // Accumulators
            let batching_challenge := 1
            let batched_evaluation := 0

            let neg_unshifted_scalar := sub(p, unshifted_scalar)
            let neg_shifted_scalar := sub(p, shifted_scalar)

            let rho := mload(RHO_CHALLENGE)

            // Unrolled for the loop below - where NUMBER_UNSHIFTED = 36
            // for (uint256 i = 1; i <= NUMBER_UNSHIFTED; ++i) {
            //     scalars[i] = mem.unshiftedScalar.neg() * mem.batchingChallenge;
            //     mem.batchedEvaluation = mem.batchedEvaluation + (proof.sumcheckEvaluations[i - 1] * mem.batchingChallenge);
            //     mem.batchingChallenge = mem.batchingChallenge * tp.rho;
            // }

            // Iteration order matches UltraFlavor_Generated::EntityId. Scalar slot N = entity index N + 1
            // pairs with vk[N] in the batchMul block below.

            // 0: SIGMA1_EVAL_LOC
            mstore(BATCH_SCALAR_1_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 1: SIGMA2_EVAL_LOC
            mstore(BATCH_SCALAR_2_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 2: SIGMA3_EVAL_LOC
            mstore(BATCH_SCALAR_3_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 3: SIGMA4_EVAL_LOC
            mstore(BATCH_SCALAR_4_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 4: ID1_EVAL_LOC
            mstore(BATCH_SCALAR_5_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 5: ID2_EVAL_LOC
            mstore(BATCH_SCALAR_6_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 6: ID3_EVAL_LOC
            mstore(BATCH_SCALAR_7_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 7: ID4_EVAL_LOC
            mstore(BATCH_SCALAR_8_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 8: LAGRANGE_FIRST_EVAL_LOC
            mstore(BATCH_SCALAR_9_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(LAGRANGE_FIRST_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 9: LAGRANGE_LAST_EVAL_LOC
            mstore(BATCH_SCALAR_10_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(LAGRANGE_LAST_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 10: QLOOKUP_EVAL_LOC
            mstore(BATCH_SCALAR_11_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QLOOKUP_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 11: TABLE1_EVAL_LOC
            mstore(BATCH_SCALAR_12_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 12: TABLE2_EVAL_LOC
            mstore(BATCH_SCALAR_13_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 13: TABLE3_EVAL_LOC
            mstore(BATCH_SCALAR_14_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 14: TABLE4_EVAL_LOC
            mstore(BATCH_SCALAR_15_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 15: QM_EVAL_LOC
            mstore(BATCH_SCALAR_16_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QM_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 16: QR_EVAL_LOC
            mstore(BATCH_SCALAR_17_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QR_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 17: QO_EVAL_LOC
            mstore(BATCH_SCALAR_18_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QO_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 18: QC_EVAL_LOC
            mstore(BATCH_SCALAR_19_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QC_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 19: QL_EVAL_LOC
            mstore(BATCH_SCALAR_20_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 20: Q4_EVAL_LOC
            mstore(BATCH_SCALAR_21_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(Q4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 21: QARITH_EVAL_LOC
            mstore(BATCH_SCALAR_22_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QARITH_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 22: QRANGE_EVAL_LOC
            mstore(BATCH_SCALAR_23_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QRANGE_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 23: QELLIPTIC_EVAL_LOC
            mstore(BATCH_SCALAR_24_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QELLIPTIC_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 24: QMEMORY_EVAL_LOC
            mstore(BATCH_SCALAR_25_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QMEMORY_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 25: QNNF_EVAL_LOC
            mstore(BATCH_SCALAR_26_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QNNF_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 26: QPOSEIDON2_EXTERNAL_EVAL_LOC
            mstore(BATCH_SCALAR_27_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QPOSEIDON2_EXTERNAL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 27: QPOSEIDON2_INTERNAL_EVAL_LOC
            mstore(BATCH_SCALAR_28_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QPOSEIDON2_INTERNAL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 28: W1_EVAL_LOC
            mstore(BATCH_SCALAR_29_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 29: W2_EVAL_LOC
            mstore(BATCH_SCALAR_30_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 30: W3_EVAL_LOC
            mstore(BATCH_SCALAR_31_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 31: W4_EVAL_LOC
            mstore(BATCH_SCALAR_32_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 32: Z_PERM_EVAL_LOC
            mstore(BATCH_SCALAR_33_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(Z_PERM_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 33: LOOKUP_INVERSES_EVAL_LOC
            mstore(BATCH_SCALAR_34_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 34: LOOKUP_READ_COUNTS_EVAL_LOC
            mstore(BATCH_SCALAR_35_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(LOOKUP_READ_COUNTS_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 35: LOOKUP_READ_TAGS_EVAL_LOC
            mstore(BATCH_SCALAR_36_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // Unrolled for NUMBER_OF_SHIFTED_ENTITIES = 5
            // for (uint256 i = NUMBER_UNSHIFTED + 1; i <= NUMBER_OF_ENTITIES; ++i) {
            //     scalars[i] = mem.shiftedScalar.neg() * mem.batchingChallenge;
            //     mem.batchedEvaluation = mem.batchedEvaluation + (proof.sumcheckEvaluations[i - 1] * mem.batchingChallenge);
            //     mem.batchingChallenge = mem.batchingChallenge * tp.rho;
            // }

            // 28: W1_EVAL_LOC
            mstore(
                BATCH_SCALAR_29_LOC,
                addmod(mload(BATCH_SCALAR_29_LOC), mulmod(neg_shifted_scalar, batching_challenge, p), p)
            )
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W1_SHIFT_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 29: W2_EVAL_LOC
            mstore(
                BATCH_SCALAR_30_LOC,
                addmod(mload(BATCH_SCALAR_30_LOC), mulmod(neg_shifted_scalar, batching_challenge, p), p)
            )
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W2_SHIFT_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 30: W3_EVAL_LOC
            mstore(
                BATCH_SCALAR_31_LOC,
                addmod(mload(BATCH_SCALAR_31_LOC), mulmod(neg_shifted_scalar, batching_challenge, p), p)
            )
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W3_SHIFT_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 31: W4_EVAL_LOC
            mstore(
                BATCH_SCALAR_32_LOC,
                addmod(mload(BATCH_SCALAR_32_LOC), mulmod(neg_shifted_scalar, batching_challenge, p), p)
            )
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(W4_SHIFT_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 32: Z_PERM_EVAL_LOC
            mstore(
                BATCH_SCALAR_33_LOC,
                addmod(mload(BATCH_SCALAR_33_LOC), mulmod(neg_shifted_scalar, batching_challenge, p), p)
            )
            batched_evaluation := addmod(
                batched_evaluation,
                mulmod(mload(Z_PERM_SHIFT_EVAL_LOC), batching_challenge, p),
                p
            )
            batching_challenge := mulmod(batching_challenge, rho, p)

            // Compute fold pos evaluations
            {
                mstore(CHALL_POW_LOC, POWERS_OF_EVALUATION_CHALLENGE_{{ LOG_N_MINUS_ONE }}_LOC)
                mstore(SUMCHECK_U_LOC, SUM_U_CHALLENGE_{{ LOG_N_MINUS_ONE }})
                mstore(GEMINI_A_LOC, GEMINI_A_EVAL_{{ LOG_N_MINUS_ONE }})
                // Inversion of this value was included in batch inversion above
                let inverted_chall_pow_minus_u_loc := INVERTED_CHALLENGE_POW_MINUS_U_{{ LOG_N_MINUS_ONE }}_LOC
                let fold_pos_off := FOLD_POS_EVALUATIONS_{{ LOG_N_MINUS_ONE }}_LOC

                let batchedEvalAcc := batched_evaluation
                for { let i := LOG_N } gt(i, 0) { i := sub(i, 1) } {
                    let chall_pow := mload(mload(CHALL_POW_LOC))
                    let sum_check_u := mload(mload(SUMCHECK_U_LOC))

                    // challengePower * batchedEvalAccumulator * 2
                    let batchedEvalRoundAcc := mulmod(chall_pow, mulmod(batchedEvalAcc, 2, p), p)
                    // (challengePower * (ONE - u) - u)
                    let chall_pow_times_1_minus_u := mulmod(chall_pow, addmod(1, sub(p, sum_check_u), p), p)

                    batchedEvalRoundAcc := addmod(
                        batchedEvalRoundAcc,
                        sub(
                            p,
                            mulmod(
                                mload(mload(GEMINI_A_LOC)),
                                addmod(chall_pow_times_1_minus_u, sub(p, sum_check_u), p),
                                p
                            )
                        ),
                        p
                    )

                    batchedEvalRoundAcc := mulmod(batchedEvalRoundAcc, mload(inverted_chall_pow_minus_u_loc), p)

                    batchedEvalAcc := batchedEvalRoundAcc
                    mstore(fold_pos_off, batchedEvalRoundAcc)

                    mstore(CHALL_POW_LOC, sub(mload(CHALL_POW_LOC), 0x20))
                    mstore(SUMCHECK_U_LOC, sub(mload(SUMCHECK_U_LOC), 0x20))
                    mstore(GEMINI_A_LOC, sub(mload(GEMINI_A_LOC), 0x20))
                    inverted_chall_pow_minus_u_loc := sub(inverted_chall_pow_minus_u_loc, 0x20)
                    fold_pos_off := sub(fold_pos_off, 0x20)
                }
            }

            let constant_term_acc := mulmod(mload(FOLD_POS_EVALUATIONS_0_LOC), mload(POS_INVERTED_DENOM_0_LOC), p)
            {
                let shplonk_nu := mload(SHPLONK_NU_CHALLENGE)

                constant_term_acc := addmod(
                   constant_term_acc,
                    mulmod(mload(GEMINI_A_EVAL_0), mulmod(shplonk_nu, mload(NEG_INVERTED_DENOM_0_LOC), p), p),
                    p
                )

                let shplonk_nu_sqr := mulmod(shplonk_nu, shplonk_nu, p)
                batching_challenge := shplonk_nu_sqr

                mstore(SS_POS_INV_DENOM_LOC, POS_INVERTED_DENOM_1_LOC)
                mstore(SS_NEG_INV_DENOM_LOC, NEG_INVERTED_DENOM_1_LOC)

                mstore(SS_GEMINI_EVALS_LOC, GEMINI_A_EVAL_1)
                let fold_pos_evals_loc := FOLD_POS_EVALUATIONS_1_LOC

                let scalars_loc := BATCH_SCALAR_37_LOC

                for { let i := 0 } lt(i, sub(LOG_N, 1)) { i := add(i, 1) } {
                    let scaling_factor_pos := mulmod(batching_challenge, mload(mload(SS_POS_INV_DENOM_LOC)), p)
                    let scaling_factor_neg :=
                        mulmod(batching_challenge, mulmod(shplonk_nu, mload(mload(SS_NEG_INV_DENOM_LOC)), p), p)

                    mstore(scalars_loc, addmod(sub(p, scaling_factor_neg), sub(p, scaling_factor_pos), p))

                    let accum_contribution := mulmod(scaling_factor_neg, mload(mload(SS_GEMINI_EVALS_LOC)), p)
                    accum_contribution := addmod(
                        accum_contribution,
                        mulmod(scaling_factor_pos, mload(fold_pos_evals_loc), p),
                        p
                    )

                    constant_term_acc := addmod(constant_term_acc, accum_contribution, p)

                    batching_challenge := mulmod(batching_challenge, shplonk_nu_sqr, p)

                    mstore(SS_POS_INV_DENOM_LOC, add(mload(SS_POS_INV_DENOM_LOC), 0x20))
                    mstore(SS_NEG_INV_DENOM_LOC, add(mload(SS_NEG_INV_DENOM_LOC), 0x20))
                    mstore(SS_GEMINI_EVALS_LOC, add(mload(SS_GEMINI_EVALS_LOC), 0x20))
                    fold_pos_evals_loc := add(fold_pos_evals_loc, 0x20)
                    scalars_loc := add(scalars_loc, 0x20)
                }
            }

            let precomp_success_flag := 1
            let q := Q // EC group order
            {
                // The initial accumulator = 1 * shplonk_q
                mcopy(ACCUMULATOR, SHPLONK_Q_X_LOC, 0x40)
            }

            // Accumulate vk points
            loadVk()
            {
                // VK batchMul order matches UltraFlavor_Generated::EntityId precomputed layout.
                // Accumulator = accumulator + scalar[1] * vk[0] (sigma_1)
                mcopy(G1_LOCATION, SIGMA_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_1_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[2] * vk[1] (sigma_2)
                mcopy(G1_LOCATION, SIGMA_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_2_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[3] * vk[2] (sigma_3)
                mcopy(G1_LOCATION, SIGMA_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_3_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[4] * vk[3] (sigma_4)
                mcopy(G1_LOCATION, SIGMA_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_4_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[5] * vk[4] (id_1)
                mcopy(G1_LOCATION, ID_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_5_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[6] * vk[5] (id_2)
                mcopy(G1_LOCATION, ID_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_6_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[7] * vk[6] (id_3)
                mcopy(G1_LOCATION, ID_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_7_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[8] * vk[7] (id_4)
                mcopy(G1_LOCATION, ID_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_8_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[9] * vk[8] (lagrange_first)
                mcopy(G1_LOCATION, LAGRANGE_FIRST_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_9_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[10] * vk[9] (lagrange_last)
                mcopy(G1_LOCATION, LAGRANGE_LAST_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_10_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[11] * vk[10] (q_lookup)
                mcopy(G1_LOCATION, Q_LOOKUP_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_11_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[12] * vk[11] (table_1)
                mcopy(G1_LOCATION, TABLE_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_12_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[13] * vk[12] (table_2)
                mcopy(G1_LOCATION, TABLE_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_13_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[14] * vk[13] (table_3)
                mcopy(G1_LOCATION, TABLE_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_14_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[15] * vk[14] (table_4)
                mcopy(G1_LOCATION, TABLE_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_15_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[16] * vk[15] (q_m)
                mcopy(G1_LOCATION, Q_M_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_16_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[17] * vk[16] (q_r)
                mcopy(G1_LOCATION, Q_R_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_17_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[18] * vk[17] (q_o)
                mcopy(G1_LOCATION, Q_O_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_18_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[19] * vk[18] (q_c)
                mcopy(G1_LOCATION, Q_C_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_19_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[20] * vk[19] (q_l)
                mcopy(G1_LOCATION, Q_L_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_20_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[21] * vk[20] (q_4)
                mcopy(G1_LOCATION, Q_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_21_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[22] * vk[21] (q_arith)
                mcopy(G1_LOCATION, Q_ARITH_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_22_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[23] * vk[22] (q_delta_range)
                mcopy(G1_LOCATION, Q_DELTA_RANGE_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_23_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[24] * vk[23] (q_elliptic)
                mcopy(G1_LOCATION, Q_ELLIPTIC_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_24_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[25] * vk[24] (q_memory)
                mcopy(G1_LOCATION, Q_MEMORY_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_25_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[26] * vk[25] (q_nnf)
                mcopy(G1_LOCATION, Q_NNF_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_26_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[27] * vk[26] (q_poseidon2_external)
                mcopy(G1_LOCATION, Q_POSEIDON_2_EXTERNAL_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_27_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[28] * vk[27] (q_poseidon2_internal)
                mcopy(G1_LOCATION, Q_POSEIDON_2_INTERNAL_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_28_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + constant_term_acc * G (generator)
                mstore(G1_LOCATION, 0x01) // G1 generator x
                mstore(add(G1_LOCATION, 0x20), 0x02) // G1 generator y
                mstore(SCALAR_LOCATION, constant_term_acc)
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulate proof points
                // Accumulator = accumulator + scalar[29] * w_l
                mcopy(G1_LOCATION, W_L_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_29_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[30] * w_r
                mcopy(G1_LOCATION, W_R_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_30_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[31] * w_o
                mcopy(G1_LOCATION, W_O_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_31_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[32] * w_4
                mcopy(G1_LOCATION, W_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_32_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[33] * z_perm
                mcopy(G1_LOCATION, Z_PERM_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_33_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[34] * lookup_inverses
                mcopy(G1_LOCATION, LOOKUP_INVERSES_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_34_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[35] * lookup_read_counts
                mcopy(G1_LOCATION, LOOKUP_READ_COUNTS_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_35_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulator = accumulator + scalar[36] * lookup_read_tags
                mcopy(G1_LOCATION, LOOKUP_READ_TAGS_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_36_LOC))
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                )
                precomp_success_flag := and(
                    precomp_success_flag,
                    staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                )

                // Accumulate these LOG_N scalars with the gemini fold univariates
                {
                    {
                        /// {{ UNROLL_SECTION_START ACCUMULATE_GEMINI_FOLD_UNIVARIATE }}
                        /// {{ UNROLL_SECTION_END ACCUMULATE_GEMINI_FOLD_UNIVARIATE }}
                    }
                }

                {
                    // Accumulate final quotient commitment into shplonk check
                    // Accumulator = accumulator + shplonkZ * quotient commitment
                    mcopy(G1_LOCATION, KZG_QUOTIENT_X_LOC, 0x40)

                    mstore(SCALAR_LOCATION, mload(SHPLONK_Z_CHALLENGE))
                    precomp_success_flag := and(
                        precomp_success_flag,
                        staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40)
                    )
                    precomp_success_flag := and(
                        precomp_success_flag,
                        staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40)
                    )
                }

                // All G1 points were validated on-curve during input validation.
                // precomp_success_flag now only tracks ecAdd/ecMul precompile success.
                if iszero(precomp_success_flag) {
                    mstore(0x00, SHPLEMINI_FAILED_SELECTOR)
                    revert(0x00, 0x04)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                  SHPLEMINI - complete                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                       PAIRING CHECK                        */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    // P_1
                    mstore(0xc0, mload(KZG_QUOTIENT_X_LOC))
                    mstore(0xe0, sub(q, mload(KZG_QUOTIENT_Y_LOC)))

                    // p_0_agg
                    // 0x80 - p_0_agg x
                    // 0xa0 - p_0_agg y
                    mcopy(0x80, ACCUMULATOR, 0x40)

                    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                    /*                   PAIRING AGGREGATION                      */
                    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                    // Read the pairing encoded in the first 8 field elements of the proof (2 limbs per coordinate)
                    let p0_other_x := mload(PAIRING_POINT_0_X_0_LOC)
                    p0_other_x := or(shl(136, mload(PAIRING_POINT_0_X_1_LOC)), p0_other_x)

                    let p0_other_y := mload(PAIRING_POINT_0_Y_0_LOC)
                    p0_other_y := or(shl(136, mload(PAIRING_POINT_0_Y_1_LOC)), p0_other_y)

                    let p1_other_x := mload(PAIRING_POINT_1_X_0_LOC)
                    p1_other_x := or(shl(136, mload(PAIRING_POINT_1_X_1_LOC)), p1_other_x)

                    let p1_other_y := mload(PAIRING_POINT_1_Y_0_LOC)
                    p1_other_y := or(shl(136, mload(PAIRING_POINT_1_Y_1_LOC)), p1_other_y)

                    // Check if pairing points are default (all zero = infinity = no recursive verification)
                    let pairing_points_are_default := iszero(or(or(p0_other_x, p0_other_y), or(p1_other_x, p1_other_y)))

                    let success := 1
                    // Only aggregate if pairing points are non-default
                    if iszero(pairing_points_are_default) {
                        // Reconstructed coordinates must be < Q to prevent malleability
                        if iszero(and(
                            and(lt(p0_other_x, q), lt(p0_other_y, q)),
                            and(lt(p1_other_x, q), lt(p1_other_y, q))
                        )) {
                            mstore(0x00, VALUE_GE_GROUP_ORDER_SELECTOR)
                            revert(0x00, 0x04)
                        }

                        // Validate p_0_other not point of infinity
                        success := iszero(iszero(or(p0_other_x, p0_other_y)))
                        // Validate p_1_other not point of infinity
                        success := and(success, iszero(iszero(or(p1_other_x, p1_other_y))))

                        // p_0
                        mstore(0x00, p0_other_x)
                        mstore(0x20, p0_other_y)

                        // p_1
                        mstore(0x40, p1_other_x)
                        mstore(0x60, p1_other_y)

                        // p_1_agg is already in the correct location

                        let recursion_separator := keccak256(0x00, 0x100)

                        // Write separator back to scratch space
                        mstore(0x00, p0_other_x)

                        mstore(0x40, recursion_separator)
                        // recursion_separator * p_0_other
                        success := and(success, staticcall(gas(), 0x07, 0x00, 0x60, 0x00, 0x40))

                        // (recursion_separator * p_0_other) + p_0_agg
                        mcopy(0x40, 0x80, 0x40)
                        // p_0 = (recursion_separator * p_0_other) + p_0_agg
                        success := and(success, staticcall(gas(), 6, 0x00, 0x80, 0x00, 0x40))

                        mstore(0x40, p1_other_x)
                        mstore(0x60, p1_other_y)
                        mstore(0x80, recursion_separator)

                        success := and(success, staticcall(gas(), 7, 0x40, 0x60, 0x40, 0x40))

                        // Write p_1_agg back to scratch space
                        mcopy(0x80, 0xc0, 0x40)

                        // 0xc0 - (recursion_separator * p_1_other) + p_1_agg
                        success := and(success, staticcall(gas(), 6, 0x40, 0x80, 0xc0, 0x40))
                    }
                    // If default pairing points, use p_0_agg and p_1_agg directly (already at 0x80, 0xc0)
                    if pairing_points_are_default {
                        // Copy p_0_agg to 0x00 for pairing input
                        mcopy(0x00, 0x80, 0x40)
                        // p_1_agg stays at 0xc0
                    }

                    // G2 [1]
                    mstore(0x40, 0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2)
                    mstore(0x60, 0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed)
                    mstore(0x80, 0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b)
                    mstore(0xa0, 0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa)

                    // G2 [x]
                    mstore(0x100, 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1)
                    mstore(0x120, 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0)
                    mstore(0x140, 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4)
                    mstore(0x160, 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)

                    let pairing_success := and(success, staticcall(gas(), 8, 0x00, 0x180, 0x00, 0x20))
                    if iszero(and(pairing_success, mload(0x00))) {
                        mstore(0x00, SHPLEMINI_FAILED_SELECTOR)
                        revert(0x00, 0x04)
                    }

                    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                    /*                PAIRING CHECK - Complete                    */
                    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                }
                {
                    mstore(0x00, 0x01)
                    return(0x00, 0x20) // Proof succeeded!
                }
            }
        }
    }
}
)";

inline std::string get_optimized_honk_solidity_verifier(auto const& verification_key)
{
    std::string template_str = HONK_CONTRACT_OPT_SOURCE;

    apply_template_params(template_str, verification_key, /*is_zk=*/false);

    // Replace UNROLL_SECTION blocks
    int log_n = static_cast<int>(verification_key->log_circuit_size);
    UnrollConfig unroll_config{
        .batch_scalar_offset = 37,
    };

    replace_unroll_section(template_str, "POWERS_OF_EVALUATION_COMPUTATION", log_n, unroll_config);
    replace_unroll_section(template_str, "ACCUMULATE_INVERSES", log_n, unroll_config);
    replace_unroll_section(template_str, "COLLECT_INVERSES", log_n, unroll_config);
    replace_unroll_section(template_str, "ACCUMULATE_GEMINI_FOLD_UNIVARIATE", log_n, unroll_config);

    MemoryLayoutConfig mem_config{
        .batched_relation_partial_length = 8,
        .barycentric_domain_size = 8,
        .is_zk = false,
    };
    replace_memory_layout(template_str, log_n, mem_config);

    return template_str;
}

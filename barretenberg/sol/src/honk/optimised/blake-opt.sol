// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import {IVerifier} from "../../interfaces/IVerifier.sol";

uint256 constant NUMBER_OF_SUBRELATIONS = 28;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 8;
uint256 constant ZK_BATCHED_RELATION_PARTIAL_LENGTH = 9;
uint256 constant NUMBER_OF_ENTITIES = 41;
uint256 constant NUMBER_UNSHIFTED = 36;
uint256 constant NUMBER_TO_BE_SHIFTED = 5;
uint256 constant PAIRING_POINTS_SIZE = 16;

uint256 constant VK_HASH = 0x1981d022ae23f25c02cf445175f26defa26ed4917a721cf063a7478617894a41;
uint256 constant CIRCUIT_SIZE = 32768;
uint256 constant LOG_N = 15;
uint256 constant NUMBER_PUBLIC_INPUTS = 20;
uint256 constant REAL_NUMBER_PUBLIC_INPUTS = 20 - 16;
uint256 constant PUBLIC_INPUTS_OFFSET = 1;
// LOG_N * 8
uint256 constant NUMBER_OF_BARYCENTRIC_INVERSES = 120;

error PUBLIC_INPUT_TOO_LARGE();
error SUMCHECK_FAILED();
error PAIRING_FAILED();
error BATCH_ACCUMULATION_FAILED();
error MODEXP_FAILED();

contract BlakeOptHonkVerifier is IVerifier {
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                    SLAB ALLOCATION                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    /**
     * We manually manage memory within this optimised implementation
     * Memory is loaded into a large slab that is ordered in the following way
     *
     * // TODO: ranges
     * **
     */

    // {{ SECTION_START MEMORY_LAYOUT }}
    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                        VK INDICIES                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant VK_CIRCUIT_SIZE_LOC = 0x1000;
    uint256 internal constant VK_NUM_PUBLIC_INPUTS_LOC = 0x1020;
    uint256 internal constant VK_PUB_INPUTS_OFFSET_LOC = 0x1040;
    uint256 internal constant Q_M_X_LOC = 0x1060;
    uint256 internal constant Q_M_Y_LOC = 0x1080;
    uint256 internal constant Q_C_X_LOC = 0x10a0;
    uint256 internal constant Q_C_Y_LOC = 0x10c0;
    uint256 internal constant Q_L_X_LOC = 0x10e0;
    uint256 internal constant Q_L_Y_LOC = 0x1100;
    uint256 internal constant Q_R_X_LOC = 0x1120;
    uint256 internal constant Q_R_Y_LOC = 0x1140;
    uint256 internal constant Q_O_X_LOC = 0x1160;
    uint256 internal constant Q_O_Y_LOC = 0x1180;
    uint256 internal constant Q_4_X_LOC = 0x11a0;
    uint256 internal constant Q_4_Y_LOC = 0x11c0;
    uint256 internal constant Q_LOOKUP_X_LOC = 0x11e0;
    uint256 internal constant Q_LOOKUP_Y_LOC = 0x1200;
    uint256 internal constant Q_ARITH_X_LOC = 0x1220;
    uint256 internal constant Q_ARITH_Y_LOC = 0x1240;
    uint256 internal constant Q_DELTA_RANGE_X_LOC = 0x1260;
    uint256 internal constant Q_DELTA_RANGE_Y_LOC = 0x1280;
    uint256 internal constant Q_ELLIPTIC_X_LOC = 0x12a0;
    uint256 internal constant Q_ELLIPTIC_Y_LOC = 0x12c0;
    uint256 internal constant Q_MEMORY_X_LOC = 0x12e0;
    uint256 internal constant Q_MEMORY_Y_LOC = 0x1300;
    uint256 internal constant Q_NNF_X_LOC = 0x1320;
    uint256 internal constant Q_NNF_Y_LOC = 0x1340;
    uint256 internal constant Q_POSEIDON_2_EXTERNAL_X_LOC = 0x1360;
    uint256 internal constant Q_POSEIDON_2_EXTERNAL_Y_LOC = 0x1380;
    uint256 internal constant Q_POSEIDON_2_INTERNAL_X_LOC = 0x13a0;
    uint256 internal constant Q_POSEIDON_2_INTERNAL_Y_LOC = 0x13c0;
    uint256 internal constant SIGMA_1_X_LOC = 0x13e0;
    uint256 internal constant SIGMA_1_Y_LOC = 0x1400;
    uint256 internal constant SIGMA_2_X_LOC = 0x1420;
    uint256 internal constant SIGMA_2_Y_LOC = 0x1440;
    uint256 internal constant SIGMA_3_X_LOC = 0x1460;
    uint256 internal constant SIGMA_3_Y_LOC = 0x1480;
    uint256 internal constant SIGMA_4_X_LOC = 0x14a0;
    uint256 internal constant SIGMA_4_Y_LOC = 0x14c0;
    uint256 internal constant ID_1_X_LOC = 0x14e0;
    uint256 internal constant ID_1_Y_LOC = 0x1500;
    uint256 internal constant ID_2_X_LOC = 0x1520;
    uint256 internal constant ID_2_Y_LOC = 0x1540;
    uint256 internal constant ID_3_X_LOC = 0x1560;
    uint256 internal constant ID_3_Y_LOC = 0x1580;
    uint256 internal constant ID_4_X_LOC = 0x15a0;
    uint256 internal constant ID_4_Y_LOC = 0x15c0;
    uint256 internal constant TABLE_1_X_LOC = 0x15e0;
    uint256 internal constant TABLE_1_Y_LOC = 0x1600;
    uint256 internal constant TABLE_2_X_LOC = 0x1620;
    uint256 internal constant TABLE_2_Y_LOC = 0x1640;
    uint256 internal constant TABLE_3_X_LOC = 0x1660;
    uint256 internal constant TABLE_3_Y_LOC = 0x1680;
    uint256 internal constant TABLE_4_X_LOC = 0x16a0;
    uint256 internal constant TABLE_4_Y_LOC = 0x16c0;
    uint256 internal constant LAGRANGE_FIRST_X_LOC = 0x16e0;
    uint256 internal constant LAGRANGE_FIRST_Y_LOC = 0x1700;
    uint256 internal constant LAGRANGE_LAST_X_LOC = 0x1720;
    uint256 internal constant LAGRANGE_LAST_Y_LOC = 0x1740;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                       PROOF INDICIES                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant PAIRING_POINT_0 = 0x1760;
    uint256 internal constant PAIRING_POINT_1 = 0x1780;
    uint256 internal constant PAIRING_POINT_2 = 0x17a0;
    uint256 internal constant PAIRING_POINT_3 = 0x17c0;
    uint256 internal constant PAIRING_POINT_4 = 0x17e0;
    uint256 internal constant PAIRING_POINT_5 = 0x1800;
    uint256 internal constant PAIRING_POINT_6 = 0x1820;
    uint256 internal constant PAIRING_POINT_7 = 0x1840;
    uint256 internal constant PAIRING_POINT_8 = 0x1860;
    uint256 internal constant PAIRING_POINT_9 = 0x1880;
    uint256 internal constant PAIRING_POINT_10 = 0x18a0;
    uint256 internal constant PAIRING_POINT_11 = 0x18c0;
    uint256 internal constant PAIRING_POINT_12 = 0x18e0;
    uint256 internal constant PAIRING_POINT_13 = 0x1900;
    uint256 internal constant PAIRING_POINT_14 = 0x1920;
    uint256 internal constant PAIRING_POINT_15 = 0x1940;
    uint256 internal constant W_L_X_LOC = 0x1960;
    uint256 internal constant W_L_Y_LOC = 0x1980;
    uint256 internal constant W_R_X_LOC = 0x19a0;
    uint256 internal constant W_R_Y_LOC = 0x19c0;
    uint256 internal constant W_O_X_LOC = 0x19e0;
    uint256 internal constant W_O_Y_LOC = 0x1a00;
    uint256 internal constant LOOKUP_READ_COUNTS_X_LOC = 0x1a20;
    uint256 internal constant LOOKUP_READ_COUNTS_Y_LOC = 0x1a40;
    uint256 internal constant LOOKUP_READ_TAGS_X_LOC = 0x1a60;
    uint256 internal constant LOOKUP_READ_TAGS_Y_LOC = 0x1a80;
    uint256 internal constant W_4_X_LOC = 0x1aa0;
    uint256 internal constant W_4_Y_LOC = 0x1ac0;
    uint256 internal constant LOOKUP_INVERSES_X_LOC = 0x1ae0;
    uint256 internal constant LOOKUP_INVERSES_Y_LOC = 0x1b00;
    uint256 internal constant Z_PERM_X_LOC = 0x1b20;
    uint256 internal constant Z_PERM_Y_LOC = 0x1b40;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*           PROOF INDICIES - SUMCHECK UNIVARIATES            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant SUMCHECK_UNIVARIATE_0_0_LOC = 0x1b60;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_1_LOC = 0x1b80;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_2_LOC = 0x1ba0;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_3_LOC = 0x1bc0;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_4_LOC = 0x1be0;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_5_LOC = 0x1c00;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_6_LOC = 0x1c20;
    uint256 internal constant SUMCHECK_UNIVARIATE_0_7_LOC = 0x1c40;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_0_LOC = 0x1c60;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_1_LOC = 0x1c80;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_2_LOC = 0x1ca0;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_3_LOC = 0x1cc0;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_4_LOC = 0x1ce0;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_5_LOC = 0x1d00;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_6_LOC = 0x1d20;
    uint256 internal constant SUMCHECK_UNIVARIATE_1_7_LOC = 0x1d40;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_0_LOC = 0x1d60;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_1_LOC = 0x1d80;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_2_LOC = 0x1da0;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_3_LOC = 0x1dc0;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_4_LOC = 0x1de0;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_5_LOC = 0x1e00;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_6_LOC = 0x1e20;
    uint256 internal constant SUMCHECK_UNIVARIATE_2_7_LOC = 0x1e40;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_0_LOC = 0x1e60;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_1_LOC = 0x1e80;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_2_LOC = 0x1ea0;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_3_LOC = 0x1ec0;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_4_LOC = 0x1ee0;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_5_LOC = 0x1f00;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_6_LOC = 0x1f20;
    uint256 internal constant SUMCHECK_UNIVARIATE_3_7_LOC = 0x1f40;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_0_LOC = 0x1f60;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_1_LOC = 0x1f80;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_2_LOC = 0x1fa0;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_3_LOC = 0x1fc0;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_4_LOC = 0x1fe0;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_5_LOC = 0x2000;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_6_LOC = 0x2020;
    uint256 internal constant SUMCHECK_UNIVARIATE_4_7_LOC = 0x2040;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_0_LOC = 0x2060;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_1_LOC = 0x2080;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_2_LOC = 0x20a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_3_LOC = 0x20c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_4_LOC = 0x20e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_5_LOC = 0x2100;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_6_LOC = 0x2120;
    uint256 internal constant SUMCHECK_UNIVARIATE_5_7_LOC = 0x2140;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_0_LOC = 0x2160;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_1_LOC = 0x2180;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_2_LOC = 0x21a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_3_LOC = 0x21c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_4_LOC = 0x21e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_5_LOC = 0x2200;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_6_LOC = 0x2220;
    uint256 internal constant SUMCHECK_UNIVARIATE_6_7_LOC = 0x2240;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_0_LOC = 0x2260;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_1_LOC = 0x2280;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_2_LOC = 0x22a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_3_LOC = 0x22c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_4_LOC = 0x22e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_5_LOC = 0x2300;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_6_LOC = 0x2320;
    uint256 internal constant SUMCHECK_UNIVARIATE_7_7_LOC = 0x2340;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_0_LOC = 0x2360;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_1_LOC = 0x2380;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_2_LOC = 0x23a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_3_LOC = 0x23c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_4_LOC = 0x23e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_5_LOC = 0x2400;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_6_LOC = 0x2420;
    uint256 internal constant SUMCHECK_UNIVARIATE_8_7_LOC = 0x2440;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_0_LOC = 0x2460;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_1_LOC = 0x2480;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_2_LOC = 0x24a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_3_LOC = 0x24c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_4_LOC = 0x24e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_5_LOC = 0x2500;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_6_LOC = 0x2520;
    uint256 internal constant SUMCHECK_UNIVARIATE_9_7_LOC = 0x2540;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_0_LOC = 0x2560;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_1_LOC = 0x2580;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_2_LOC = 0x25a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_3_LOC = 0x25c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_4_LOC = 0x25e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_5_LOC = 0x2600;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_6_LOC = 0x2620;
    uint256 internal constant SUMCHECK_UNIVARIATE_10_7_LOC = 0x2640;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_0_LOC = 0x2660;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_1_LOC = 0x2680;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_2_LOC = 0x26a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_3_LOC = 0x26c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_4_LOC = 0x26e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_5_LOC = 0x2700;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_6_LOC = 0x2720;
    uint256 internal constant SUMCHECK_UNIVARIATE_11_7_LOC = 0x2740;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_0_LOC = 0x2760;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_1_LOC = 0x2780;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_2_LOC = 0x27a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_3_LOC = 0x27c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_4_LOC = 0x27e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_5_LOC = 0x2800;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_6_LOC = 0x2820;
    uint256 internal constant SUMCHECK_UNIVARIATE_12_7_LOC = 0x2840;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_0_LOC = 0x2860;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_1_LOC = 0x2880;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_2_LOC = 0x28a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_3_LOC = 0x28c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_4_LOC = 0x28e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_5_LOC = 0x2900;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_6_LOC = 0x2920;
    uint256 internal constant SUMCHECK_UNIVARIATE_13_7_LOC = 0x2940;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_0_LOC = 0x2960;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_1_LOC = 0x2980;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_2_LOC = 0x29a0;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_3_LOC = 0x29c0;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_4_LOC = 0x29e0;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_5_LOC = 0x2a00;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_6_LOC = 0x2a20;
    uint256 internal constant SUMCHECK_UNIVARIATE_14_7_LOC = 0x2a40;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*           PROOF INDICIES - SUMCHECK EVALUATIONS            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant QM_EVAL_LOC = 0x2a60;
    uint256 internal constant QC_EVAL_LOC = 0x2a80;
    uint256 internal constant QL_EVAL_LOC = 0x2aa0;
    uint256 internal constant QR_EVAL_LOC = 0x2ac0;
    uint256 internal constant QO_EVAL_LOC = 0x2ae0;
    uint256 internal constant Q4_EVAL_LOC = 0x2b00;
    uint256 internal constant QLOOKUP_EVAL_LOC = 0x2b20;
    uint256 internal constant QARITH_EVAL_LOC = 0x2b40;
    uint256 internal constant QRANGE_EVAL_LOC = 0x2b60;
    uint256 internal constant QELLIPTIC_EVAL_LOC = 0x2b80;
    uint256 internal constant QMEMORY_EVAL_LOC = 0x2ba0;
    uint256 internal constant QNNF_EVAL_LOC = 0x2bc0;
    uint256 internal constant QPOSEIDON2_EXTERNAL_EVAL_LOC = 0x2be0;
    uint256 internal constant QPOSEIDON2_INTERNAL_EVAL_LOC = 0x2c00;
    uint256 internal constant SIGMA1_EVAL_LOC = 0x2c20;
    uint256 internal constant SIGMA2_EVAL_LOC = 0x2c40;
    uint256 internal constant SIGMA3_EVAL_LOC = 0x2c60;
    uint256 internal constant SIGMA4_EVAL_LOC = 0x2c80;
    uint256 internal constant ID1_EVAL_LOC = 0x2ca0;
    uint256 internal constant ID2_EVAL_LOC = 0x2cc0;
    uint256 internal constant ID3_EVAL_LOC = 0x2ce0;
    uint256 internal constant ID4_EVAL_LOC = 0x2d00;
    uint256 internal constant TABLE1_EVAL_LOC = 0x2d20;
    uint256 internal constant TABLE2_EVAL_LOC = 0x2d40;
    uint256 internal constant TABLE3_EVAL_LOC = 0x2d60;
    uint256 internal constant TABLE4_EVAL_LOC = 0x2d80;
    uint256 internal constant LAGRANGE_FIRST_EVAL_LOC = 0x2da0;
    uint256 internal constant LAGRANGE_LAST_EVAL_LOC = 0x2dc0;
    uint256 internal constant W1_EVAL_LOC = 0x2de0;
    uint256 internal constant W2_EVAL_LOC = 0x2e00;
    uint256 internal constant W3_EVAL_LOC = 0x2e20;
    uint256 internal constant W4_EVAL_LOC = 0x2e40;
    uint256 internal constant Z_PERM_EVAL_LOC = 0x2e60;
    uint256 internal constant LOOKUP_INVERSES_EVAL_LOC = 0x2e80;
    uint256 internal constant LOOKUP_READ_COUNTS_EVAL_LOC = 0x2ea0;
    uint256 internal constant LOOKUP_READ_TAGS_EVAL_LOC = 0x2ec0;
    uint256 internal constant W1_SHIFT_EVAL_LOC = 0x2ee0;
    uint256 internal constant W2_SHIFT_EVAL_LOC = 0x2f00;
    uint256 internal constant W3_SHIFT_EVAL_LOC = 0x2f20;
    uint256 internal constant W4_SHIFT_EVAL_LOC = 0x2f40;
    uint256 internal constant Z_PERM_SHIFT_EVAL_LOC = 0x2f60;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*           PROOF INDICIES - GEMINI FOLDING COMMS            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_0_X_LOC = 0x2f80;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_0_Y_LOC = 0x2fa0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_1_X_LOC = 0x2fc0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_1_Y_LOC = 0x2fe0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_2_X_LOC = 0x3000;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_2_Y_LOC = 0x3020;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_3_X_LOC = 0x3040;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_3_Y_LOC = 0x3060;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_4_X_LOC = 0x3080;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_4_Y_LOC = 0x30a0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_5_X_LOC = 0x30c0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_5_Y_LOC = 0x30e0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_6_X_LOC = 0x3100;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_6_Y_LOC = 0x3120;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_7_X_LOC = 0x3140;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_7_Y_LOC = 0x3160;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_8_X_LOC = 0x3180;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_8_Y_LOC = 0x31a0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_9_X_LOC = 0x31c0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_9_Y_LOC = 0x31e0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_10_X_LOC = 0x3200;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_10_Y_LOC = 0x3220;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_11_X_LOC = 0x3240;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_11_Y_LOC = 0x3260;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_12_X_LOC = 0x3280;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_12_Y_LOC = 0x32a0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_13_X_LOC = 0x32c0;
    uint256 internal constant GEMINI_FOLD_UNIVARIATE_13_Y_LOC = 0x32e0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*        PROOF INDICIES - GEMINI FOLDING EVALUATIONS         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant GEMINI_A_EVAL_0 = 0x3300;
    uint256 internal constant GEMINI_A_EVAL_1 = 0x3320;
    uint256 internal constant GEMINI_A_EVAL_2 = 0x3340;
    uint256 internal constant GEMINI_A_EVAL_3 = 0x3360;
    uint256 internal constant GEMINI_A_EVAL_4 = 0x3380;
    uint256 internal constant GEMINI_A_EVAL_5 = 0x33a0;
    uint256 internal constant GEMINI_A_EVAL_6 = 0x33c0;
    uint256 internal constant GEMINI_A_EVAL_7 = 0x33e0;
    uint256 internal constant GEMINI_A_EVAL_8 = 0x3400;
    uint256 internal constant GEMINI_A_EVAL_9 = 0x3420;
    uint256 internal constant GEMINI_A_EVAL_10 = 0x3440;
    uint256 internal constant GEMINI_A_EVAL_11 = 0x3460;
    uint256 internal constant GEMINI_A_EVAL_12 = 0x3480;
    uint256 internal constant GEMINI_A_EVAL_13 = 0x34a0;
    uint256 internal constant GEMINI_A_EVAL_14 = 0x34c0;
    uint256 internal constant SHPLONK_Q_X_LOC = 0x34e0;
    uint256 internal constant SHPLONK_Q_Y_LOC = 0x3500;
    uint256 internal constant KZG_QUOTIENT_X_LOC = 0x3520;
    uint256 internal constant KZG_QUOTIENT_Y_LOC = 0x3540;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                 PROOF INDICIES - COMPLETE                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         CHALLENGES                         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant ETA_CHALLENGE = 0x3560;
    uint256 internal constant ETA_TWO_CHALLENGE = 0x3580;
    uint256 internal constant ETA_THREE_CHALLENGE = 0x35a0;
    uint256 internal constant BETA_CHALLENGE = 0x35c0;
    uint256 internal constant GAMMA_CHALLENGE = 0x35e0;
    uint256 internal constant RHO_CHALLENGE = 0x3600;
    uint256 internal constant GEMINI_R_CHALLENGE = 0x3620;
    uint256 internal constant SHPLONK_NU_CHALLENGE = 0x3640;
    uint256 internal constant SHPLONK_Z_CHALLENGE = 0x3660;
    uint256 internal constant PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE = 0x3680;
    uint256 internal constant PUBLIC_INPUTS_DELTA_DENOMINATOR_CHALLENGE = 0x36a0;
    uint256 internal constant ALPHA_CHALLENGE_0 = 0x36c0;
    uint256 internal constant ALPHA_CHALLENGE_1 = 0x36e0;
    uint256 internal constant ALPHA_CHALLENGE_2 = 0x3700;
    uint256 internal constant ALPHA_CHALLENGE_3 = 0x3720;
    uint256 internal constant ALPHA_CHALLENGE_4 = 0x3740;
    uint256 internal constant ALPHA_CHALLENGE_5 = 0x3760;
    uint256 internal constant ALPHA_CHALLENGE_6 = 0x3780;
    uint256 internal constant ALPHA_CHALLENGE_7 = 0x37a0;
    uint256 internal constant ALPHA_CHALLENGE_8 = 0x37c0;
    uint256 internal constant ALPHA_CHALLENGE_9 = 0x37e0;
    uint256 internal constant ALPHA_CHALLENGE_10 = 0x3800;
    uint256 internal constant ALPHA_CHALLENGE_11 = 0x3820;
    uint256 internal constant ALPHA_CHALLENGE_12 = 0x3840;
    uint256 internal constant ALPHA_CHALLENGE_13 = 0x3860;
    uint256 internal constant ALPHA_CHALLENGE_14 = 0x3880;
    uint256 internal constant ALPHA_CHALLENGE_15 = 0x38a0;
    uint256 internal constant ALPHA_CHALLENGE_16 = 0x38c0;
    uint256 internal constant ALPHA_CHALLENGE_17 = 0x38e0;
    uint256 internal constant ALPHA_CHALLENGE_18 = 0x3900;
    uint256 internal constant ALPHA_CHALLENGE_19 = 0x3920;
    uint256 internal constant ALPHA_CHALLENGE_20 = 0x3940;
    uint256 internal constant ALPHA_CHALLENGE_21 = 0x3960;
    uint256 internal constant ALPHA_CHALLENGE_22 = 0x3980;
    uint256 internal constant ALPHA_CHALLENGE_23 = 0x39a0;
    uint256 internal constant ALPHA_CHALLENGE_24 = 0x39c0;
    uint256 internal constant ALPHA_CHALLENGE_25 = 0x39e0;
    uint256 internal constant ALPHA_CHALLENGE_26 = 0x3a00;
    uint256 internal constant GATE_CHALLENGE_0 = 0x3a20;
    uint256 internal constant GATE_CHALLENGE_1 = 0x3a40;
    uint256 internal constant GATE_CHALLENGE_2 = 0x3a60;
    uint256 internal constant GATE_CHALLENGE_3 = 0x3a80;
    uint256 internal constant GATE_CHALLENGE_4 = 0x3aa0;
    uint256 internal constant GATE_CHALLENGE_5 = 0x3ac0;
    uint256 internal constant GATE_CHALLENGE_6 = 0x3ae0;
    uint256 internal constant GATE_CHALLENGE_7 = 0x3b00;
    uint256 internal constant GATE_CHALLENGE_8 = 0x3b20;
    uint256 internal constant GATE_CHALLENGE_9 = 0x3b40;
    uint256 internal constant GATE_CHALLENGE_10 = 0x3b60;
    uint256 internal constant GATE_CHALLENGE_11 = 0x3b80;
    uint256 internal constant GATE_CHALLENGE_12 = 0x3ba0;
    uint256 internal constant GATE_CHALLENGE_13 = 0x3bc0;
    uint256 internal constant GATE_CHALLENGE_14 = 0x3be0;
    uint256 internal constant SUM_U_CHALLENGE_0 = 0x3c00;
    uint256 internal constant SUM_U_CHALLENGE_1 = 0x3c20;
    uint256 internal constant SUM_U_CHALLENGE_2 = 0x3c40;
    uint256 internal constant SUM_U_CHALLENGE_3 = 0x3c60;
    uint256 internal constant SUM_U_CHALLENGE_4 = 0x3c80;
    uint256 internal constant SUM_U_CHALLENGE_5 = 0x3ca0;
    uint256 internal constant SUM_U_CHALLENGE_6 = 0x3cc0;
    uint256 internal constant SUM_U_CHALLENGE_7 = 0x3ce0;
    uint256 internal constant SUM_U_CHALLENGE_8 = 0x3d00;
    uint256 internal constant SUM_U_CHALLENGE_9 = 0x3d20;
    uint256 internal constant SUM_U_CHALLENGE_10 = 0x3d40;
    uint256 internal constant SUM_U_CHALLENGE_11 = 0x3d60;
    uint256 internal constant SUM_U_CHALLENGE_12 = 0x3d80;
    uint256 internal constant SUM_U_CHALLENGE_13 = 0x3da0;
    uint256 internal constant SUM_U_CHALLENGE_14 = 0x3dc0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                   CHALLENGES - COMPLETE                    */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                 SUMCHECK - RUNTIME MEMORY                  */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*          SUMCHECK - RUNTIME MEMORY - BARYCENTRIC           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC = 0x100;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_1_LOC = 0x120;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_2_LOC = 0x140;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_3_LOC = 0x160;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_4_LOC = 0x180;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_5_LOC = 0x1a0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_6_LOC = 0x1c0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATOR_7_LOC = 0x1e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_0_LOC = 0x200;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_1_LOC = 0x220;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_2_LOC = 0x240;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_3_LOC = 0x260;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_4_LOC = 0x280;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_5_LOC = 0x2a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_6_LOC = 0x2c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_0_7_LOC = 0x2e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_0_LOC = 0x300;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_1_LOC = 0x320;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_2_LOC = 0x340;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_3_LOC = 0x360;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_4_LOC = 0x380;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_5_LOC = 0x3a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_6_LOC = 0x3c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_7_LOC = 0x3e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_0_LOC = 0x400;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_1_LOC = 0x420;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_2_LOC = 0x440;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_3_LOC = 0x460;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_4_LOC = 0x480;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_5_LOC = 0x4a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_6_LOC = 0x4c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_7_LOC = 0x4e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_0_LOC = 0x500;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_1_LOC = 0x520;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_2_LOC = 0x540;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_3_LOC = 0x560;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_4_LOC = 0x580;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_5_LOC = 0x5a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_6_LOC = 0x5c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_7_LOC = 0x5e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_0_LOC = 0x600;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_1_LOC = 0x620;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_2_LOC = 0x640;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_3_LOC = 0x660;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_4_LOC = 0x680;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_5_LOC = 0x6a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_6_LOC = 0x6c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_7_LOC = 0x6e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_0_LOC = 0x700;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_1_LOC = 0x720;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_2_LOC = 0x740;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_3_LOC = 0x760;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_4_LOC = 0x780;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_5_LOC = 0x7a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_6_LOC = 0x7c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_7_LOC = 0x7e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_0_LOC = 0x800;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_1_LOC = 0x820;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_2_LOC = 0x840;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_3_LOC = 0x860;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_4_LOC = 0x880;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_5_LOC = 0x8a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_6_LOC = 0x8c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_7_LOC = 0x8e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_0_LOC = 0x900;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_1_LOC = 0x920;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_2_LOC = 0x940;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_3_LOC = 0x960;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_4_LOC = 0x980;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_5_LOC = 0x9a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_6_LOC = 0x9c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_7_LOC = 0x9e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_0_LOC = 0xa00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_1_LOC = 0xa20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_2_LOC = 0xa40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_3_LOC = 0xa60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_4_LOC = 0xa80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_5_LOC = 0xaa0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_6_LOC = 0xac0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_8_7_LOC = 0xae0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_0_LOC = 0xb00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_1_LOC = 0xb20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_2_LOC = 0xb40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_3_LOC = 0xb60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_4_LOC = 0xb80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_5_LOC = 0xba0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_6_LOC = 0xbc0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_9_7_LOC = 0xbe0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_0_LOC = 0xc00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_1_LOC = 0xc20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_2_LOC = 0xc40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_3_LOC = 0xc60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_4_LOC = 0xc80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_5_LOC = 0xca0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_6_LOC = 0xcc0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_10_7_LOC = 0xce0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_0_LOC = 0xd00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_1_LOC = 0xd20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_2_LOC = 0xd40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_3_LOC = 0xd60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_4_LOC = 0xd80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_5_LOC = 0xda0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_6_LOC = 0xdc0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_11_7_LOC = 0xde0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_0_LOC = 0xe00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_1_LOC = 0xe20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_2_LOC = 0xe40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_3_LOC = 0xe60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_4_LOC = 0xe80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_5_LOC = 0xea0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_6_LOC = 0xec0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_12_7_LOC = 0xee0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_0_LOC = 0xf00;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_1_LOC = 0xf20;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_2_LOC = 0xf40;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_3_LOC = 0xf60;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_4_LOC = 0xf80;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_5_LOC = 0xfa0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_6_LOC = 0xfc0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_13_7_LOC = 0xfe0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_0_LOC = 0x1000;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_1_LOC = 0x1020;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_2_LOC = 0x1040;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_3_LOC = 0x1060;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_4_LOC = 0x1080;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_5_LOC = 0x10a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_6_LOC = 0x10c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_14_7_LOC = 0x10e0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*      SUMCHECK - RUNTIME MEMORY - BARYCENTRIC COMPLETE      */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*    SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS     */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant SUBRELATION_EVAL_0_LOC = 0x3de0;
    uint256 internal constant SUBRELATION_EVAL_1_LOC = 0x3e00;
    uint256 internal constant SUBRELATION_EVAL_2_LOC = 0x3e20;
    uint256 internal constant SUBRELATION_EVAL_3_LOC = 0x3e40;
    uint256 internal constant SUBRELATION_EVAL_4_LOC = 0x3e60;
    uint256 internal constant SUBRELATION_EVAL_5_LOC = 0x3e80;
    uint256 internal constant SUBRELATION_EVAL_6_LOC = 0x3ea0;
    uint256 internal constant SUBRELATION_EVAL_7_LOC = 0x3ec0;
    uint256 internal constant SUBRELATION_EVAL_8_LOC = 0x3ee0;
    uint256 internal constant SUBRELATION_EVAL_9_LOC = 0x3f00;
    uint256 internal constant SUBRELATION_EVAL_10_LOC = 0x3f20;
    uint256 internal constant SUBRELATION_EVAL_11_LOC = 0x3f40;
    uint256 internal constant SUBRELATION_EVAL_12_LOC = 0x3f60;
    uint256 internal constant SUBRELATION_EVAL_13_LOC = 0x3f80;
    uint256 internal constant SUBRELATION_EVAL_14_LOC = 0x3fa0;
    uint256 internal constant SUBRELATION_EVAL_15_LOC = 0x3fc0;
    uint256 internal constant SUBRELATION_EVAL_16_LOC = 0x3fe0;
    uint256 internal constant SUBRELATION_EVAL_17_LOC = 0x4000;
    uint256 internal constant SUBRELATION_EVAL_18_LOC = 0x4020;
    uint256 internal constant SUBRELATION_EVAL_19_LOC = 0x4040;
    uint256 internal constant SUBRELATION_EVAL_20_LOC = 0x4060;
    uint256 internal constant SUBRELATION_EVAL_21_LOC = 0x4080;
    uint256 internal constant SUBRELATION_EVAL_22_LOC = 0x40a0;
    uint256 internal constant SUBRELATION_EVAL_23_LOC = 0x40c0;
    uint256 internal constant SUBRELATION_EVAL_24_LOC = 0x40e0;
    uint256 internal constant SUBRELATION_EVAL_25_LOC = 0x4100;
    uint256 internal constant SUBRELATION_EVAL_26_LOC = 0x4120;
    uint256 internal constant SUBRELATION_EVAL_27_LOC = 0x4140;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS COMPLETE*/
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*   SUMCHECK - RUNTIME MEMORY - SUBRELATION INTERMEDIATES    */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant FINAL_ROUND_TARGET_LOC = 0x4160;
    uint256 internal constant POW_PARTIAL_EVALUATION_LOC = 0x4180;
    uint256 internal constant AUX_NON_NATIVE_FIELD_IDENTITY = 0x41a0;
    uint256 internal constant AUX_LIMB_ACCUMULATOR_IDENTITY = 0x41c0;
    uint256 internal constant AUX_RAM_CONSISTENCY_CHECK_IDENTITY = 0x41e0;
    uint256 internal constant AUX_ROM_CONSISTENCY_CHECK_IDENTITY = 0x4200;
    uint256 internal constant AUX_MEMORY_CHECK_IDENTITY = 0x4220;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*            SUMCHECK - RUNTIME MEMORY - COMPLETE            */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                 SHPLEMINI - RUNTIME MEMORY                 */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*         SHPLEMINI - POWERS OF EVALUATION CHALLENGE         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_0_LOC = 0x4240;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_1_LOC = 0x4260;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_2_LOC = 0x4280;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_3_LOC = 0x42a0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_4_LOC = 0x42c0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_5_LOC = 0x42e0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_6_LOC = 0x4300;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_7_LOC = 0x4320;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_8_LOC = 0x4340;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_9_LOC = 0x4360;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_10_LOC = 0x4380;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_11_LOC = 0x43a0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_12_LOC = 0x43c0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_13_LOC = 0x43e0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_14_LOC = 0x4400;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*    SHPLEMINI - POWERS OF EVALUATION CHALLENGE COMPLETE     */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*         SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS         */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant BATCH_SCALAR_0_LOC = 0x4420;
    uint256 internal constant BATCH_SCALAR_1_LOC = 0x4440;
    uint256 internal constant BATCH_SCALAR_2_LOC = 0x4460;
    uint256 internal constant BATCH_SCALAR_3_LOC = 0x4480;
    uint256 internal constant BATCH_SCALAR_4_LOC = 0x44a0;
    uint256 internal constant BATCH_SCALAR_5_LOC = 0x44c0;
    uint256 internal constant BATCH_SCALAR_6_LOC = 0x44e0;
    uint256 internal constant BATCH_SCALAR_7_LOC = 0x4500;
    uint256 internal constant BATCH_SCALAR_8_LOC = 0x4520;
    uint256 internal constant BATCH_SCALAR_9_LOC = 0x4540;
    uint256 internal constant BATCH_SCALAR_10_LOC = 0x4560;
    uint256 internal constant BATCH_SCALAR_11_LOC = 0x4580;
    uint256 internal constant BATCH_SCALAR_12_LOC = 0x45a0;
    uint256 internal constant BATCH_SCALAR_13_LOC = 0x45c0;
    uint256 internal constant BATCH_SCALAR_14_LOC = 0x45e0;
    uint256 internal constant BATCH_SCALAR_15_LOC = 0x4600;
    uint256 internal constant BATCH_SCALAR_16_LOC = 0x4620;
    uint256 internal constant BATCH_SCALAR_17_LOC = 0x4640;
    uint256 internal constant BATCH_SCALAR_18_LOC = 0x4660;
    uint256 internal constant BATCH_SCALAR_19_LOC = 0x4680;
    uint256 internal constant BATCH_SCALAR_20_LOC = 0x46a0;
    uint256 internal constant BATCH_SCALAR_21_LOC = 0x46c0;
    uint256 internal constant BATCH_SCALAR_22_LOC = 0x46e0;
    uint256 internal constant BATCH_SCALAR_23_LOC = 0x4700;
    uint256 internal constant BATCH_SCALAR_24_LOC = 0x4720;
    uint256 internal constant BATCH_SCALAR_25_LOC = 0x4740;
    uint256 internal constant BATCH_SCALAR_26_LOC = 0x4760;
    uint256 internal constant BATCH_SCALAR_27_LOC = 0x4780;
    uint256 internal constant BATCH_SCALAR_28_LOC = 0x47a0;
    uint256 internal constant BATCH_SCALAR_29_LOC = 0x47c0;
    uint256 internal constant BATCH_SCALAR_30_LOC = 0x47e0;
    uint256 internal constant BATCH_SCALAR_31_LOC = 0x4800;
    uint256 internal constant BATCH_SCALAR_32_LOC = 0x4820;
    uint256 internal constant BATCH_SCALAR_33_LOC = 0x4840;
    uint256 internal constant BATCH_SCALAR_34_LOC = 0x4860;
    uint256 internal constant BATCH_SCALAR_35_LOC = 0x4880;
    uint256 internal constant BATCH_SCALAR_36_LOC = 0x48a0;
    uint256 internal constant BATCH_SCALAR_37_LOC = 0x48c0;
    uint256 internal constant BATCH_SCALAR_38_LOC = 0x48e0;
    uint256 internal constant BATCH_SCALAR_39_LOC = 0x4900;
    uint256 internal constant BATCH_SCALAR_40_LOC = 0x4920;
    uint256 internal constant BATCH_SCALAR_41_LOC = 0x4940;
    uint256 internal constant BATCH_SCALAR_42_LOC = 0x4960;
    uint256 internal constant BATCH_SCALAR_43_LOC = 0x4980;
    uint256 internal constant BATCH_SCALAR_44_LOC = 0x49a0;
    uint256 internal constant BATCH_SCALAR_45_LOC = 0x49c0;
    uint256 internal constant BATCH_SCALAR_46_LOC = 0x49e0;
    uint256 internal constant BATCH_SCALAR_47_LOC = 0x4a00;
    uint256 internal constant BATCH_SCALAR_48_LOC = 0x4a20;
    uint256 internal constant BATCH_SCALAR_49_LOC = 0x4a40;
    uint256 internal constant BATCH_SCALAR_50_LOC = 0x4a60;
    uint256 internal constant BATCH_SCALAR_51_LOC = 0x4a80;
    uint256 internal constant BATCH_SCALAR_52_LOC = 0x4aa0;
    uint256 internal constant BATCH_SCALAR_53_LOC = 0x4ac0;
    uint256 internal constant BATCH_SCALAR_54_LOC = 0x4ae0;
    uint256 internal constant BATCH_SCALAR_55_LOC = 0x4b00;
    uint256 internal constant BATCH_SCALAR_56_LOC = 0x4b20;
    uint256 internal constant BATCH_SCALAR_57_LOC = 0x4b40;
    uint256 internal constant BATCH_SCALAR_58_LOC = 0x4b60;
    uint256 internal constant BATCH_SCALAR_59_LOC = 0x4b80;
    uint256 internal constant BATCH_SCALAR_60_LOC = 0x4ba0;
    uint256 internal constant BATCH_SCALAR_61_LOC = 0x4bc0;
    uint256 internal constant BATCH_SCALAR_62_LOC = 0x4be0;
    uint256 internal constant BATCH_SCALAR_63_LOC = 0x4c00;
    uint256 internal constant BATCH_SCALAR_64_LOC = 0x4c20;
    uint256 internal constant BATCH_SCALAR_65_LOC = 0x4c40;
    uint256 internal constant BATCH_SCALAR_66_LOC = 0x4c60;
    uint256 internal constant BATCH_SCALAR_67_LOC = 0x4c80;
    uint256 internal constant BATCH_SCALAR_68_LOC = 0x4ca0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*    SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS COMPLETE     */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*          SHPLEMINI - RUNTIME MEMORY - INVERSIONS           */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_0_LOC = 0x100;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_1_LOC = 0x120;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_2_LOC = 0x140;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_3_LOC = 0x160;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_4_LOC = 0x180;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_5_LOC = 0x1a0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_6_LOC = 0x1c0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_7_LOC = 0x1e0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_8_LOC = 0x200;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_9_LOC = 0x220;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_10_LOC = 0x240;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_11_LOC = 0x260;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_12_LOC = 0x280;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_13_LOC = 0x2a0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_14_LOC = 0x2c0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_15_LOC = 0x2e0;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_0_LOC = 0x300;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_1_LOC = 0x320;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_2_LOC = 0x340;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_3_LOC = 0x360;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_4_LOC = 0x380;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_5_LOC = 0x3a0;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_6_LOC = 0x3c0;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_7_LOC = 0x3e0;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_8_LOC = 0x400;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_9_LOC = 0x420;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_10_LOC = 0x440;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_11_LOC = 0x460;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_12_LOC = 0x480;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_13_LOC = 0x4a0;
    uint256 internal constant BATCH_EVALUATION_ACCUMULATOR_INVERSION_14_LOC = 0x4c0;

    uint256 internal constant BATCHED_EVALUATION_LOC = 0x4e0;
    uint256 internal constant CONSTANT_TERM_ACCUMULATOR_LOC = 0x500;

    uint256 internal constant POS_INVERTED_DENOMINATOR = 0x520;
    uint256 internal constant NEG_INVERTED_DENOMINATOR = 0x540;

    // LOG_N challenge pow minus u
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_0_LOC = 0x560;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_1_LOC = 0x580;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_2_LOC = 0x5a0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_3_LOC = 0x5c0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_4_LOC = 0x5e0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_5_LOC = 0x600;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_6_LOC = 0x620;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_7_LOC = 0x640;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_8_LOC = 0x660;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_9_LOC = 0x680;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_10_LOC = 0x6a0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_11_LOC = 0x6c0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_12_LOC = 0x6e0;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_13_LOC = 0x700;
    uint256 internal constant INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC = 0x720;

    // LOG_N pos_inverted_off
    uint256 internal constant POS_INVERTED_DENOM_0_LOC = 0x740;
    uint256 internal constant POS_INVERTED_DENOM_1_LOC = 0x760;
    uint256 internal constant POS_INVERTED_DENOM_2_LOC = 0x780;
    uint256 internal constant POS_INVERTED_DENOM_3_LOC = 0x7a0;
    uint256 internal constant POS_INVERTED_DENOM_4_LOC = 0x7c0;
    uint256 internal constant POS_INVERTED_DENOM_5_LOC = 0x7e0;
    uint256 internal constant POS_INVERTED_DENOM_6_LOC = 0x800;
    uint256 internal constant POS_INVERTED_DENOM_7_LOC = 0x820;
    uint256 internal constant POS_INVERTED_DENOM_8_LOC = 0x840;
    uint256 internal constant POS_INVERTED_DENOM_9_LOC = 0x860;
    uint256 internal constant POS_INVERTED_DENOM_10_LOC = 0x880;
    uint256 internal constant POS_INVERTED_DENOM_11_LOC = 0x8a0;
    uint256 internal constant POS_INVERTED_DENOM_12_LOC = 0x8c0;
    uint256 internal constant POS_INVERTED_DENOM_13_LOC = 0x8e0;
    uint256 internal constant POS_INVERTED_DENOM_14_LOC = 0x900;

    // LOG_N neg_inverted_off
    uint256 internal constant NEG_INVERTED_DENOM_0_LOC = 0x920;
    uint256 internal constant NEG_INVERTED_DENOM_1_LOC = 0x940;
    uint256 internal constant NEG_INVERTED_DENOM_2_LOC = 0x960;
    uint256 internal constant NEG_INVERTED_DENOM_3_LOC = 0x980;
    uint256 internal constant NEG_INVERTED_DENOM_4_LOC = 0x9a0;
    uint256 internal constant NEG_INVERTED_DENOM_5_LOC = 0x9c0;
    uint256 internal constant NEG_INVERTED_DENOM_6_LOC = 0x9e0;
    uint256 internal constant NEG_INVERTED_DENOM_7_LOC = 0xa00;
    uint256 internal constant NEG_INVERTED_DENOM_8_LOC = 0xa20;
    uint256 internal constant NEG_INVERTED_DENOM_9_LOC = 0xa40;
    uint256 internal constant NEG_INVERTED_DENOM_10_LOC = 0xa60;
    uint256 internal constant NEG_INVERTED_DENOM_11_LOC = 0xa80;
    uint256 internal constant NEG_INVERTED_DENOM_12_LOC = 0xaa0;
    uint256 internal constant NEG_INVERTED_DENOM_13_LOC = 0xac0;
    uint256 internal constant NEG_INVERTED_DENOM_14_LOC = 0xae0;

    uint256 internal constant FOLD_POS_EVALUATIONS_0_LOC = 0xb00;
    uint256 internal constant FOLD_POS_EVALUATIONS_1_LOC = 0xb20;
    uint256 internal constant FOLD_POS_EVALUATIONS_2_LOC = 0xb40;
    uint256 internal constant FOLD_POS_EVALUATIONS_3_LOC = 0xb60;
    uint256 internal constant FOLD_POS_EVALUATIONS_4_LOC = 0xb80;
    uint256 internal constant FOLD_POS_EVALUATIONS_5_LOC = 0xba0;
    uint256 internal constant FOLD_POS_EVALUATIONS_6_LOC = 0xbc0;
    uint256 internal constant FOLD_POS_EVALUATIONS_7_LOC = 0xbe0;
    uint256 internal constant FOLD_POS_EVALUATIONS_8_LOC = 0xc00;
    uint256 internal constant FOLD_POS_EVALUATIONS_9_LOC = 0xc20;
    uint256 internal constant FOLD_POS_EVALUATIONS_10_LOC = 0xc40;
    uint256 internal constant FOLD_POS_EVALUATIONS_11_LOC = 0xc60;
    uint256 internal constant FOLD_POS_EVALUATIONS_12_LOC = 0xc80;
    uint256 internal constant FOLD_POS_EVALUATIONS_13_LOC = 0xca0;
    uint256 internal constant FOLD_POS_EVALUATIONS_14_LOC = 0xcc0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*      SHPLEMINI RUNTIME MEMORY - INVERSIONS - COMPLETE      */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*            SHPLEMINI RUNTIME MEMORY - COMPLETE             */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    uint256 internal constant LATER_SCRATCH_SPACE = 0x4cc0;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                      Temporary space                       */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant TEMP_0_LOC = 0x4ce0;
    uint256 internal constant TEMP_1_LOC = 0x4d00;
    uint256 internal constant TEMP_2_LOC = 0x4d20;
    uint256 internal constant TEMP_3_LOC = 0x4d40;
    uint256 internal constant TEMP_4_LOC = 0x4d60;
    uint256 internal constant TEMP_5_LOC = 0x4d80;
    uint256 internal constant TEMP_6_LOC = 0x4da0;
    uint256 internal constant TEMP_7_LOC = 0x4dc0;
    uint256 internal constant TEMP_8_LOC = 0x4de0;
    uint256 internal constant TEMP_9_LOC = 0x4e00;
    uint256 internal constant TEMP_10_LOC = 0x4e20;
    uint256 internal constant TEMP_11_LOC = 0x4e40;
    uint256 internal constant TEMP_12_LOC = 0x4e60;
    uint256 internal constant TEMP_13_LOC = 0x4e80;
    uint256 internal constant TEMP_14_LOC = 0x4ea0;
    uint256 internal constant TEMP_15_LOC = 0x4ec0;
    uint256 internal constant TEMP_16_LOC = 0x4ee0;
    uint256 internal constant TEMP_17_LOC = 0x4f00;
    uint256 internal constant TEMP_18_LOC = 0x4f20;
    uint256 internal constant TEMP_19_LOC = 0x4f40;
    uint256 internal constant TEMP_20_LOC = 0x4f60;
    uint256 internal constant TEMP_21_LOC = 0x4f80;
    uint256 internal constant TEMP_22_LOC = 0x4fa0;
    uint256 internal constant TEMP_23_LOC = 0x4fc0;
    uint256 internal constant TEMP_24_LOC = 0x4fe0;
    uint256 internal constant TEMP_25_LOC = 0x5000;
    uint256 internal constant TEMP_26_LOC = 0x5020;
    uint256 internal constant TEMP_27_LOC = 0x5040;
    uint256 internal constant TEMP_28_LOC = 0x5060;
    uint256 internal constant TEMP_29_LOC = 0x5080;
    uint256 internal constant TEMP_30_LOC = 0x50a0;
    uint256 internal constant TEMP_31_LOC = 0x50c0;
    uint256 internal constant TEMP_32_LOC = 0x50e0;
    uint256 internal constant TEMP_33_LOC = 0x5100;
    uint256 internal constant TEMP_34_LOC = 0x5120;
    uint256 internal constant TEMP_35_LOC = 0x5140;
    uint256 internal constant TEMP_36_LOC = 0x5160;
    uint256 internal constant TEMP_37_LOC = 0x5180;
    uint256 internal constant TEMP_38_LOC = 0x51a0;
    uint256 internal constant TEMP_39_LOC = 0x51c0;
    uint256 internal constant TEMP_40_LOC = 0x51e0;
    uint256 internal constant TEMP_41_LOC = 0x5200;
    uint256 internal constant TEMP_42_LOC = 0x5220;
    uint256 internal constant TEMP_43_LOC = 0x5240;
    uint256 internal constant TEMP_44_LOC = 0x5260;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                 Temporary space - COMPLETE                 */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

    // Aliases for scratch space
    uint256 internal constant CHALL_POW_LOC = 0x0;
    uint256 internal constant SUMCHECK_U_LOC = 0x20;
    uint256 internal constant GEMINI_A_LOC = 0x40;

    uint256 internal constant SS_POS_INV_DENOM_LOC = 0x0;
    uint256 internal constant SS_NEG_INV_DENOM_LOC = 0x20;
    uint256 internal constant SS_GEMINI_EVALS_LOC = 0x40;
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
    uint256 internal constant LIMB_SIZE = 0x100000000000000000; // 2<<68

    // In the Delta Range Check Relation, there is a range checking relation that can validate 14-bit range checks with only 1
    // extra relation in the execution trace.
    // For large range checks, we decompose them into a collection of 14-bit range checks.
    uint256 internal constant SUBLIMB_SHIFT = 0x4000; // 2<<14

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
    // Shifted columns are columes that are duplicates of existing columns but right-shifted by 1
    uint256 internal constant NUMBER_OF_SHIFTED_ENTITIES = 5;
    uint256 internal constant TOTAL_NUMBER_OF_ENTITIES = 41;

    // Constants for performing batch multiplication
    uint256 internal constant ACCUMULATOR = 0x00;
    uint256 internal constant ACCUMULATOR_2 = 0x40;
    uint256 internal constant G1_LOCATION = 0x60;
    uint256 internal constant G1_Y_LOCATION = 0x80;
    uint256 internal constant SCALAR_LOCATION = 0xa0;

    uint256 internal constant LOWER_128_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    // Group order
    uint256 internal constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order

    // Field order constants
    // -1/2 mod p
    uint256 internal constant NEG_HALF_MODULO_P = 0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000000;
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant P_SUB_1 = 21888242871839275222246405745257275088548364400416034343698204186575808495616;
    uint256 internal constant P_SUB_2 = 21888242871839275222246405745257275088548364400416034343698204186575808495615;
    uint256 internal constant P_SUB_3 = 21888242871839275222246405745257275088548364400416034343698204186575808495614;
    uint256 internal constant P_SUB_4 = 21888242871839275222246405745257275088548364400416034343698204186575808495613;
    uint256 internal constant P_SUB_5 = 21888242871839275222246405745257275088548364400416034343698204186575808495612;
    uint256 internal constant P_SUB_6 = 21888242871839275222246405745257275088548364400416034343698204186575808495611;
    uint256 internal constant P_SUB_7 = 21888242871839275222246405745257275088548364400416034343698204186575808495610;

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
    uint256 constant PERMUTATION_ARGUMENT_VALUE_SEPARATOR = 1 << 28;

    /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
    /*                         ERRORS                             */
    /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
    uint256 internal constant PUBLIC_INPUT_TOO_LARGE_SELECTOR = 0x803bff7c;
    uint256 internal constant SUMCHECK_FAILED_SELECTOR = 0x7d06dd7fa;
    uint256 internal constant PAIRING_FAILED_SELECTOR = 0xd71fd2634;
    uint256 internal constant BATCH_ACCUMULATION_FAILED_SELECTOR = 0xfef01a9a4;
    uint256 internal constant MODEXP_FAILED_SELECTOR = 0xf442f1632;
    uint256 internal constant PROOF_POINT_NOT_ON_CURVE_SELECTOR = 0x661e012dec;

    constructor() {}

    function verify(bytes calldata, /*proof*/ bytes32[] calldata /*public_inputs*/ )
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
                mstore(Q_L_X_LOC, 0x1638b2ed58e539359cbb8efff0c6772b16bfe763ff7d1accf8b7fcfe8a075d5d)
                mstore(Q_L_Y_LOC, 0x2ddbcd8955a1df6ee2906cd36e4ef311e1961ec5fda0ca087aaca85c577de5cc)
                mstore(Q_R_X_LOC, 0x01280c5514168fd87e88e091a5603203d8080dc478fa0b3f2e0deaa890e9fd5d)
                mstore(Q_R_Y_LOC, 0x1e4a39ad59ad54003413ee00477bab5fe3762051eeba5dc63b3e4f964ff15a52)
                mstore(Q_O_X_LOC, 0x11f06709030cf47eba1c2aaae00e3e9619aa13a3fbaa87529e0191a667da2c5b)
                mstore(Q_O_Y_LOC, 0x15cf88cde7933953fcd84ab2eeb3c79d4947900e0b26afa16c9eba652dabfdd1)
                mstore(Q_4_X_LOC, 0x014b3cbcde455a549e385b619b8aad17ed1d0421bc81c529109556f03bf29940)
                mstore(Q_4_Y_LOC, 0x10fa330b0a29195e0b347a60d8bcad917473fb095789aa20b167822a4f4225e9)
                mstore(Q_M_X_LOC, 0x1406d7ba0edad4fa80b4b4f404e92f13e2ebe331836424fa7bd7603f46bfc8f9)
                mstore(Q_M_Y_LOC, 0x1056d68aa1d535848f4d5ab211a31f7bbc0a8a9a1a44ed11cd14c7050c90f36f)
                mstore(Q_C_X_LOC, 0x25ba1402c44ac14024b4b15de30224aae9338edfc35ecc6a067da482a611f370)
                mstore(Q_C_Y_LOC, 0x22150e1f00f02524832dcffce40ad0cfdbcffeda64e09c4e924873e163cc5eb5)
                mstore(Q_LOOKUP_X_LOC, 0x2f52fd71248e5fb7fcda49e0778edcf84065f4c837dc259c99350f66d2756526)
                mstore(Q_LOOKUP_Y_LOC, 0x07f7f722d2341b84f37e028a0993f9ba6eb0539524e258a6666f2149f7edba7e)
                mstore(Q_ARITH_X_LOC, 0x1a843a0cbf7476e7aa05dd1accb04aee33edd30335564760d200d166b81a5a47)
                mstore(Q_ARITH_Y_LOC, 0x0733bd85b240d534e9e7629097af2b0c10a522d02d1a7f0bb4d824bbf53851bc)
                mstore(Q_DELTA_RANGE_X_LOC, 0x207b3d205b5cd89af702e8e4873c9c782b6c4b34bfdcf22c06a4f82ac6115d56)
                mstore(Q_DELTA_RANGE_Y_LOC, 0x16a0ae79403eac677e8a955a15e2f1faf7c3c257ca8875e96c39cf72552df6b1)
                mstore(Q_ELLIPTIC_X_LOC, 0x28941e51374452e59375dc2bcd35f00912cefd71b75b8c9cd5d95670904ba2c1)
                mstore(Q_ELLIPTIC_Y_LOC, 0x28ec61c18d257a28d61716de1b0f901d084acde5c3bc107033fbba7d1e04f96a)
                mstore(Q_MEMORY_X_LOC, 0x19dafffb33c4500bd1dccbcce24081452a6395e26a2de73f3de9dfc5d0db1cab)
                mstore(Q_MEMORY_Y_LOC, 0x251fb355550281ac47fba405fb9a6104197bd12aa80e2907f5d53546b55321df)
                mstore(Q_NNF_X_LOC, 0x26301dc973b5a0af5a50868f91a0cb0b7aab744a7899d1314aaa14abfb87e46e)
                mstore(Q_NNF_Y_LOC, 0x0c70e916551b7b90f0c5bdfc22b07c597e711e8352facb0047bc71aca13c1bdc)
                mstore(Q_POSEIDON_2_EXTERNAL_X_LOC, 0x0e91b34f920c9f2f19a2ed06fa4a24d2be0f53b2cdf01970791d94f137af647f)
                mstore(Q_POSEIDON_2_EXTERNAL_Y_LOC, 0x1cc6301df7aef5d146df4a9b89eacbbbf2630e1d68fe92a66eeaa00c0451063e)
                mstore(Q_POSEIDON_2_INTERNAL_X_LOC, 0x22797c765162fdf33646a9d33db47bbc51aa39ebd4d58e26878505d6baecbf06)
                mstore(Q_POSEIDON_2_INTERNAL_Y_LOC, 0x088d03f1c8b1ce48e40b7441698b6a3279370c3df0e8faa794b9e2c21c0be0e7)
                mstore(SIGMA_1_X_LOC, 0x2a7a70eec6247bd60eafdcabff3b3c3670a86e19cf0ca1eab139e600118afd5f)
                mstore(SIGMA_1_Y_LOC, 0x2f43fac36f4ad55d4b3e90874b80fafa4aef8c792ced507b5cdb34bc67000f57)
                mstore(SIGMA_2_X_LOC, 0x0f3dd01bb4fb96b54de000bc7df04bfd5c96358046619e25358070054b090be3)
                mstore(SIGMA_2_Y_LOC, 0x1114febc90f9dd2bbb962ddc912ad2149f6dd3afccc7c55cfb57bb6939dcf312)
                mstore(SIGMA_3_X_LOC, 0x0f6fe67d35229c76a800fc7d7f7b17d97f1596aabeffe9d32ec739845afdef1d)
                mstore(SIGMA_3_Y_LOC, 0x2e8d96f51c4e5f46e5220fd9c9f356077d8bdbae08ae5ac13431761949064271)
                mstore(SIGMA_4_X_LOC, 0x2532d1d2a00f802b2aa16b9a4f65e5762cff11609a503d582657873c5d1b3bd2)
                mstore(SIGMA_4_Y_LOC, 0x1d795c8bc050f5232ec4632db16e230dea1299f3397794955c18e08615902d28)
                mstore(TABLE_1_X_LOC, 0x2d063c46ff66cce30b90a92ac814ecdb93e8f4881222ee7ce76651bf3ad54e07)
                mstore(TABLE_1_Y_LOC, 0x0215718164a2dbf8fc7da2fcf053b162d84e8703001218f0ad90d1f8d7526ba0)
                mstore(TABLE_2_X_LOC, 0x1bdccd1181f8c909975dd24a69fd1c26ed6e513cd237106bacd9ac5e790374f2)
                mstore(TABLE_2_Y_LOC, 0x1ba438e74f962c1b769f452da854110d0635d48e4d74d282ad06ae0e2830ac91)
                mstore(TABLE_3_X_LOC, 0x20d80d8e50445042431974ff13f53c27c62c17d6d2100faac252917bc2666ac1)
                mstore(TABLE_3_Y_LOC, 0x04bffddce3617713d52791e3344987b29b7c3359a227a03ca26857e813a84278)
                mstore(TABLE_4_X_LOC, 0x2a0724cfe33e0ee4b3f81929ef0cd1da5e113987c9aed1534cca51dae3d9bc2d)
                mstore(TABLE_4_Y_LOC, 0x26983a78aa5c4f3103c7e6128a32f0fae2779a6f0efb2b60facdd09153d403c9)
                mstore(ID_1_X_LOC, 0x26cca178117c77a332dd03c35b7504d40e164f95b2e1c83e66f1105c717b74a8)
                mstore(ID_1_Y_LOC, 0x26c36943eaa28edf962275789f836f48aa98dc56c3009cc5b2a7f6b34b400ed2)
                mstore(ID_2_X_LOC, 0x1ce151bc52077ae1c18d0165e8e905eff9e28b53cfa8d8aa99534b1a4e8cae79)
                mstore(ID_2_Y_LOC, 0x09f386987e8bc8c24683cf2757fa0570a84f30262a0e9b39f3973678e582169a)
                mstore(ID_3_X_LOC, 0x11b0dfcd60a77573e16f9f3c22bd0255a4de9777ca848c827cce82606ff04be8)
                mstore(ID_3_Y_LOC, 0x2cab9289ebddb7919b108fa2c7ff257bebfeded546a64ba87988392355974cef)
                mstore(ID_4_X_LOC, 0x294c0b4872a3c804d129cbfcba96bf3938dae9c337c4f1df6e0c2fa4ab121a8e)
                mstore(ID_4_Y_LOC, 0x1827a12a2960053b705cdfb16dbb1ee4e6e2a24bb0a1942d09d8203ceb6ce1a0)
                mstore(LAGRANGE_FIRST_X_LOC, 0x0000000000000000000000000000000000000000000000000000000000000001)
                mstore(LAGRANGE_FIRST_Y_LOC, 0x0000000000000000000000000000000000000000000000000000000000000002)
                mstore(LAGRANGE_LAST_X_LOC, 0x16b8bb289fe0de3b28e212ae2e1201c47ba39d55d7dbd5e10d67f57c3433bac5)
                mstore(LAGRANGE_LAST_Y_LOC, 0x0653455f179c7df626a5b79bf2694c5ceaf36de7f007a4cfa251305b68b50775)
            }

            // Prime field order - placing on the stack
            let p := P

            {
                let proof_ptr := add(calldataload(0x04), 0x24)

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

                calldatacopy(public_inputs_end, proof_ptr, 0x200)

                // 0x20 * 8 = 0x100
                // End of public inputs + pairing point
                calldatacopy(add(0x220, public_inputs_size), add(proof_ptr, 0x200), 0x100)

                // 0x2e0 = 1 * 32 bytes + 3 * 64 bytes for (w1,w2,w3) + 0x200 for pairing points
                let eta_input_length := add(0x2e0, public_inputs_size)

                let prev_challenge := mod(keccak256(0x00, eta_input_length), p)
                mstore(0x00, prev_challenge)

                let eta := and(prev_challenge, LOWER_128_MASK)
                let etaTwo := shr(128, prev_challenge)

                mstore(ETA_CHALLENGE, eta)
                mstore(ETA_TWO_CHALLENGE, etaTwo)

                prev_challenge := mod(keccak256(0x00, 0x20), p)

                mstore(0x00, prev_challenge)
                let eta_three := and(prev_challenge, LOWER_128_MASK)
                mstore(ETA_THREE_CHALLENGE, eta_three)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                  LOAD PROOF INTO MEMORY                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // As all of our proof points are written in contiguous parts of memory, we call use a single
                // calldatacopy to place all of our proof into the correct memory regions
                // We copy the entire proof into memory as we must hash each proof section for challenge
                // evaluation
                // The last item in the proof, and the first item in the proof (pairing point 0)
                let proof_size := sub(ETA_CHALLENGE, PAIRING_POINT_0)

                calldatacopy(PAIRING_POINT_0, proof_ptr, proof_size)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*             GENERATE BETA and GAMMAA  CHALLENGE            */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                // Generate Beta and Gamma Chalenges
                // - prevChallenge
                // - LOOKUP_READ_COUNTS
                // - LOOKUP_READ_TAGS
                // - W4
                mcopy(0x20, LOOKUP_READ_COUNTS_X_LOC, 0xc0)

                prev_challenge := mod(keccak256(0x00, 0xe0), p)
                mstore(0x00, prev_challenge)
                let beta := and(prev_challenge, LOWER_128_MASK)
                let gamma := shr(128, prev_challenge)

                mstore(BETA_CHALLENGE, beta)
                mstore(GAMMA_CHALLENGE, gamma)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                      ALPHA CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Generate Alpha challenges - non-linearise the gate contributions
                //
                // There are 26 total subrelations in this honk relation, we do not need to non linearise the first sub relation.
                // There are 25 total gate contributions, a gate contribution is analogous to
                // a custom gate, it is an expression which must evaluate to zero for each
                // row in the constraint matrix
                //
                // If we do not non-linearise sub relations, then sub relations which rely
                // on the same wire will interact with each other's sums.

                mcopy(0x20, LOOKUP_INVERSES_X_LOC, 0x80)

                prev_challenge := mod(keccak256(0x00, 0xa0), p)
                mstore(0x00, prev_challenge)
                let alpha_0 := and(prev_challenge, LOWER_128_MASK)
                let alpha_1 := shr(128, prev_challenge)
                mstore(ALPHA_CHALLENGE_0, alpha_0)
                mstore(ALPHA_CHALLENGE_1, alpha_1)

                // For number of alphas / 2 ( 26 /2 )
                let alpha_off_set := ALPHA_CHALLENGE_2
                for {} lt(alpha_off_set, ALPHA_CHALLENGE_26) {} {
                    prev_challenge := mod(keccak256(0x00, 0x20), p)
                    mstore(0x00, prev_challenge)

                    let alpha_even := and(prev_challenge, LOWER_128_MASK)
                    let alpha_odd := shr(128, prev_challenge)

                    mstore(alpha_off_set, alpha_even)
                    mstore(add(alpha_off_set, 0x20), alpha_odd)

                    alpha_off_set := add(alpha_off_set, 0x40)
                }

                // The final alpha challenge
                prev_challenge := mod(keccak256(0x00, 0x20), p)
                mstore(0x00, prev_challenge)

                let alpha_26 := and(prev_challenge, LOWER_128_MASK)
                mstore(ALPHA_CHALLENGE_26, alpha_26)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                       GATE CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                // Store the first gate challenge
                prev_challenge := mod(keccak256(0x00, 0x20), p)
                mstore(0x00, prev_challenge)
                let gate_challenge := and(prev_challenge, LOWER_128_MASK)
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
                for {} lt(read_off, QM_EVAL_LOC) {} {
                    // Increase by 20 * batched relation length (8)
                    // 0x20 * 0x8 = 0x100
                    mcopy(0x20, read_off, 0x100)

                    // Hash 0x100 + 0x20 (prev hash) = 0x120
                    prev_challenge := mod(keccak256(0x00, 0x120), p)
                    mstore(0x00, prev_challenge)

                    let sumcheck_u_challenge := and(prev_challenge, LOWER_128_MASK)
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
                mcopy(0x20, QM_EVAL_LOC, 0x520)
                prev_challenge := mod(keccak256(0x00, 0x540), p)
                mstore(0x00, prev_challenge)

                let rho := and(prev_challenge, LOWER_128_MASK)

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

                mcopy(0x20, GEMINI_FOLD_UNIVARIATE_0_X_LOC, 0x380)

                prev_challenge := mod(keccak256(0x00, 0x3a0), p)
                mstore(0x00, prev_challenge)

                let geminiR := and(prev_challenge, LOWER_128_MASK)

                mstore(GEMINI_R_CHALLENGE, geminiR)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK NU CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The shplonk nu challenge hashes the evaluations of the above gemini univariates
                // 0x20 * logN = 0x20 * 15 = 0x1e0

                mcopy(0x20, GEMINI_A_EVAL_0, 0x1e0)
                prev_challenge := mod(keccak256(0x00, 0x200), p)
                mstore(0x00, prev_challenge)

                let shplonkNu := and(prev_challenge, LOWER_128_MASK)
                mstore(SHPLONK_NU_CHALLENGE, shplonkNu)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK Z CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Generate Shplonk Z
                // Hash of the single shplonk Q commitment
                mcopy(0x20, SHPLONK_Q_X_LOC, 0x40)
                prev_challenge := mod(keccak256(0x00, 0x60), p)

                let shplonkZ := and(prev_challenge, LOWER_128_MASK)
                mstore(SHPLONK_Z_CHALLENGE, shplonkZ)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                     CHALLENGES COMPLETE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            }

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                     PUBLIC INPUT DELTA                     */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            /**
             * Generate public inputa delta
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
                // demonimator_acc = gamma - (beta * (offset + 1))
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

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*           PUBLIC INPUT DELTA - Pairing points accum        */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Pairing points contribution to public inputs delta
                let pairing_points_ptr := PAIRING_POINT_0
                for {} lt(pairing_points_ptr, W_L_X_LOC) { pairing_points_ptr := add(pairing_points_ptr, 0x20) } {
                    let input := mload(pairing_points_ptr)

                    numerator_value := mulmod(numerator_value, addmod(numerator_acc, input, p_clone), p_clone)
                    denominator_value := mulmod(denominator_value, addmod(denominator_acc, input, p_clone), p_clone)

                    numerator_acc := addmod(numerator_acc, beta, p_clone)
                    denominator_acc := addmod(denominator_acc, sub(p_clone, beta), p_clone)
                }

                // Revert if not all public inputs are field elements (i.e. < p)
                if iszero(valid_inputs) {
                    mstore(0x00, PUBLIC_INPUT_TOO_LARGE_SELECTOR)
                    revert(0x00, 0x04)
                }

                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE, numerator_value)
                mstore(PUBLIC_INPUTS_DELTA_DENOMINATOR_CHALLENGE, denominator_value)

                // TODO: batch with barycentric inverses
                let dom_inverse := 0
                {
                    mstore(0, 0x20)
                    mstore(0x20, 0x20)
                    mstore(0x40, 0x20)
                    mstore(0x60, denominator_value)
                    mstore(0x80, P_SUB_2)
                    mstore(0xa0, p)
                    if iszero(staticcall(gas(), 0x05, 0x00, 0xc0, 0x00, 0x20)) {
                        mstore(0x00, MODEXP_FAILED_SELECTOR)
                        revert(0x00, 0x04)
                    }
                    // 1 / (0 . 1 . 2 . 3 . 4 . 5 . 6 . 7)
                    dom_inverse := mload(0x00)
                }
                // Calculate the public inputs delta
                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR_CHALLENGE, mulmod(numerator_value, dom_inverse, p))
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
                    let temp := LATER_SCRATCH_SPACE
                    let bary_centric_inverses_off := BARYCENTRIC_DENOMINATOR_INVERSES_0_0_LOC
                    {
                        let round_challenge_off := SUM_U_CHALLENGE_0
                        for { let round := 0 } lt(round, LOG_N) { round := add(round, 1) } {
                            let round_challenge := mload(round_challenge_off)
                            let bary_lagrange_denominator_off := BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC

                            // Unrolled as this loop as it only has 8 iterations
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
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_1, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 2
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_2, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 3
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_3, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 4
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_4, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 5
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_5, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 6
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_6, p), p)
                                mstore(bary_centric_inverses_off, pre_inv)
                                temp := add(temp, 0x20)
                                mstore(temp, accumulator)
                                accumulator := mulmod(accumulator, pre_inv, p)

                                // increase offsets
                                bary_lagrange_denominator_off := add(bary_lagrange_denominator_off, 0x20)
                                bary_centric_inverses_off := add(bary_centric_inverses_off, 0x20)

                                // barycentric_index = 7
                                bary_lagrange_denominator := mload(bary_lagrange_denominator_off)
                                pre_inv := mulmod(bary_lagrange_denominator, addmod(round_challenge, P_SUB_7, p), p)
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

                    // Invert all of the barycentric denominators as a single batch
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
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_1, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_2, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_3, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_4, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_5, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_6, p), p)
                    numerator_value := mulmod(numerator_value, addmod(round_challenge, P_SUB_7, p), p)

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
                    let gate_challenge_minus_one := sub(gate_challenge, 1)

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
                /*                        LOGUP RELATION                      */
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
                                addmod(q_arith, P_SUB_3, p),
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
                            addmod(q_arith, P_SUB_2, p),
                            addmod(
                                mload(QM_EVAL_LOC),
                                addmod(
                                    sub(p, mload(W1_SHIFT_EVAL_LOC)), addmod(mload(W1_EVAL_LOC), mload(W4_EVAL_LOC), p), p
                                ),
                                p
                            ),
                            p
                        )

                    // Split up the two relations
                    let contribution_0 :=
                        addmod(identity, mulmod(addmod(q_arith, P_SUB_1, p), mload(W4_SHIFT_EVAL_LOC), p), p)
                    contribution_0 := mulmod(mulmod(contribution_0, q_arith, p), mload(POW_PARTIAL_EVALUATION_LOC), p)
                    mstore(SUBRELATION_EVAL_0_LOC, contribution_0)

                    let contribution_1 := mulmod(extra_small_addition_gate_identity, addmod(q_arith, P_SUB_1, p), p)
                    contribution_1 := mulmod(contribution_1, q_arith, p)
                    contribution_1 := mulmod(contribution_1, mload(POW_PARTIAL_EVALUATION_LOC), p)
                    mstore(SUBRELATION_EVAL_1_LOC, contribution_1)
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
                     * t2 = (W2 + gamma + beta * sigma_3_eval) * (W3 + gamma + beta * sigma_4_eval)
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
                    t1 :=
                        mulmod(
                            add(add(mload(W1_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA1_EVAL_LOC), p)),
                            add(add(mload(W2_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA2_EVAL_LOC), p)),
                            p
                        )
                    t2 :=
                        mulmod(
                            add(add(mload(W3_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA3_EVAL_LOC), p)),
                            add(add(mload(W4_EVAL_LOC), gamma), mulmod(beta, mload(SIGMA4_EVAL_LOC), p)),
                            p
                        )
                    let denominator := mulmod(t1, t2, p)

                    {
                        let acc :=
                            mulmod(addmod(mload(Z_PERM_EVAL_LOC), mload(LAGRANGE_FIRST_EVAL_LOC), p), numerator, p)

                        acc :=
                            addmod(
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
                        mstore(SUBRELATION_EVAL_2_LOC, acc)

                        acc :=
                            mulmod(
                                mulmod(mload(LAGRANGE_LAST_EVAL_LOC), mload(Z_PERM_SHIFT_EVAL_LOC), p),
                                mload(POW_PARTIAL_EVALUATION_LOC),
                                p
                            )
                        mstore(SUBRELATION_EVAL_3_LOC, acc)
                    }
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   LOGUP WIDGET EVALUATION                  */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    let eta := mload(ETA_CHALLENGE)
                    let eta_two := mload(ETA_TWO_CHALLENGE)
                    let eta_three := mload(ETA_THREE_CHALLENGE)

                    let beta := mload(BETA_CHALLENGE)
                    let gamma := mload(GAMMA_CHALLENGE)

                    let t0 :=
                        addmod(addmod(mload(TABLE1_EVAL_LOC), gamma, p), mulmod(mload(TABLE2_EVAL_LOC), eta, p), p)
                    let t1 :=
                        addmod(mulmod(mload(TABLE3_EVAL_LOC), eta_two, p), mulmod(mload(TABLE4_EVAL_LOC), eta_three, p), p)
                    let write_term := addmod(t0, t1, p)

                    t0 :=
                        addmod(
                            addmod(mload(W1_EVAL_LOC), gamma, p), mulmod(mload(QR_EVAL_LOC), mload(W1_SHIFT_EVAL_LOC), p), p
                        )
                    t1 := addmod(mload(W2_EVAL_LOC), mulmod(mload(QM_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p), p)
                    let t2 := addmod(mload(W3_EVAL_LOC), mulmod(mload(QC_EVAL_LOC), mload(W3_SHIFT_EVAL_LOC), p), p)

                    let read_term := addmod(t0, mulmod(t1, eta, p), p)
                    read_term := addmod(read_term, mulmod(t2, eta_two, p), p)
                    read_term := addmod(read_term, mulmod(mload(QO_EVAL_LOC), eta_three, p), p)

                    let read_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), write_term, p)
                    let write_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), read_term, p)

                    let inverse_exists_xor := addmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)
                    inverse_exists_xor :=
                        addmod(
                            inverse_exists_xor,
                            sub(p, mulmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)),
                            p
                        )

                    let accumulator_none := mulmod(mulmod(read_term, write_term, p), mload(LOOKUP_INVERSES_EVAL_LOC), p)
                    accumulator_none := addmod(accumulator_none, sub(p, inverse_exists_xor), p)
                    accumulator_none := mulmod(accumulator_none, mload(POW_PARTIAL_EVALUATION_LOC), p)

                    let accumulator_one := mulmod(mload(QLOOKUP_EVAL_LOC), read_inverse, p)
                    accumulator_one :=
                        addmod(accumulator_one, sub(p, mulmod(mload(LOOKUP_READ_COUNTS_EVAL_LOC), write_inverse, p)), p)

                    let read_tag := mload(LOOKUP_READ_TAGS_EVAL_LOC)
                    let read_tag_boolean_relation := mulmod(read_tag, addmod(read_tag, P_SUB_1, p), p)
                    read_tag_boolean_relation := mulmod(read_tag_boolean_relation, mload(POW_PARTIAL_EVALUATION_LOC), p)

                    mstore(SUBRELATION_EVAL_4_LOC, accumulator_none)
                    mstore(SUBRELATION_EVAL_5_LOC, accumulator_one)
                    mstore(SUBRELATION_EVAL_6_LOC, read_tag_boolean_relation)
                }

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                   DELTA RANGE RELATION                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                {
                    // TODO(md): optimise the calculations
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
                        mstore(SUBRELATION_EVAL_7_LOC, acc)
                    }

                    {
                        let acc := delta_2
                        acc := mulmod(acc, addmod(delta_2, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_8_LOC, acc)
                    }

                    {
                        let acc := delta_3
                        acc := mulmod(acc, addmod(delta_3, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_9_LOC, acc)
                    }

                    {
                        let acc := delta_4
                        acc := mulmod(acc, addmod(delta_4, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_10_LOC, acc)
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
                        mstore(SUBRELATION_EVAL_11_LOC, eval)
                    }

                    {
                        let y1_plus_y3 := addmod(mload(EC_Y_1), mload(EC_Y_3), p)
                        let y_diff := mulmod(mload(EC_Y_2), mload(EC_Q_SIGN), p)
                        y_diff := addmod(y_diff, sub(p, mload(EC_Y_1)), p)
                        let y_add_identity := mulmod(y1_plus_y3, x_diff, p)
                        y_add_identity :=
                            addmod(y_add_identity, mulmod(addmod(mload(EC_X_3), sub(p, mload(EC_X_1)), p), y_diff, p), p)

                        let eval := mulmod(y_add_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        eval := mulmod(eval, mload(QELLIPTIC_EVAL_LOC), p)
                        eval := mulmod(eval, addmod(1, sub(p, mload(EC_Q_IS_DOUBLE)), p), p)
                        mstore(SUBRELATION_EVAL_12_LOC, eval)
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
                        acc := addmod(acc, mload(SUBRELATION_EVAL_11_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_11_LOC, acc)
                    }

                    {
                        let x1_sqr_mul_3 :=
                            mulmod(addmod(addmod(mload(EC_X_1), mload(EC_X_1), p), mload(EC_X_1), p), mload(EC_X_1), p)
                        let y_double_identity :=
                            mulmod(x1_sqr_mul_3, addmod(mload(EC_X_1), sub(p, mload(EC_X_3)), p), p)
                        y_double_identity :=
                            addmod(
                                y_double_identity,
                                sub(
                                    p,
                                    mulmod(
                                        addmod(mload(EC_Y_1), mload(EC_Y_1), p), addmod(mload(EC_Y_1), mload(EC_Y_3), p), p
                                    )
                                ),
                                p
                            )

                        let acc := mulmod(y_double_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        acc := mulmod(mulmod(acc, mload(QELLIPTIC_EVAL_LOC), p), mload(EC_Q_IS_DOUBLE), p)
                        acc := addmod(acc, mload(SUBRELATION_EVAL_12_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_12_LOC, acc)
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
                        // TODO(md): update these - formula has changed with lower degree
                        let memory_record_check := mulmod(mload(W3_EVAL_LOC), mload(ETA_THREE_CHALLENGE), p)
                        memory_record_check :=
                            addmod(memory_record_check, mulmod(mload(W2_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p), p)
                        memory_record_check :=
                            addmod(memory_record_check, mulmod(mload(W1_EVAL_LOC), mload(ETA_CHALLENGE), p), p)
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
                            SUBRELATION_EVAL_14_LOC,
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
                            SUBRELATION_EVAL_15_LOC,
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
                            next_gate_access_type :=
                                addmod(
                                    next_gate_access_type, mulmod(mload(W2_SHIFT_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p), p
                                )
                            next_gate_access_type :=
                                addmod(next_gate_access_type, mulmod(mload(W1_SHIFT_EVAL_LOC), mload(ETA_CHALLENGE), p), p)
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
                                SUBRELATION_EVAL_16_LOC,
                                mulmod(
                                    adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation,
                                    scaled_activation_selector,
                                    p
                                )
                            )

                            mstore(
                                SUBRELATION_EVAL_17_LOC,
                                mulmod(index_is_monotonically_increasing, scaled_activation_selector, p)
                            )

                            mstore(
                                SUBRELATION_EVAL_18_LOC,
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
                            memory_identity :=
                                addmod(
                                    memory_identity,
                                    mulmod(
                                        RAM_TIMESTAMP_CHECK_IDENTITY, mulmod(mload(Q4_EVAL_LOC), mload(QL_EVAL_LOC), p), p
                                    ),
                                    p
                                )

                            memory_identity :=
                                addmod(
                                    memory_identity,
                                    mulmod(
                                        mload(AUX_MEMORY_CHECK_IDENTITY),
                                        mulmod(mload(QM_EVAL_LOC), mload(QL_EVAL_LOC), p),
                                        p
                                    ),
                                    p
                                )
                            memory_identity := addmod(memory_identity, mload(AUX_RAM_CONSISTENCY_CHECK_IDENTITY), p)

                            memory_identity :=
                                mulmod(
                                    memory_identity,
                                    mulmod(mload(QMEMORY_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p),
                                    p
                                )
                            mstore(SUBRELATION_EVAL_13_LOC, memory_identity)
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
                     * non_native_field_gate_2 = w_1 * w_4 + w_4 * w_3 - w_3_shift
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
                    limb_subproduct :=
                        addmod(limb_subproduct, mulmod(mload(W1_SHIFT_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p), p)

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
                            addmod(addmod(non_native_field_gate_1, non_native_field_gate_2, p), non_native_field_gate_3, p),
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
                    nnf_identity :=
                        mulmod(nnf_identity, mulmod(mload(QNNF_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p), p)

                    mstore(SUBRELATION_EVAL_19_LOC, nnf_identity)
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
                        SUBRELATION_EVAL_20_LOC,
                        mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_21_LOC,
                        mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_22_LOC,
                        mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p)
                    )

                    mstore(
                        SUBRELATION_EVAL_23_LOC,
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
                        SUBRELATION_EVAL_24_LOC,
                        mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p)
                    )
                    let v2 := addmod(mulmod(u2, POS_INTERNAL_MATRIX_D_1, p), u_sum, p)

                    mstore(
                        SUBRELATION_EVAL_25_LOC,
                        mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p)
                    )
                    let v3 := addmod(mulmod(u3, POS_INTERNAL_MATRIX_D_2, p), u_sum, p)

                    mstore(
                        SUBRELATION_EVAL_26_LOC,
                        mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p)
                    )

                    let v4 := addmod(mulmod(u4, POS_INTERNAL_MATRIX_D_3, p), u_sum, p)
                    mstore(
                        SUBRELATION_EVAL_27_LOC,
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

                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_1_LOC), mload(ALPHA_CHALLENGE_0), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_2_LOC), mload(ALPHA_CHALLENGE_1), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_3_LOC), mload(ALPHA_CHALLENGE_2), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_4_LOC), mload(ALPHA_CHALLENGE_3), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_5_LOC), mload(ALPHA_CHALLENGE_4), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_6_LOC), mload(ALPHA_CHALLENGE_5), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_7_LOC), mload(ALPHA_CHALLENGE_6), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_8_LOC), mload(ALPHA_CHALLENGE_7), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_9_LOC), mload(ALPHA_CHALLENGE_8), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_10_LOC), mload(ALPHA_CHALLENGE_9), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_11_LOC), mload(ALPHA_CHALLENGE_10), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_12_LOC), mload(ALPHA_CHALLENGE_11), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_13_LOC), mload(ALPHA_CHALLENGE_12), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_14_LOC), mload(ALPHA_CHALLENGE_13), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_15_LOC), mload(ALPHA_CHALLENGE_14), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_16_LOC), mload(ALPHA_CHALLENGE_15), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_17_LOC), mload(ALPHA_CHALLENGE_16), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_18_LOC), mload(ALPHA_CHALLENGE_17), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_19_LOC), mload(ALPHA_CHALLENGE_18), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_20_LOC), mload(ALPHA_CHALLENGE_19), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_21_LOC), mload(ALPHA_CHALLENGE_20), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_22_LOC), mload(ALPHA_CHALLENGE_21), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_23_LOC), mload(ALPHA_CHALLENGE_22), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_24_LOC), mload(ALPHA_CHALLENGE_23), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_25_LOC), mload(ALPHA_CHALLENGE_24), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_26_LOC), mload(ALPHA_CHALLENGE_25), p), p)
                accumulator :=
                    addmod(accumulator, mulmod(mload(SUBRELATION_EVAL_27_LOC), mload(ALPHA_CHALLENGE_26), p), p)

                let sumcheck_valid := eq(accumulator, mload(FINAL_ROUND_TARGET_LOC))

                if iszero(sumcheck_valid) {
                    mstore(0x00, SUMCHECK_FAILED_SELECTOR)
                    return(0x00, 0x20)
                }
            }

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                 SUMCHECK -- Complete                       */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                       SHPLEMINI                            */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

            // Compute powers of evaluation challenge
            let cache := mload(GEMINI_R_CHALLENGE)
            let off := POWERS_OF_EVALUATION_CHALLENGE_0_LOC
            mstore(off, cache)

            for { let i := 1 } lt(i, LOG_N) { i := add(i, 1) } {
                off := add(off, 0x20)
                cache := mulmod(cache, cache, p)
                mstore(off, cache)
            }

            // Compute Inverted Gemini Denominators
            let eval_challenge := mload(SHPLONK_Z_CHALLENGE)

            // TO be inverted in the batch invert below
            // TODO: maybe not needed to go in memory
            mstore(
                INVERTED_GEMINI_DENOMINATOR_0_LOC,
                addmod(eval_challenge, sub(p, mload(POWERS_OF_EVALUATION_CHALLENGE_0_LOC)), p)
            )

            mstore(
                POS_INVERTED_DENOM_0_LOC, addmod(eval_challenge, sub(p, mload(POWERS_OF_EVALUATION_CHALLENGE_0_LOC)), p)
            )
            mstore(NEG_INVERTED_DENOM_0_LOC, addmod(eval_challenge, mload(POWERS_OF_EVALUATION_CHALLENGE_0_LOC), p))

            // Compute Fold Pos Evaluatios

            // In order to compute fold pos evaluations we need
            let store_off := INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC
            let pow_off := POWERS_OF_EVALUATION_CHALLENGE_14_LOC
            let sumcheck_u_off := SUM_U_CHALLENGE_14

            // TODO: challengePower * (ONE - u) can be cached - measure performance
            for { let i := LOG_N } gt(i, 0) { i := sub(i, 1) } {
                let u := mload(sumcheck_u_off)

                let challPowerMulMinusU := mulmod(mload(pow_off), addmod(1, sub(p, u), p), p)

                mstore(store_off, addmod(challPowerMulMinusU, u, p))

                store_off := sub(store_off, 0x20)
                pow_off := sub(pow_off, 0x20)
                sumcheck_u_off := sub(sumcheck_u_off, 0x20)
            }

            // Compute
            {
                let pos_inverted_off := POS_INVERTED_DENOM_1_LOC
                let neg_inverted_off := NEG_INVERTED_DENOM_1_LOC
                pow_off := POWERS_OF_EVALUATION_CHALLENGE_1_LOC

                let shplonk_z := mload(SHPLONK_Z_CHALLENGE)
                for { let i := 0 } lt(i, sub(LOG_N, 1)) { i := add(i, 1) } {
                    let pow := mload(pow_off)

                    let pos_inv := addmod(shplonk_z, sub(p, pow), p)
                    mstore(pos_inverted_off, pos_inv)

                    let neg_inv := addmod(shplonk_z, pow, p)
                    mstore(neg_inverted_off, neg_inv)

                    pow_off := add(pow_off, 0x20)
                    pos_inverted_off := add(pos_inverted_off, 0x20)
                    neg_inverted_off := add(neg_inverted_off, 0x20)
                }
            }

            // To be inverted
            // From: computeFoldPosEvaluations
            // Series of challengePower * (ONE - u)
            // gemini r challenge
            // Inverted denominators
            // (shplonkZ - powers of evaluaion challenge[i + 1])
            // (shplonkZ + powers of evaluation challenge[i + 1])

            // Use scratch space for temps

            let accumulator := mload(GEMINI_R_CHALLENGE)

            /// {{ UNROLL_SECTION_START ACCUMULATE_INVERSES }}
            // i = 0
            mstore(TEMP_0_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_0_LOC), p)
            // i = 1
            mstore(TEMP_1_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_1_LOC), p)
            // i = 2
            mstore(TEMP_2_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_2_LOC), p)
            // i = 3
            mstore(TEMP_3_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_3_LOC), p)
            // i = 4
            mstore(TEMP_4_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_4_LOC), p)
            // i = 5
            mstore(TEMP_5_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_5_LOC), p)
            // i = 6
            mstore(TEMP_6_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_6_LOC), p)
            // i = 7
            mstore(TEMP_7_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_7_LOC), p)
            // i = 8
            mstore(TEMP_8_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_8_LOC), p)
            // i = 9
            mstore(TEMP_9_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_9_LOC), p)
            // i = 10
            mstore(TEMP_10_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_10_LOC), p)
            // i = 11
            mstore(TEMP_11_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_11_LOC), p)
            // i = 12
            mstore(TEMP_12_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_12_LOC), p)
            // i = 13
            mstore(TEMP_13_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_13_LOC), p)
            // i = 14
            mstore(TEMP_14_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC), p)

            // Accumulate pos inverted denom
            // i = 0
            mstore(TEMP_15_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_0_LOC), p)
            // i = 1
            mstore(TEMP_16_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_1_LOC), p)
            // i = 2
            mstore(TEMP_17_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_2_LOC), p)
            // i = 3
            mstore(TEMP_18_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_3_LOC), p)
            // i = 4
            mstore(TEMP_19_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_4_LOC), p)
            // i = 5
            mstore(TEMP_20_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_5_LOC), p)
            // i = 6
            mstore(TEMP_21_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_6_LOC), p)
            // i = 7
            mstore(TEMP_22_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_7_LOC), p)
            // i = 8
            mstore(TEMP_23_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_8_LOC), p)
            // i = 9
            mstore(TEMP_24_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_9_LOC), p)
            // i = 10
            mstore(TEMP_25_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_10_LOC), p)
            // i = 11
            mstore(TEMP_26_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_11_LOC), p)
            // i = 12
            mstore(TEMP_27_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_12_LOC), p)
            // i = 13
            mstore(TEMP_28_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_13_LOC), p)
            // i = 14
            mstore(TEMP_29_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_14_LOC), p)

            // Accumulate neg inverted denom
            // i = 0
            mstore(TEMP_30_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_0_LOC), p)
            // i = 1
            mstore(TEMP_31_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_1_LOC), p)
            // i = 2
            mstore(TEMP_32_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_2_LOC), p)
            // i = 3
            mstore(TEMP_33_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_3_LOC), p)
            // i = 4
            mstore(TEMP_34_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_4_LOC), p)
            // i = 5
            mstore(TEMP_35_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_5_LOC), p)
            // i = 6
            mstore(TEMP_36_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_6_LOC), p)
            // i = 7
            mstore(TEMP_37_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_7_LOC), p)
            // i = 8
            mstore(TEMP_38_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_8_LOC), p)
            // i = 9
            mstore(TEMP_39_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_9_LOC), p)
            // i = 10
            mstore(TEMP_40_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_10_LOC), p)
            // i = 11
            mstore(TEMP_41_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_11_LOC), p)
            // i = 12
            mstore(TEMP_42_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_12_LOC), p)
            // i = 13
            mstore(TEMP_43_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_13_LOC), p)
            // i = 14
            mstore(TEMP_44_LOC, accumulator)
            accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_14_LOC), p)
            /// {{UNROLL_SECTION_END ACCUMULATE_INVERSES }}

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
            }

            /// {{ UNROLL_SECTION_START COLLECT_INVERSES }}
            // i = 15
            {
                let tmp := mulmod(accumulator, mload(TEMP_44_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_14_LOC), p)
                mstore(NEG_INVERTED_DENOM_14_LOC, tmp)
            }
            // i = 14
            {
                let tmp := mulmod(accumulator, mload(TEMP_43_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_13_LOC), p)
                mstore(NEG_INVERTED_DENOM_13_LOC, tmp)
            }
            // i = 13
            {
                let tmp := mulmod(accumulator, mload(TEMP_42_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_12_LOC), p)
                mstore(NEG_INVERTED_DENOM_12_LOC, tmp)
            }
            // i = 12
            {
                let tmp := mulmod(accumulator, mload(TEMP_41_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_11_LOC), p)
                mstore(NEG_INVERTED_DENOM_11_LOC, tmp)
            }
            // i = 11
            {
                let tmp := mulmod(accumulator, mload(TEMP_40_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_10_LOC), p)
                mstore(NEG_INVERTED_DENOM_10_LOC, tmp)
            }
            // i = 10
            {
                let tmp := mulmod(accumulator, mload(TEMP_39_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_9_LOC), p)
                mstore(NEG_INVERTED_DENOM_9_LOC, tmp)
            }
            // i = 9
            {
                let tmp := mulmod(accumulator, mload(TEMP_38_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_8_LOC), p)
                mstore(NEG_INVERTED_DENOM_8_LOC, tmp)
            }
            // i = 8
            {
                let tmp := mulmod(accumulator, mload(TEMP_37_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_7_LOC), p)
                mstore(NEG_INVERTED_DENOM_7_LOC, tmp)
            }
            // i = 7
            {
                let tmp := mulmod(accumulator, mload(TEMP_36_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_6_LOC), p)
                mstore(NEG_INVERTED_DENOM_6_LOC, tmp)
            }
            // i = 6
            {
                let tmp := mulmod(accumulator, mload(TEMP_35_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_5_LOC), p)
                mstore(NEG_INVERTED_DENOM_5_LOC, tmp)
            }
            // i = 5
            {
                let tmp := mulmod(accumulator, mload(TEMP_34_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_4_LOC), p)
                mstore(NEG_INVERTED_DENOM_4_LOC, tmp)
            }
            // i = 4
            {
                let tmp := mulmod(accumulator, mload(TEMP_33_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_3_LOC), p)
                mstore(NEG_INVERTED_DENOM_3_LOC, tmp)
            }
            // i = 3
            {
                let tmp := mulmod(accumulator, mload(TEMP_32_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_2_LOC), p)
                mstore(NEG_INVERTED_DENOM_2_LOC, tmp)
            }
            // i = 2
            {
                let tmp := mulmod(accumulator, mload(TEMP_31_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_1_LOC), p)
                mstore(NEG_INVERTED_DENOM_1_LOC, tmp)
            }
            // i = 1
            {
                let tmp := mulmod(accumulator, mload(TEMP_30_LOC), p)
                accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_0_LOC), p)
                mstore(NEG_INVERTED_DENOM_0_LOC, tmp)
            }

            // Unrolled for LOG_N = 15
            // i = 15
            {
                let tmp := mulmod(accumulator, mload(TEMP_29_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_14_LOC), p)
                mstore(POS_INVERTED_DENOM_14_LOC, tmp)
            }
            // i = 14
            {
                let tmp := mulmod(accumulator, mload(TEMP_28_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_13_LOC), p)
                mstore(POS_INVERTED_DENOM_13_LOC, tmp)
            }
            // i = 13
            {
                let tmp := mulmod(accumulator, mload(TEMP_27_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_12_LOC), p)
                mstore(POS_INVERTED_DENOM_12_LOC, tmp)
            }
            // i = 12
            {
                let tmp := mulmod(accumulator, mload(TEMP_26_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_11_LOC), p)
                mstore(POS_INVERTED_DENOM_11_LOC, tmp)
            }
            // i = 11
            {
                let tmp := mulmod(accumulator, mload(TEMP_25_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_10_LOC), p)
                mstore(POS_INVERTED_DENOM_10_LOC, tmp)
            }
            // i = 10
            {
                let tmp := mulmod(accumulator, mload(TEMP_24_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_9_LOC), p)
                mstore(POS_INVERTED_DENOM_9_LOC, tmp)
            }
            // i = 9
            {
                let tmp := mulmod(accumulator, mload(TEMP_23_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_8_LOC), p)
                mstore(POS_INVERTED_DENOM_8_LOC, tmp)
            }
            // i = 8
            {
                let tmp := mulmod(accumulator, mload(TEMP_22_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_7_LOC), p)
                mstore(POS_INVERTED_DENOM_7_LOC, tmp)
            }
            // i = 7
            {
                let tmp := mulmod(accumulator, mload(TEMP_21_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_6_LOC), p)
                mstore(POS_INVERTED_DENOM_6_LOC, tmp)
            }
            // i = 6
            {
                let tmp := mulmod(accumulator, mload(TEMP_20_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_5_LOC), p)
                mstore(POS_INVERTED_DENOM_5_LOC, tmp)
            }
            // i = 5
            {
                let tmp := mulmod(accumulator, mload(TEMP_19_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_4_LOC), p)
                mstore(POS_INVERTED_DENOM_4_LOC, tmp)
            }
            // i = 4
            {
                let tmp := mulmod(accumulator, mload(TEMP_18_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_3_LOC), p)
                mstore(POS_INVERTED_DENOM_3_LOC, tmp)
            }
            // i = 3
            {
                let tmp := mulmod(accumulator, mload(TEMP_17_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_2_LOC), p)
                mstore(POS_INVERTED_DENOM_2_LOC, tmp)
            }
            // i = 2
            {
                let tmp := mulmod(accumulator, mload(TEMP_16_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_1_LOC), p)
                mstore(POS_INVERTED_DENOM_1_LOC, tmp)
            }
            // i = 1
            {
                let tmp := mulmod(accumulator, mload(TEMP_15_LOC), p)
                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_0_LOC), p)
                mstore(POS_INVERTED_DENOM_0_LOC, tmp)
            }

            // Accumulate results
            // i = 15
            {
                let tmp := mulmod(accumulator, mload(TEMP_14_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC, tmp)
            }
            // i = 14
            {
                let tmp := mulmod(accumulator, mload(TEMP_13_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_13_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_13_LOC, tmp)
            }
            // i = 13
            {
                let tmp := mulmod(accumulator, mload(TEMP_12_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_12_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_12_LOC, tmp)
            }
            // i = 12
            {
                let tmp := mulmod(accumulator, mload(TEMP_11_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_11_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_11_LOC, tmp)
            }
            // i = 11
            {
                let tmp := mulmod(accumulator, mload(TEMP_10_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_10_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_10_LOC, tmp)
            }
            // i = 10
            {
                let tmp := mulmod(accumulator, mload(TEMP_9_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_9_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_9_LOC, tmp)
            }
            // i = 9
            {
                let tmp := mulmod(accumulator, mload(TEMP_8_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_8_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_8_LOC, tmp)
            }
            // i = 8
            {
                let tmp := mulmod(accumulator, mload(TEMP_7_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_7_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_7_LOC, tmp)
            }
            // i = 7
            {
                let tmp := mulmod(accumulator, mload(TEMP_6_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_6_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_6_LOC, tmp)
            }
            // i = 6
            {
                let tmp := mulmod(accumulator, mload(TEMP_5_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_5_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_5_LOC, tmp)
            }
            // i = 5
            {
                let tmp := mulmod(accumulator, mload(TEMP_4_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_4_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_4_LOC, tmp)
            }
            // i = 4
            {
                let tmp := mulmod(accumulator, mload(TEMP_3_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_3_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_3_LOC, tmp)
            }
            // i = 3
            {
                let tmp := mulmod(accumulator, mload(TEMP_2_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_2_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_2_LOC, tmp)
            }
            // i = 2
            {
                let tmp := mulmod(accumulator, mload(TEMP_1_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_1_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_1_LOC, tmp)
            }
            // i = 1
            {
                let tmp := mulmod(accumulator, mload(TEMP_0_LOC), p)
                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENEGE_POW_MINUS_U_0_LOC), p)
                mstore(INVERTED_CHALLENEGE_POW_MINUS_U_0_LOC, tmp)
            }
            /// {{ UNROLL_SECTION_END COLLECT_INVERSES }}

            let inverted_gemini_r := accumulator

            let unshifted_scalar := 0
            let shifted_scalar := 0
            {
                let pos_inverted_denominator := mload(POS_INVERTED_DENOM_0_LOC)
                let neg_inverted_denominator := mload(NEG_INVERTED_DENOM_0_LOC)
                let shplonk_nu := mload(SHPLONK_NU_CHALLENGE)

                unshifted_scalar := addmod(pos_inverted_denominator, mulmod(shplonk_nu, neg_inverted_denominator, p), p)

                // accumulator takes the value of `INVERTED_GEMINI_DENOMINATOR_0` here
                shifted_scalar :=
                    mulmod(
                        accumulator, // (1 / gemini_r_challenge)
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

            // TODO: Write a comment that describes the process of accumulating commitments and scalars
            // into one large value that will be used on the rhs of the pairing check

            // Accumulators
            let batching_challenge := 1
            let batched_evaluation := 0

            let neg_unshifted_scalar := sub(p, unshifted_scalar)
            let neg_shifted_scalar := sub(p, shifted_scalar)

            mstore(BATCH_SCALAR_0_LOC, 1)
            let rho := mload(RHO_CHALLENGE)

            // Unrolled for the loop below - where NUMBER_UNSHIFTED = 36
            // for (uint256 i = 1; i <= NUMBER_UNSHIFTED; ++i) {
            //     scalars[i] = mem.unshiftedScalar.neg() * mem.batchingChallenge;
            //     mem.batchedEvaluation = mem.batchedEvaluation + (proof.sumcheckEvaluations[i - 1] * mem.batchingChallenge);
            //     mem.batchingChallenge = mem.batchingChallenge * tp.rho;
            // }

            // Calculate the scalars and batching challenge for the unshifted entities
            // 0: QM_EVAL_LOC
            mstore(BATCH_SCALAR_1_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QM_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 1: QC_EVAL_LOC
            mstore(BATCH_SCALAR_2_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QC_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 2: QL_EVAL_LOC
            mstore(BATCH_SCALAR_3_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 3: QR_EVAL_LOC
            mstore(BATCH_SCALAR_4_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QR_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 4: QO_EVAL_LOC
            mstore(BATCH_SCALAR_5_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QO_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 5: Q4_EVAL_LOC
            mstore(BATCH_SCALAR_6_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(Q4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 6: QLOOKUP_EVAL_LOC
            mstore(BATCH_SCALAR_7_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QLOOKUP_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 7: QARITH_EVAL_LOC
            mstore(BATCH_SCALAR_8_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QARITH_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 8: QRANGE_EVAL_LOC
            mstore(BATCH_SCALAR_9_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QRANGE_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 9: QELLIPTIC_EVAL_LOC
            mstore(BATCH_SCALAR_10_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(QELLIPTIC_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 10: QMEMORY_EVAL_LOC
            mstore(BATCH_SCALAR_11_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QMEMORY_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 11: QNNF_EVAL_LOC
            mstore(BATCH_SCALAR_12_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(QNNF_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 12: QPOSEIDON2_EXTERNAL_EVAL_LOC
            mstore(BATCH_SCALAR_13_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(QPOSEIDON2_EXTERNAL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 13: QPOSEIDON2_INTERNAL_EVAL_LOC
            mstore(BATCH_SCALAR_14_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(QPOSEIDON2_INTERNAL_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 14: SIGMA1_EVAL_LOC
            mstore(BATCH_SCALAR_15_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 15: SIGMA2_EVAL_LOC
            mstore(BATCH_SCALAR_16_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 16: SIGMA3_EVAL_LOC
            mstore(BATCH_SCALAR_17_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 17: SIGMA4_EVAL_LOC
            mstore(BATCH_SCALAR_18_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(SIGMA4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 18: ID1_EVAL_LOC
            mstore(BATCH_SCALAR_19_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 19: ID2_EVAL_LOC
            mstore(BATCH_SCALAR_20_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 20: ID3_EVAL_LOC
            mstore(BATCH_SCALAR_21_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 21: ID4_EVAL_LOC
            mstore(BATCH_SCALAR_22_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(ID4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 22: TABLE1_EVAL_LOC
            mstore(BATCH_SCALAR_23_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE1_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 23: TABLE2_EVAL_LOC
            mstore(BATCH_SCALAR_24_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE2_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 24: TABLE3_EVAL_LOC
            mstore(BATCH_SCALAR_25_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE3_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 25: TABLE4_EVAL_LOC
            mstore(BATCH_SCALAR_26_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation := addmod(batched_evaluation, mulmod(mload(TABLE4_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 26: LAGRANGE_FIRST_EVAL_LOC
            mstore(BATCH_SCALAR_27_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(LAGRANGE_FIRST_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 27: LAGRANGE_LAST_EVAL_LOC
            mstore(BATCH_SCALAR_28_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(LAGRANGE_LAST_EVAL_LOC), batching_challenge, p), p)
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
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 34: LOOKUP_READ_COUNTS_EVAL_LOC
            mstore(BATCH_SCALAR_35_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(LOOKUP_READ_COUNTS_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            // 35: LOOKUP_READ_TAGS_EVAL_LOC
            mstore(BATCH_SCALAR_36_LOC, mulmod(neg_unshifted_scalar, batching_challenge, p))
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), batching_challenge, p), p)
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
            batched_evaluation :=
                addmod(batched_evaluation, mulmod(mload(Z_PERM_SHIFT_EVAL_LOC), batching_challenge, p), p)
            batching_challenge := mulmod(batching_challenge, rho, p)

            mstore(BATCHED_EVALUATION_LOC, batched_evaluation)

            // Compute fold pos evaluations
            {
                // TODO: work out the stack here
                mstore(CHALL_POW_LOC, POWERS_OF_EVALUATION_CHALLENGE_14_LOC)
                mstore(SUMCHECK_U_LOC, SUM_U_CHALLENGE_14)
                mstore(GEMINI_A_LOC, GEMINI_A_EVAL_14)
                // Inversion of this value was included in batch inversion above
                let inverted_chall_pow_minus_u_loc := INVERTED_CHALLENEGE_POW_MINUS_U_14_LOC
                let fold_pos_off := FOLD_POS_EVALUATIONS_14_LOC

                let batchedEvalAcc := batched_evaluation
                for { let i := LOG_N } gt(i, 0) { i := sub(i, 1) } {
                    let chall_pow := mload(mload(CHALL_POW_LOC))
                    let sum_check_u := mload(mload(SUMCHECK_U_LOC))

                    // challengePower * batchedEvalAccumulator * 2
                    let batchedEvalRoundAcc := mulmod(chall_pow, mulmod(batchedEvalAcc, 2, p), p)
                    // (challengePower * (ONE - u) - u)
                    let chall_pow_times_1_minus_u := mulmod(chall_pow, addmod(1, sub(p, sum_check_u), p), p)

                    batchedEvalRoundAcc :=
                        addmod(
                            batchedEvalRoundAcc,
                            sub(
                                p,
                                mulmod(
                                    mload(mload(GEMINI_A_LOC)), addmod(chall_pow_times_1_minus_u, sub(p, sum_check_u), p), p
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

                constant_term_acc :=
                    addmod(
                        constant_term_acc,
                        mulmod(mload(GEMINI_A_EVAL_0), mulmod(shplonk_nu, mload(NEG_INVERTED_DENOM_0_LOC), p), p),
                        p
                    )

                let shplonk_nu_sqr := mulmod(shplonk_nu, shplonk_nu, p)
                batching_challenge := shplonk_nu_sqr

                // TODO: improve scheduling
                mstore(SS_POS_INV_DENOM_LOC, POS_INVERTED_DENOM_1_LOC)
                mstore(SS_NEG_INV_DENOM_LOC, NEG_INVERTED_DENOM_1_LOC)

                mstore(SS_GEMINI_EVALS_LOC, GEMINI_A_EVAL_1)
                let fold_pos_evals_loc := FOLD_POS_EVALUATIONS_1_LOC

                let shplonk_z := mload(SHPLONK_Z_CHALLENGE)
                let scalars_loc := BATCH_SCALAR_37_LOC

                for { let i := 0 } lt(i, sub(LOG_N, 1)) { i := add(i, 1) } {
                    let scaling_factor_pos := mulmod(batching_challenge, mload(mload(SS_POS_INV_DENOM_LOC)), p)
                    let scaling_factor_neg :=
                        mulmod(batching_challenge, mulmod(shplonk_nu, mload(mload(SS_NEG_INV_DENOM_LOC)), p), p)

                    mstore(scalars_loc, addmod(sub(p, scaling_factor_neg), sub(p, scaling_factor_pos), p))

                    let accum_contribution := mulmod(scaling_factor_neg, mload(mload(SS_GEMINI_EVALS_LOC)), p)
                    accum_contribution :=
                        addmod(accum_contribution, mulmod(scaling_factor_pos, mload(fold_pos_evals_loc), p), p)

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
                // WORKTODO(md): we can ignore this accumulation as we are multiplying by 1,
                // Just set the accumulator instead.
                mstore(SCALAR_LOCATION, 0x1)
                {
                    let x := mload(SHPLONK_Q_X_LOC)
                    let y := mload(SHPLONK_Q_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                mcopy(G1_LOCATION, SHPLONK_Q_X_LOC, 0x40)
                precomp_success_flag := staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR, 0x40)
            }

            // Accumulate vk points
            loadVk()
            {
                // Acumulator = acumulator + scalar[1] * vk[0]
                mcopy(G1_LOCATION, Q_M_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_1_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[2] * vk[1]
                mcopy(G1_LOCATION, Q_C_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_2_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[3] * vk[2]
                mcopy(G1_LOCATION, Q_L_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_3_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[4] * vk[3]
                mcopy(G1_LOCATION, Q_R_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_4_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[5] * vk[4]
                mcopy(G1_LOCATION, Q_O_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_5_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[6] * vk[5]
                mcopy(G1_LOCATION, Q_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_6_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[7] * vk[6]
                mcopy(G1_LOCATION, Q_LOOKUP_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_7_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[8] * vk[7]
                mcopy(G1_LOCATION, Q_ARITH_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_8_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[9] * vk[8]
                mcopy(G1_LOCATION, Q_DELTA_RANGE_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_9_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[10] * vk[9]
                mcopy(G1_LOCATION, Q_ELLIPTIC_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_10_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[11] * vk[10]
                mcopy(G1_LOCATION, Q_MEMORY_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_11_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[12] * vk[11]
                mcopy(G1_LOCATION, Q_NNF_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_12_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[13] * vk[12]
                mcopy(G1_LOCATION, Q_POSEIDON_2_EXTERNAL_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_13_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[14] * vk[13]
                mcopy(G1_LOCATION, Q_POSEIDON_2_INTERNAL_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_14_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[15] * vk[14]
                mcopy(G1_LOCATION, SIGMA_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_15_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[16] * vk[15]
                mcopy(G1_LOCATION, SIGMA_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_16_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[17] * vk[16]
                mcopy(G1_LOCATION, SIGMA_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_17_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[18] * vk[17]
                mcopy(G1_LOCATION, SIGMA_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_18_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[19] * vk[18]
                mcopy(G1_LOCATION, ID_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_19_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[20] * vk[19]
                mcopy(G1_LOCATION, ID_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_20_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[21] * vk[20]
                mcopy(G1_LOCATION, ID_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_21_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[22] * vk[21]
                mcopy(G1_LOCATION, ID_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_22_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[23] * vk[22]
                mcopy(G1_LOCATION, TABLE_1_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_23_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[24] * vk[23]
                mcopy(G1_LOCATION, TABLE_2_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_24_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[25] * vk[24]
                mcopy(G1_LOCATION, TABLE_3_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_25_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[26] * vk[25]
                mcopy(G1_LOCATION, TABLE_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_26_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[27] * vk[26]
                mcopy(G1_LOCATION, LAGRANGE_FIRST_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_27_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[28] * vk[27]
                mcopy(G1_LOCATION, LAGRANGE_LAST_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_28_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(W_L_X_LOC)
                    let y := mload(W_L_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }

                // Accumulate proof points
                // Accumulator = accumulator + scalar[29] * w_l
                mcopy(G1_LOCATION, W_L_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_29_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(W_R_X_LOC)
                    let y := mload(W_R_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }

                // Accumulator = accumulator + scalar[30] * w_r
                mcopy(G1_LOCATION, W_R_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_30_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(W_O_X_LOC)
                    let y := mload(W_O_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }

                // Accumulator = accumulator + scalar[31] * w_o
                mcopy(G1_LOCATION, W_O_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_31_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[32] * w_4
                {
                    let x := mload(W_4_X_LOC)
                    let y := mload(W_4_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                mcopy(G1_LOCATION, W_4_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_32_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(Z_PERM_X_LOC)
                    let y := mload(Z_PERM_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                // Accumulator = accumulator + scalar[33] * z_perm
                mcopy(G1_LOCATION, Z_PERM_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_33_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(LOOKUP_INVERSES_X_LOC)
                    let y := mload(LOOKUP_INVERSES_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                // Accumulator = accumulator + scalar[34] * lookup_inverses
                mcopy(G1_LOCATION, LOOKUP_INVERSES_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_34_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(LOOKUP_READ_COUNTS_X_LOC)
                    let y := mload(LOOKUP_READ_COUNTS_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                // Accumulator = accumulator + scalar[35] * lookup_read_counts
                mcopy(G1_LOCATION, LOOKUP_READ_COUNTS_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_35_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                {
                    let x := mload(LOOKUP_READ_TAGS_X_LOC)
                    let y := mload(LOOKUP_READ_TAGS_Y_LOC)
                    let xx := mulmod(x, x, q)
                    // validate on curve
                    precomp_success_flag :=
                        and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                }
                // Accumulator = accumulator + scalar[36] * lookup_read_tags
                mcopy(G1_LOCATION, LOOKUP_READ_TAGS_X_LOC, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_36_LOC))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag :=
                    and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulate these LOG_N scalars with the gemini fold univariates
                {
                    {
                        /// {{ UNROLL_SECTION_START ACCUMULATE_GEMINI_FOLD_UNIVARIATE }}
                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_0_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_0_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[37] * gemini_fold_univariates[0]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_0_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_37_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_1_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_1_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[38] * gemini_fold_univariates[1]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_1_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_38_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_2_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_2_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[39] * gemini_fold_univariates[2]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_2_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_39_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_3_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_3_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[40] * gemini_fold_univariates[3]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_3_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_40_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_4_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_4_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[41] * gemini_fold_univariates[4]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_4_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_41_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
                    }

                    {
                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_5_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_5_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[42] * gemini_fold_univariates[5]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_5_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_42_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_6_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_6_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[43] * gemini_fold_univariates[6]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_6_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_43_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_7_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_7_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[44] * gemini_fold_univariates[7]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_7_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_44_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_8_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_8_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[45] * gemini_fold_univariates[8]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_8_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_45_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_9_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_9_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[46] * gemini_fold_univariates[9]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_9_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_46_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_10_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_10_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[47] * gemini_fold_univariates[10]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_10_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_47_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
                    }

                    {
                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_11_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_11_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[48] * gemini_fold_univariates[11]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_11_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_48_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_12_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_12_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[49] * gemini_fold_univariates[12]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_12_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_49_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        {
                            let x := mload(GEMINI_FOLD_UNIVARIATE_13_X_LOC)
                            let y := mload(GEMINI_FOLD_UNIVARIATE_13_Y_LOC)
                            let xx := mulmod(x, x, q)
                            // validate on curve
                            precomp_success_flag :=
                                and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                        }
                        // accumulator = accumulator + scalar[50] * gemini_fold_univariates[13]
                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_13_X_LOC, 0x40)
                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_50_LOC))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                        precomp_success_flag :=
                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                        /// {{ UNROLL_SECTION_END ACCUMULATE_GEMINI_FOLD_UNIVARIATE }}
                    }
                }

                {
                    // Accumulate the constant term accumulator
                    // Accumulator = accumulator + 1 * costant term accumulator
                    mstore(G1_LOCATION, 0x01)
                    mstore(G1_Y_LOCATION, 0x02)
                    mstore(SCALAR_LOCATION, constant_term_acc)
                    precomp_success_flag :=
                        and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                    precomp_success_flag :=
                        and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                    // Accumlate final quotient commitment into shplonk check
                    // Accumulator = accumulator + shplonkZ * quotient commitment
                    {
                        let x := mload(KZG_QUOTIENT_X_LOC)
                        let y := mload(KZG_QUOTIENT_Y_LOC)
                        let xx := mulmod(x, x, q)
                        // validate on curve
                        precomp_success_flag :=
                            and(eq(mulmod(y, y, q), addmod(mulmod(x, xx, q), 3, q)), precomp_success_flag)
                    }
                    mcopy(G1_LOCATION, KZG_QUOTIENT_X_LOC, 0x40)

                    mstore(SCALAR_LOCATION, mload(SHPLONK_Z_CHALLENGE))
                    precomp_success_flag :=
                        and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                    precomp_success_flag :=
                        and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
                }

                if iszero(precomp_success_flag) {
                    mstore(0x00, BATCH_ACCUMULATION_FAILED_SELECTOR)
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
                    // Read the pairing encoded in the first 16 field elements of the proof
                    let p0_other_x := mload(PAIRING_POINT_0)
                    p0_other_x := or(shl(68, mload(PAIRING_POINT_1)), p0_other_x)
                    p0_other_x := or(shl(136, mload(PAIRING_POINT_2)), p0_other_x)
                    p0_other_x := or(shl(204, mload(PAIRING_POINT_3)), p0_other_x)

                    let p0_other_y := mload(PAIRING_POINT_4)
                    p0_other_y := or(shl(68, mload(PAIRING_POINT_5)), p0_other_y)
                    p0_other_y := or(shl(136, mload(PAIRING_POINT_6)), p0_other_y)
                    p0_other_y := or(shl(204, mload(PAIRING_POINT_7)), p0_other_y)

                    let p1_other_x := mload(PAIRING_POINT_8)
                    p1_other_x := or(shl(68, mload(PAIRING_POINT_9)), p1_other_x)
                    p1_other_x := or(shl(136, mload(PAIRING_POINT_10)), p1_other_x)
                    p1_other_x := or(shl(204, mload(PAIRING_POINT_11)), p1_other_x)

                    let p1_other_y := mload(PAIRING_POINT_12)
                    p1_other_y := or(shl(68, mload(PAIRING_POINT_13)), p1_other_y)
                    p1_other_y := or(shl(136, mload(PAIRING_POINT_14)), p1_other_y)
                    p1_other_y := or(shl(204, mload(PAIRING_POINT_15)), p1_other_y)

                    // Validate p_0_other on curve
                    let xx := mulmod(p0_other_x, p0_other_x, q)
                    let xxx := mulmod(xx, p0_other_x, q)
                    let yy := mulmod(p0_other_y, p0_other_y, q)

                    let success := eq(yy, addmod(xxx, 3, q))

                    // Validate p_1_other on curve
                    xx := mulmod(p1_other_x, p1_other_x, q)
                    xxx := mulmod(xx, p1_other_x, q)
                    yy := mulmod(p1_other_y, p1_other_y, q)

                    success := and(success, eq(yy, addmod(xxx, 3, q)))

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
                        mstore(0x00, PAIRING_FAILED_SELECTOR)
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

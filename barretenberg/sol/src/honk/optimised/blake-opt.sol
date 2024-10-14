// TODO: CONVERT ALL LATEX INTO ASCII LATEX
pragma solidity ^0.8.27;

// WORKTODO: could we have two versions of the verifier, one which has rolled loops and one which
// unrolls loops?? - analogous with aggressive inlining

import {IVerifier} from "../../interfaces/IVerifier.sol";
import {
    CONST_PROOF_SIZE_LOG_N,
    NUMBER_OF_SUBRELATIONS,
    BATCHED_RELATION_PARTIAL_LENGTH,
    NUMBER_OF_ENTITIES,
    NUMBER_UNSHIFTED,
    NUMBER_TO_BE_SHIFTED,
    NUMBER_OF_ALPHAS
} from "../HonkTypes.sol";

// Log_N for this particular circuit is 15, used in sumcheck
uint256 constant LOG_N = 15;

import "forge-std/console.sol";

import {logAsmG1, logFr, bytes32ToString} from "../utils.sol";


error PUBLIC_INPUT_TOO_LARGE();
error SUMCHECK_FAILED();
error PAIRING_FAILED();
error BATCH_ACCUMULATION_FAILED();
error MODEXP_FAILED();
error PROOF_POINT_NOT_ON_CURVE();

// The plan
// Write an optimised version of the add2 circuit
contract BlakeOptHonkVerifier is IVerifier {
    // Constants representin proof locations in memory
    // Vk indicies
    uint256 internal constant vk_circuit_size_loc = 0x380;
    uint256 internal constant vk_num_public_inputs_loc = 0x3a0;
    uint256 internal constant vk_pub_inputs_offset_loc = 0x3c0;
    uint256 internal constant q_m_x_loc = 0x3e0;
    uint256 internal constant q_m_y_loc = 0x400;
    uint256 internal constant q_c_x_loc = 0x460;
    uint256 internal constant q_c_y_loc = 0x480;
    uint256 internal constant q_l_x_loc = 0x4e0;
    uint256 internal constant q_l_y_loc = 0x500;
    uint256 internal constant q_r_x_loc = 0x560;
    uint256 internal constant q_r_y_loc = 0x580;
    uint256 internal constant q_o_x_loc = 0x5e0;
    uint256 internal constant q_o_y_loc = 0x600;
    uint256 internal constant q_4_x_loc = 0x660;
    uint256 internal constant q_4_y_loc = 0x680;
    uint256 internal constant q_arith_x_loc = 0x6e0;
    uint256 internal constant q_arith_y_loc = 0x700;
    uint256 internal constant q_delta_range_x_loc = 0x760;
    uint256 internal constant q_delta_range_y_loc = 0x780;
    uint256 internal constant q_elliptic_x_loc = 0x7e0;
    uint256 internal constant q_elliptic_y_loc = 0x800;
    uint256 internal constant q_aux_x_loc = 0x860;
    uint256 internal constant q_aux_y_loc = 0x880;
    uint256 internal constant q_lookup_x_loc = 0x8e0;
    uint256 internal constant q_lookup_y_loc = 0x900;
    uint256 internal constant q_poseidon_2_external_x_loc = 0x960;
    uint256 internal constant q_poseidon_2_external_y_loc = 0x980;
    uint256 internal constant q_poseidon_2_internal_x_loc = 0x9e0;
    uint256 internal constant q_poseidon_2_internal_y_loc = 0xa00;
    uint256 internal constant sigma_1_x_loc = 0xa60;
    uint256 internal constant sigma_1_y_loc = 0xa80;
    uint256 internal constant sigma_2_x_loc = 0xae0;
    uint256 internal constant sigma_2_y_loc = 0xb00;
    uint256 internal constant sigma_3_x_loc = 0xb60;
    uint256 internal constant sigma_3_y_loc = 0xb80;
    uint256 internal constant sigma_4_x_loc = 0xbe0;
    uint256 internal constant sigma_4_y_loc = 0xc00;
    uint256 internal constant id_1_x_loc = 0xc60;
    uint256 internal constant id_1_y_loc = 0xc80;
    uint256 internal constant id_2_x_loc = 0xce0;
    uint256 internal constant id_2_y_loc = 0xd00;
    uint256 internal constant id_3_x_loc = 0xd60;
    uint256 internal constant id_3_y_loc = 0xd80;
    uint256 internal constant id_4_x_loc = 0xde0;
    uint256 internal constant id_4_y_loc = 0xe00;
    uint256 internal constant table_1_x_loc = 0xe60;
    uint256 internal constant table_1_y_loc = 0xe80;
    uint256 internal constant table_2_x_loc = 0xee0;
    uint256 internal constant table_2_y_loc = 0xf00;
    uint256 internal constant table_3_x_loc = 0xf60;
    uint256 internal constant table_3_y_loc = 0xf80;
    uint256 internal constant table_4_x_loc = 0xfe0;
    uint256 internal constant table_4_y_loc = 0x1000;
    uint256 internal constant lagrange_first_x_loc = 0x1060;
    uint256 internal constant lagrange_first_y_loc = 0x1080;
    uint256 internal constant lagrange_last_x_loc = 0x10e0;
    uint256 internal constant lagrange_last_y_loc = 0x1100;

    // Proof indicies

    // TODO: things in the proof that are variable length should be stored in
    // arrays eventually - then looped over so we dont have fixed constants for all circuit sizes
    uint256 internal constant proof_circuit_size_loc = 0x1160;
    uint256 internal constant proof_num_public_inputs_loc = 0x1180;
    uint256 internal constant proof_pub_inputs_offset_loc = 0x11a0;
    uint256 internal constant w_l_x0_loc = 0x11c0;
    uint256 internal constant w_l_x1_loc = 0x11e0;
    uint256 internal constant w_l_y0_loc = 0x1200;
    uint256 internal constant w_l_y1_loc = 0x1220;
    uint256 internal constant w_r_x0_loc = 0x1240;
    uint256 internal constant w_r_x1_loc = 0x1260;
    uint256 internal constant w_r_y0_loc = 0x1280;
    uint256 internal constant w_r_y1_loc = 0x12a0;
    uint256 internal constant w_o_x0_loc = 0x12c0;
    uint256 internal constant w_o_x1_loc = 0x12e0;
    uint256 internal constant w_o_y0_loc = 0x1300;
    uint256 internal constant w_o_y1_loc = 0x1320;
    uint256 internal constant lookup_read_counts_x0_loc = 0x1340;
    uint256 internal constant lookup_read_counts_x1_loc = 0x1360;
    uint256 internal constant lookup_read_counts_y0_loc = 0x1380;
    uint256 internal constant lookup_read_counts_y1_loc = 0x13a0;
    uint256 internal constant lookup_read_tags_x0_loc = 0x13c0;
    uint256 internal constant lookup_read_tags_x1_loc = 0x13e0;
    uint256 internal constant lookup_read_tags_y0_loc = 0x1400;
    uint256 internal constant lookup_read_tags_y1_loc = 0x1420;
    uint256 internal constant w_4_x0_loc = 0x1440;
    uint256 internal constant w_4_x1_loc = 0x1460;
    uint256 internal constant w_4_y0_loc = 0x1480;
    uint256 internal constant w_4_y1_loc = 0x14a0;
    uint256 internal constant lookup_inverses_x0_loc = 0x14c0;
    uint256 internal constant lookup_inverses_x1_loc = 0x14e0;
    uint256 internal constant lookup_inverses_y0_loc = 0x1500;
    uint256 internal constant lookup_inverses_y1_loc = 0x1520;
    uint256 internal constant z_perm_x0_loc = 0x1540;
    uint256 internal constant z_perm_x1_loc = 0x1560;
    uint256 internal constant z_perm_y0_loc = 0x1580;
    uint256 internal constant z_perm_y1_loc = 0x15a0;

    uint256 internal constant sumcheck_univariate_0_0 = 0x15c0;
    uint256 internal constant sumcheck_univariate_0_1 = 0x15e0;
    uint256 internal constant sumcheck_univariate_0_2 = 0x1600;
    uint256 internal constant sumcheck_univariate_0_3 = 0x1620;
    uint256 internal constant sumcheck_univariate_0_4 = 0x1640;
    uint256 internal constant sumcheck_univariate_0_5 = 0x1660;
    uint256 internal constant sumcheck_univariate_0_6 = 0x1680;
    uint256 internal constant sumcheck_univariate_0_7 = 0x16a0;
    uint256 internal constant sumcheck_univariate_0_8 = 0x16c0;
    uint256 internal constant sumcheck_univariate_0_9 = 0x16e0;
    uint256 internal constant sumcheck_univariate_0_10 = 0x1700;
    uint256 internal constant sumcheck_univariate_0_11 = 0x1720;
    uint256 internal constant sumcheck_univariate_0_12 = 0x1740;
    uint256 internal constant sumcheck_univariate_0_13 = 0x1760;
    uint256 internal constant sumcheck_univariate_0_14 = 0x1780;
    uint256 internal constant sumcheck_univariate_0_15 = 0x17a0;
    uint256 internal constant sumcheck_univariate_0_16 = 0x17c0;
    uint256 internal constant sumcheck_univariate_0_17 = 0x17e0;
    uint256 internal constant sumcheck_univariate_0_18 = 0x1800;
    uint256 internal constant sumcheck_univariate_0_19 = 0x1820;
    uint256 internal constant sumcheck_univariate_0_20 = 0x1840;
    uint256 internal constant sumcheck_univariate_0_21 = 0x1860;
    uint256 internal constant sumcheck_univariate_0_22 = 0x1880;
    uint256 internal constant sumcheck_univariate_0_23 = 0x18a0;
    uint256 internal constant sumcheck_univariate_0_24 = 0x18c0;
    uint256 internal constant sumcheck_univariate_0_25 = 0x18e0;
    uint256 internal constant sumcheck_univariate_0_26 = 0x1900;
    uint256 internal constant sumcheck_univariate_0_27 = 0x1920;
    uint256 internal constant sumcheck_univariate_1_0 = 0x1940;
    uint256 internal constant sumcheck_univariate_1_1 = 0x1960;
    uint256 internal constant sumcheck_univariate_1_2 = 0x1980;
    uint256 internal constant sumcheck_univariate_1_3 = 0x19a0;
    uint256 internal constant sumcheck_univariate_1_4 = 0x19c0;
    uint256 internal constant sumcheck_univariate_1_5 = 0x19e0;
    uint256 internal constant sumcheck_univariate_1_6 = 0x1a00;
    uint256 internal constant sumcheck_univariate_1_7 = 0x1a20;
    uint256 internal constant sumcheck_univariate_1_8 = 0x1a40;
    uint256 internal constant sumcheck_univariate_1_9 = 0x1a60;
    uint256 internal constant sumcheck_univariate_1_10 = 0x1a80;
    uint256 internal constant sumcheck_univariate_1_11 = 0x1aa0;
    uint256 internal constant sumcheck_univariate_1_12 = 0x1ac0;
    uint256 internal constant sumcheck_univariate_1_13 = 0x1ae0;
    uint256 internal constant sumcheck_univariate_1_14 = 0x1b00;
    uint256 internal constant sumcheck_univariate_1_15 = 0x1b20;
    uint256 internal constant sumcheck_univariate_1_16 = 0x1b40;
    uint256 internal constant sumcheck_univariate_1_17 = 0x1b60;
    uint256 internal constant sumcheck_univariate_1_18 = 0x1b80;
    uint256 internal constant sumcheck_univariate_1_19 = 0x1ba0;
    uint256 internal constant sumcheck_univariate_1_20 = 0x1bc0;
    uint256 internal constant sumcheck_univariate_1_21 = 0x1be0;
    uint256 internal constant sumcheck_univariate_1_22 = 0x1c00;
    uint256 internal constant sumcheck_univariate_1_23 = 0x1c20;
    uint256 internal constant sumcheck_univariate_1_24 = 0x1c40;
    uint256 internal constant sumcheck_univariate_1_25 = 0x1c60;
    uint256 internal constant sumcheck_univariate_1_26 = 0x1c80;
    uint256 internal constant sumcheck_univariate_1_27 = 0x1ca0;
    uint256 internal constant sumcheck_univariate_2_0 = 0x1cc0;
    uint256 internal constant sumcheck_univariate_2_1 = 0x1ce0;
    uint256 internal constant sumcheck_univariate_2_2 = 0x1d00;
    uint256 internal constant sumcheck_univariate_2_3 = 0x1d20;
    uint256 internal constant sumcheck_univariate_2_4 = 0x1d40;
    uint256 internal constant sumcheck_univariate_2_5 = 0x1d60;
    uint256 internal constant sumcheck_univariate_2_6 = 0x1d80;
    uint256 internal constant sumcheck_univariate_2_7 = 0x1da0;
    uint256 internal constant sumcheck_univariate_2_8 = 0x1dc0;
    uint256 internal constant sumcheck_univariate_2_9 = 0x1de0;
    uint256 internal constant sumcheck_univariate_2_10 = 0x1e00;
    uint256 internal constant sumcheck_univariate_2_11 = 0x1e20;
    uint256 internal constant sumcheck_univariate_2_12 = 0x1e40;
    uint256 internal constant sumcheck_univariate_2_13 = 0x1e60;
    uint256 internal constant sumcheck_univariate_2_14 = 0x1e80;
    uint256 internal constant sumcheck_univariate_2_15 = 0x1ea0;
    uint256 internal constant sumcheck_univariate_2_16 = 0x1ec0;
    uint256 internal constant sumcheck_univariate_2_17 = 0x1ee0;
    uint256 internal constant sumcheck_univariate_2_18 = 0x1f00;
    uint256 internal constant sumcheck_univariate_2_19 = 0x1f20;
    uint256 internal constant sumcheck_univariate_2_20 = 0x1f40;
    uint256 internal constant sumcheck_univariate_2_21 = 0x1f60;
    uint256 internal constant sumcheck_univariate_2_22 = 0x1f80;
    uint256 internal constant sumcheck_univariate_2_23 = 0x1fa0;
    uint256 internal constant sumcheck_univariate_2_24 = 0x1fc0;
    uint256 internal constant sumcheck_univariate_2_25 = 0x1fe0;
    uint256 internal constant sumcheck_univariate_2_26 = 0x2000;
    uint256 internal constant sumcheck_univariate_2_27 = 0x2020;
    uint256 internal constant sumcheck_univariate_3_0 = 0x2040;
    uint256 internal constant sumcheck_univariate_3_1 = 0x2060;
    uint256 internal constant sumcheck_univariate_3_2 = 0x2080;
    uint256 internal constant sumcheck_univariate_3_3 = 0x20a0;
    uint256 internal constant sumcheck_univariate_3_4 = 0x20c0;
    uint256 internal constant sumcheck_univariate_3_5 = 0x20e0;
    uint256 internal constant sumcheck_univariate_3_6 = 0x2100;
    uint256 internal constant sumcheck_univariate_3_7 = 0x2120;
    uint256 internal constant sumcheck_univariate_3_8 = 0x2140;
    uint256 internal constant sumcheck_univariate_3_9 = 0x2160;
    uint256 internal constant sumcheck_univariate_3_10 = 0x2180;
    uint256 internal constant sumcheck_univariate_3_11 = 0x21a0;
    uint256 internal constant sumcheck_univariate_3_12 = 0x21c0;
    uint256 internal constant sumcheck_univariate_3_13 = 0x21e0;
    uint256 internal constant sumcheck_univariate_3_14 = 0x2200;
    uint256 internal constant sumcheck_univariate_3_15 = 0x2220;
    uint256 internal constant sumcheck_univariate_3_16 = 0x2240;
    uint256 internal constant sumcheck_univariate_3_17 = 0x2260;
    uint256 internal constant sumcheck_univariate_3_18 = 0x2280;
    uint256 internal constant sumcheck_univariate_3_19 = 0x22a0;
    uint256 internal constant sumcheck_univariate_3_20 = 0x22c0;
    uint256 internal constant sumcheck_univariate_3_21 = 0x22e0;
    uint256 internal constant sumcheck_univariate_3_22 = 0x2300;
    uint256 internal constant sumcheck_univariate_3_23 = 0x2320;
    uint256 internal constant sumcheck_univariate_3_24 = 0x2340;
    uint256 internal constant sumcheck_univariate_3_25 = 0x2360;
    uint256 internal constant sumcheck_univariate_3_26 = 0x2380;
    uint256 internal constant sumcheck_univariate_3_27 = 0x23a0;
    uint256 internal constant sumcheck_univariate_4_0 = 0x23c0;
    uint256 internal constant sumcheck_univariate_4_1 = 0x23e0;
    uint256 internal constant sumcheck_univariate_4_2 = 0x2400;
    uint256 internal constant sumcheck_univariate_4_3 = 0x2420;
    uint256 internal constant sumcheck_univariate_4_4 = 0x2440;
    uint256 internal constant sumcheck_univariate_4_5 = 0x2460;
    uint256 internal constant sumcheck_univariate_4_6 = 0x2480;
    uint256 internal constant sumcheck_univariate_4_7 = 0x24a0;
    uint256 internal constant sumcheck_univariate_4_8 = 0x24c0;
    uint256 internal constant sumcheck_univariate_4_9 = 0x24e0;
    uint256 internal constant sumcheck_univariate_4_10 = 0x2500;
    uint256 internal constant sumcheck_univariate_4_11 = 0x2520;
    uint256 internal constant sumcheck_univariate_4_12 = 0x2540;
    uint256 internal constant sumcheck_univariate_4_13 = 0x2560;
    uint256 internal constant sumcheck_univariate_4_14 = 0x2580;
    uint256 internal constant sumcheck_univariate_4_15 = 0x25a0;
    uint256 internal constant sumcheck_univariate_4_16 = 0x25c0;
    uint256 internal constant sumcheck_univariate_4_17 = 0x25e0;
    uint256 internal constant sumcheck_univariate_4_18 = 0x2600;
    uint256 internal constant sumcheck_univariate_4_19 = 0x2620;
    uint256 internal constant sumcheck_univariate_4_20 = 0x2640;
    uint256 internal constant sumcheck_univariate_4_21 = 0x2660;
    uint256 internal constant sumcheck_univariate_4_22 = 0x2680;
    uint256 internal constant sumcheck_univariate_4_23 = 0x26a0;
    uint256 internal constant sumcheck_univariate_4_24 = 0x26c0;
    uint256 internal constant sumcheck_univariate_4_25 = 0x26e0;
    uint256 internal constant sumcheck_univariate_4_26 = 0x2700;
    uint256 internal constant sumcheck_univariate_4_27 = 0x2720;
    uint256 internal constant sumcheck_univariate_5_0 = 0x2740;
    uint256 internal constant sumcheck_univariate_5_1 = 0x2760;
    uint256 internal constant sumcheck_univariate_5_2 = 0x2780;
    uint256 internal constant sumcheck_univariate_5_3 = 0x27a0;
    uint256 internal constant sumcheck_univariate_5_4 = 0x27c0;
    uint256 internal constant sumcheck_univariate_5_5 = 0x27e0;
    uint256 internal constant sumcheck_univariate_5_6 = 0x2800;
    uint256 internal constant sumcheck_univariate_5_7 = 0x2820;
    uint256 internal constant sumcheck_univariate_5_8 = 0x2840;
    uint256 internal constant sumcheck_univariate_5_9 = 0x2860;
    uint256 internal constant sumcheck_univariate_5_10 = 0x2880;
    uint256 internal constant sumcheck_univariate_5_11 = 0x28a0;
    uint256 internal constant sumcheck_univariate_5_12 = 0x28c0;
    uint256 internal constant sumcheck_univariate_5_13 = 0x28e0;
    uint256 internal constant sumcheck_univariate_5_14 = 0x2900;
    uint256 internal constant sumcheck_univariate_5_15 = 0x2920;
    uint256 internal constant sumcheck_univariate_5_16 = 0x2940;
    uint256 internal constant sumcheck_univariate_5_17 = 0x2960;
    uint256 internal constant sumcheck_univariate_5_18 = 0x2980;
    uint256 internal constant sumcheck_univariate_5_19 = 0x29a0;
    uint256 internal constant sumcheck_univariate_5_20 = 0x29c0;
    uint256 internal constant sumcheck_univariate_5_21 = 0x29e0;
    uint256 internal constant sumcheck_univariate_5_22 = 0x2a00;
    uint256 internal constant sumcheck_univariate_5_23 = 0x2a20;
    uint256 internal constant sumcheck_univariate_5_24 = 0x2a40;
    uint256 internal constant sumcheck_univariate_5_25 = 0x2a60;
    uint256 internal constant sumcheck_univariate_5_26 = 0x2a80;
    uint256 internal constant sumcheck_univariate_5_27 = 0x2aa0;
    uint256 internal constant sumcheck_univariate_6_0 = 0x2ac0;
    uint256 internal constant sumcheck_univariate_6_1 = 0x2ae0;
    uint256 internal constant sumcheck_univariate_6_2 = 0x2b00;
    uint256 internal constant sumcheck_univariate_6_3 = 0x2b20;
    uint256 internal constant sumcheck_univariate_6_4 = 0x2b40;
    uint256 internal constant sumcheck_univariate_6_5 = 0x2b60;
    uint256 internal constant sumcheck_univariate_6_6 = 0x2b80;
    uint256 internal constant sumcheck_univariate_6_7 = 0x2ba0;
    uint256 internal constant sumcheck_univariate_6_8 = 0x2bc0;
    uint256 internal constant sumcheck_univariate_6_9 = 0x2be0;
    uint256 internal constant sumcheck_univariate_6_10 = 0x2c00;
    uint256 internal constant sumcheck_univariate_6_11 = 0x2c20;
    uint256 internal constant sumcheck_univariate_6_12 = 0x2c40;
    uint256 internal constant sumcheck_univariate_6_13 = 0x2c60;
    uint256 internal constant sumcheck_univariate_6_14 = 0x2c80;
    uint256 internal constant sumcheck_univariate_6_15 = 0x2ca0;
    uint256 internal constant sumcheck_univariate_6_16 = 0x2cc0;
    uint256 internal constant sumcheck_univariate_6_17 = 0x2ce0;
    uint256 internal constant sumcheck_univariate_6_18 = 0x2d00;
    uint256 internal constant sumcheck_univariate_6_19 = 0x2d20;
    uint256 internal constant sumcheck_univariate_6_20 = 0x2d40;
    uint256 internal constant sumcheck_univariate_6_21 = 0x2d60;
    uint256 internal constant sumcheck_univariate_6_22 = 0x2d80;
    uint256 internal constant sumcheck_univariate_6_23 = 0x2da0;
    uint256 internal constant sumcheck_univariate_6_24 = 0x2dc0;
    uint256 internal constant sumcheck_univariate_6_25 = 0x2de0;
    uint256 internal constant sumcheck_univariate_6_26 = 0x2e00;
    uint256 internal constant sumcheck_univariate_6_27 = 0x2e20;
    uint256 internal constant sumcheck_univariate_7_0 = 0x2e40;
    uint256 internal constant sumcheck_univariate_7_1 = 0x2e60;
    uint256 internal constant sumcheck_univariate_7_2 = 0x2e80;
    uint256 internal constant sumcheck_univariate_7_3 = 0x2ea0;
    uint256 internal constant sumcheck_univariate_7_4 = 0x2ec0;
    uint256 internal constant sumcheck_univariate_7_5 = 0x2ee0;
    uint256 internal constant sumcheck_univariate_7_6 = 0x2f00;
    uint256 internal constant sumcheck_univariate_7_7 = 0x2f20;
    uint256 internal constant sumcheck_univariate_7_8 = 0x2f40;
    uint256 internal constant sumcheck_univariate_7_9 = 0x2f60;
    uint256 internal constant sumcheck_univariate_7_10 = 0x2f80;
    uint256 internal constant sumcheck_univariate_7_11 = 0x2fa0;
    uint256 internal constant sumcheck_univariate_7_12 = 0x2fc0;
    uint256 internal constant sumcheck_univariate_7_13 = 0x2fe0;
    uint256 internal constant sumcheck_univariate_7_14 = 0x3000;
    uint256 internal constant sumcheck_univariate_7_15 = 0x3020;
    uint256 internal constant sumcheck_univariate_7_16 = 0x3040;
    uint256 internal constant sumcheck_univariate_7_17 = 0x3060;
    uint256 internal constant sumcheck_univariate_7_18 = 0x3080;
    uint256 internal constant sumcheck_univariate_7_19 = 0x30a0;
    uint256 internal constant sumcheck_univariate_7_20 = 0x30c0;
    uint256 internal constant sumcheck_univariate_7_21 = 0x30e0;
    uint256 internal constant sumcheck_univariate_7_22 = 0x3100;
    uint256 internal constant sumcheck_univariate_7_23 = 0x3120;
    uint256 internal constant sumcheck_univariate_7_24 = 0x3140;
    uint256 internal constant sumcheck_univariate_7_25 = 0x3160;
    uint256 internal constant sumcheck_univariate_7_26 = 0x3180;
    uint256 internal constant sumcheck_univariate_7_27 = 0x31a0;

    uint256 internal constant QM_EVAL_LOC = 0x31c0;
    uint256 internal constant QC_EVAL_LOC = 0x31e0;
    uint256 internal constant Q1_EVAL_LOC = 0x3200;
    uint256 internal constant Q2_EVAL_LOC = 0x3220;
    uint256 internal constant Q3_EVAL_LOC = 0x3240;
    uint256 internal constant Q4_EVAL_LOC = 0x3260;
    uint256 internal constant QARITH_EVAL_LOC = 0x3280;
    uint256 internal constant QRANGE_EVAL_LOC = 0x32a0;
    uint256 internal constant QELLIPTIC_EVAL_LOC = 0x32c0;
    uint256 internal constant QAUX_EVAL_LOC = 0x32e0;
    uint256 internal constant QLOOKUP_EVAL_LOC = 0x3300;
    uint256 internal constant QPOSEIDON2_EXTERNAL_EVAL_LOC = 0x3320;
    uint256 internal constant QPOSEIDON2_INTERNAL_EVAL_LOC = 0x3340;
    uint256 internal constant SIGMA1_EVAL_LOC = 0x3360;
    uint256 internal constant SIGMA2_EVAL_LOC = 0x3380;
    uint256 internal constant SIGMA3_EVAL_LOC = 0x33a0;
    uint256 internal constant SIGMA4_EVAL_LOC = 0x33c0;
    uint256 internal constant ID1_EVAL_LOC = 0x33e0;
    uint256 internal constant ID2_EVAL_LOC = 0x3400;
    uint256 internal constant ID3_EVAL_LOC = 0x3420;
    uint256 internal constant ID4_EVAL_LOC = 0x3440;
    uint256 internal constant TABLE1_EVAL_LOC = 0x3460;
    uint256 internal constant TABLE2_EVAL_LOC = 0x3480;
    uint256 internal constant TABLE3_EVAL_LOC = 0x34a0;
    uint256 internal constant TABLE4_EVAL_LOC = 0x34c0;
    uint256 internal constant LAGRANGE_FIRST_EVAL_LOC = 0x34e0;
    uint256 internal constant LAGRANGE_LAST_EVAL_LOC = 0x3500;
    uint256 internal constant W1_EVAL_LOC = 0x3520;
    uint256 internal constant W2_EVAL_LOC = 0x3540;
    uint256 internal constant W3_EVAL_LOC = 0x3560;
    uint256 internal constant W4_EVAL_LOC = 0x3580;
    uint256 internal constant Z_PERM_EVAL_LOC = 0x35a0;
    uint256 internal constant LOOKUP_INVERSES_EVAL_LOC = 0x35c0;
    uint256 internal constant LOOKUP_READ_COUNTS_EVAL_LOC = 0x35e0;
    uint256 internal constant LOOKUP_READ_TAGS_EVAL_LOC = 0x3600;
    uint256 internal constant TABLE1_SHIFT_EVAL_LOC = 0x3620;
    uint256 internal constant TABLE2_SHIFT_EVAL_LOC = 0x3640;
    uint256 internal constant TABLE3_SHIFT_EVAL_LOC = 0x3660;
    uint256 internal constant TABLE4_SHIFT_EVAL_LOC = 0x3680;
    uint256 internal constant W1_SHIFT_EVAL_LOC = 0x36a0;
    uint256 internal constant W2_SHIFT_EVAL_LOC = 0x36c0;
    uint256 internal constant W3_SHIFT_EVAL_LOC = 0x36e0;
    uint256 internal constant W4_SHIFT_EVAL_LOC = 0x3700;
    uint256 internal constant Z_PERM_SHIFT_EVAL_LOC = 0x3720;

    // Shplemini
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_0_X0_LOC  =  0x3740 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_0_X1_LOC  =  0x3760 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_0_Y0_LOC  =  0x3780 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_0_Y1_LOC  =  0x37a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_1_X0_LOC  =  0x37c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_1_X1_LOC  =  0x37e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_1_Y0_LOC  =  0x3800 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_1_Y1_LOC  =  0x3820 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_2_X0_LOC  =  0x3840 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_2_X1_LOC  =  0x3860 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_2_Y0_LOC  =  0x3880 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_2_Y1_LOC  =  0x38a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_3_X0_LOC  =  0x38c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_3_X1_LOC  =  0x38e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_3_Y0_LOC  =  0x3900 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_3_Y1_LOC  =  0x3920 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_4_X0_LOC  =  0x3940 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_4_X1_LOC  =  0x3960 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_4_Y0_LOC  =  0x3980 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_4_Y1_LOC  =  0x39a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_5_X0_LOC  =  0x39c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_5_X1_LOC  =  0x39e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_5_Y0_LOC  =  0x3a00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_5_Y1_LOC  =  0x3a20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_6_X0_LOC  =  0x3a40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_6_X1_LOC  =  0x3a60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_6_Y0_LOC  =  0x3a80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_6_Y1_LOC  =  0x3aa0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_7_X0_LOC  =  0x3ac0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_7_X1_LOC  =  0x3ae0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_7_Y0_LOC  =  0x3b00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_7_Y1_LOC  =  0x3b20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_8_X0_LOC  =  0x3b40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_8_X1_LOC  =  0x3b60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_8_Y0_LOC  =  0x3b80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_8_Y1_LOC  =  0x3ba0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_9_X0_LOC  =  0x3bc0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_9_X1_LOC  =  0x3be0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_9_Y0_LOC  =  0x3c00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_9_Y1_LOC  =  0x3c20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_10_X0_LOC  =  0x3c40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_10_X1_LOC  =  0x3c60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_10_Y0_LOC  =  0x3c80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_10_Y1_LOC  =  0x3ca0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_11_X0_LOC  =  0x3cc0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_11_X1_LOC  =  0x3ce0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_11_Y0_LOC  =  0x3d00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_11_Y1_LOC  =  0x3d20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_12_X0_LOC  =  0x3d40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_12_X1_LOC  =  0x3d60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_12_Y0_LOC  =  0x3d80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_12_Y1_LOC  =  0x3da0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_13_X0_LOC  =  0x3dc0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_13_X1_LOC  =  0x3de0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_13_Y0_LOC  =  0x3e00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_13_Y1_LOC  =  0x3e20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_14_X0_LOC  =  0x3e40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_14_X1_LOC  =  0x3e60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_14_Y0_LOC  =  0x3e80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_14_Y1_LOC  =  0x3ea0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_15_X0_LOC  =  0x3ec0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_15_X1_LOC  =  0x3ee0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_15_Y0_LOC  =  0x3f00 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_15_Y1_LOC  =  0x3f20 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_16_X0_LOC  =  0x3f40 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_16_X1_LOC  =  0x3f60 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_16_Y0_LOC  =  0x3f80 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_16_Y1_LOC  =  0x3fa0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_17_X0_LOC  =  0x3fc0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_17_X1_LOC  =  0x3fe0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_17_Y0_LOC  =  0x4000 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_17_Y1_LOC  =  0x4020 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_18_X0_LOC  =  0x4040 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_18_X1_LOC  =  0x4060 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_18_Y0_LOC  =  0x4080 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_18_Y1_LOC  =  0x40a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_19_X0_LOC  =  0x40c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_19_X1_LOC  =  0x40e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_19_Y0_LOC  =  0x4100 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_19_Y1_LOC  =  0x4120 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_20_X0_LOC  =  0x4140 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_20_X1_LOC  =  0x4160 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_20_Y0_LOC  =  0x4180 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_20_Y1_LOC  =  0x41a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_21_X0_LOC  =  0x41c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_21_X1_LOC  =  0x41e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_21_Y0_LOC  =  0x4200 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_21_Y1_LOC  =  0x4220 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_22_X0_LOC  =  0x4240 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_22_X1_LOC  =  0x4260 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_22_Y0_LOC  =  0x4280 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_22_Y1_LOC  =  0x42a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_23_X0_LOC  =  0x42c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_23_X1_LOC  =  0x42e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_23_Y0_LOC  =  0x4300 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_23_Y1_LOC  =  0x4320 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_24_X0_LOC  =  0x4340 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_24_X1_LOC  =  0x4360 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_24_Y0_LOC  =  0x4380 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_24_Y1_LOC  =  0x43a0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_25_X0_LOC  =  0x43c0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_25_X1_LOC  =  0x43e0 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_25_Y0_LOC  =  0x4400 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_25_Y1_LOC  =  0x4420 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_26_X0_LOC  =  0x4440 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_26_X1_LOC  =  0x4460 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_26_Y0_LOC  =  0x4480 ;
uint256 internal constant  GEMINI_FOLD_UNIVARIATE_26_Y1_LOC  =  0x44a0 ;
uint256 internal constant  GEMINI_A_EVAL_0  =  0x44c0 ;
uint256 internal constant  GEMINI_A_EVAL_1  =  0x44e0 ;
uint256 internal constant  GEMINI_A_EVAL_2  =  0x4500 ;
uint256 internal constant  GEMINI_A_EVAL_3  =  0x4520 ;
uint256 internal constant  GEMINI_A_EVAL_4  =  0x4540 ;
uint256 internal constant  GEMINI_A_EVAL_5  =  0x4560 ;
uint256 internal constant  GEMINI_A_EVAL_6  =  0x4580 ;
uint256 internal constant  GEMINI_A_EVAL_7  =  0x45a0 ;
uint256 internal constant  GEMINI_A_EVAL_8  =  0x45c0 ;
uint256 internal constant  GEMINI_A_EVAL_9  =  0x45e0 ;
uint256 internal constant  GEMINI_A_EVAL_10  =  0x4600 ;
uint256 internal constant  GEMINI_A_EVAL_11  =  0x4620 ;
uint256 internal constant  GEMINI_A_EVAL_12  =  0x4640 ;
uint256 internal constant  GEMINI_A_EVAL_13  =  0x4660 ;
uint256 internal constant  GEMINI_A_EVAL_14  =  0x4680 ;
uint256 internal constant  GEMINI_A_EVAL_15  =  0x46a0 ;
uint256 internal constant  GEMINI_A_EVAL_16  =  0x46c0 ;
uint256 internal constant  GEMINI_A_EVAL_17  =  0x46e0 ;
uint256 internal constant  GEMINI_A_EVAL_18  =  0x4700 ;
uint256 internal constant  GEMINI_A_EVAL_19  =  0x4720 ;
uint256 internal constant  GEMINI_A_EVAL_20  =  0x4740 ;
uint256 internal constant  GEMINI_A_EVAL_21  =  0x4760 ;
uint256 internal constant  GEMINI_A_EVAL_22  =  0x4780 ;
uint256 internal constant  GEMINI_A_EVAL_23  =  0x47a0 ;
uint256 internal constant  GEMINI_A_EVAL_24  =  0x47c0 ;
uint256 internal constant  GEMINI_A_EVAL_25  =  0x47e0 ;
uint256 internal constant  GEMINI_A_EVAL_26  =  0x4800 ;
uint256 internal constant  GEMINI_A_EVAL_27  =  0x4820 ;
uint256 internal constant  SHPLONK_Q_X0_LOC  =  0x4840 ;
uint256 internal constant  SHPLONK_Q_X1_LOC  =  0x4860 ;
uint256 internal constant  SHPLONK_Q_Y0_LOC  =  0x4880 ;
uint256 internal constant  SHPLONK_Q_Y1_LOC  =  0x48a0 ;
uint256 internal constant  KZG_QUOTIENT_X0_LOC  =  0x48c0 ;
uint256 internal constant  KZG_QUOTIENT_X1_LOC  =  0x48e0 ;
uint256 internal constant  KZG_QUOTIENT_Y0_LOC  =  0x4900 ;
uint256 internal constant  KZG_QUOTIENT_Y1_LOC  =  0x4920 ;

// Challenges
uint256 internal constant  ETA_CHALLENGE  =  0x4940 ;
uint256 internal constant  ETA_TWO_CHALLENGE  =  0x4960 ;
uint256 internal constant  ETA_THREE_CHALLENGE  =  0x4980 ;
uint256 internal constant  BETA_CHALLENGE  =  0x49a0 ;
uint256 internal constant  GAMMA_CHALLENGE  =  0x49c0 ;
uint256 internal constant  RHO_CHALLENGE  =  0x49e0 ;
uint256 internal constant  GEMINI_R_CHALLENGE  =  0x4a00 ;
uint256 internal constant  SHPLONK_NU_CHALLENGE  =  0x4a20 ;
uint256 internal constant  SHPLONK_Z_CHALLENGE  =  0x4a40 ;
uint256 internal constant  PUBLIC_INPUTS_DELTA_NUMERATOR  =  0x4a60 ;
uint256 internal constant  PUBLIC_INPUTS_DELTA_DENOMINATOR  =  0x4a80 ;
uint256 internal constant  ALPHA_CHALLENGE_0  =  0x4aa0 ;
uint256 internal constant  ALPHA_CHALLENGE_1  =  0x4ac0 ;
uint256 internal constant  ALPHA_CHALLENGE_2  =  0x4ae0 ;
uint256 internal constant  ALPHA_CHALLENGE_3  =  0x4b00 ;
uint256 internal constant  ALPHA_CHALLENGE_4  =  0x4b20 ;
uint256 internal constant  ALPHA_CHALLENGE_5  =  0x4b40 ;
uint256 internal constant  ALPHA_CHALLENGE_6  =  0x4b60 ;
uint256 internal constant  ALPHA_CHALLENGE_7  =  0x4b80 ;
uint256 internal constant  ALPHA_CHALLENGE_8  =  0x4ba0 ;
uint256 internal constant  ALPHA_CHALLENGE_9  =  0x4bc0 ;
uint256 internal constant  ALPHA_CHALLENGE_10  =  0x4be0 ;
uint256 internal constant  ALPHA_CHALLENGE_11  =  0x4c00 ;
uint256 internal constant  ALPHA_CHALLENGE_12  =  0x4c20 ;
uint256 internal constant  ALPHA_CHALLENGE_13  =  0x4c40 ;
uint256 internal constant  ALPHA_CHALLENGE_14  =  0x4c60 ;
uint256 internal constant  ALPHA_CHALLENGE_15  =  0x4c80 ;
uint256 internal constant  ALPHA_CHALLENGE_16  =  0x4ca0 ;
uint256 internal constant  ALPHA_CHALLENGE_17  =  0x4cc0 ;
uint256 internal constant  ALPHA_CHALLENGE_18  =  0x4ce0 ;
uint256 internal constant  ALPHA_CHALLENGE_19  =  0x4d00 ;
uint256 internal constant  ALPHA_CHALLENGE_20  =  0x4d20 ;
uint256 internal constant  ALPHA_CHALLENGE_21  =  0x4d40 ;
uint256 internal constant  ALPHA_CHALLENGE_22  =  0x4d60 ;
uint256 internal constant  ALPHA_CHALLENGE_23  =  0x4d80 ;
uint256 internal constant  ALPHA_CHALLENGE_24  =  0x4da0 ;
uint256 internal constant  GATE_CHALLENGE_0  =  0x4dc0 ;
uint256 internal constant  GATE_CHALLENGE_1  =  0x4de0 ;
uint256 internal constant  GATE_CHALLENGE_2  =  0x4e00 ;
uint256 internal constant  GATE_CHALLENGE_3  =  0x4e20 ;
uint256 internal constant  GATE_CHALLENGE_4  =  0x4e40 ;
uint256 internal constant  GATE_CHALLENGE_5  =  0x4e60 ;
uint256 internal constant  GATE_CHALLENGE_6  =  0x4e80 ;
uint256 internal constant  GATE_CHALLENGE_7  =  0x4ea0 ;
uint256 internal constant  GATE_CHALLENGE_8  =  0x4ec0 ;
uint256 internal constant  GATE_CHALLENGE_9  =  0x4ee0 ;
uint256 internal constant  GATE_CHALLENGE_10  =  0x4f00 ;
uint256 internal constant  GATE_CHALLENGE_11  =  0x4f20 ;
uint256 internal constant  GATE_CHALLENGE_12  =  0x4f40 ;
uint256 internal constant  GATE_CHALLENGE_13  =  0x4f60 ;
uint256 internal constant  GATE_CHALLENGE_14  =  0x4f80 ;
uint256 internal constant  GATE_CHALLENGE_15  =  0x4fa0 ;
uint256 internal constant  GATE_CHALLENGE_16  =  0x4fc0 ;
uint256 internal constant  GATE_CHALLENGE_17  =  0x4fe0 ;
uint256 internal constant  GATE_CHALLENGE_18  =  0x5000 ;
uint256 internal constant  GATE_CHALLENGE_19  =  0x5020 ;
uint256 internal constant  GATE_CHALLENGE_20  =  0x5040 ;
uint256 internal constant  GATE_CHALLENGE_21  =  0x5060 ;
uint256 internal constant  GATE_CHALLENGE_22  =  0x5080 ;
uint256 internal constant  GATE_CHALLENGE_23  =  0x50a0 ;
uint256 internal constant  GATE_CHALLENGE_24  =  0x50c0 ;
uint256 internal constant  GATE_CHALLENGE_25  =  0x50e0 ;
uint256 internal constant  GATE_CHALLENGE_26  =  0x5100 ;
uint256 internal constant  GATE_CHALLENGE_27  =  0x5120 ;
uint256 internal constant  SUM_U_CHALLENGE_0  =  0x5140 ;
uint256 internal constant  SUM_U_CHALLENGE_1  =  0x5160 ;
uint256 internal constant  SUM_U_CHALLENGE_2  =  0x5180 ;
uint256 internal constant  SUM_U_CHALLENGE_3  =  0x51a0 ;
uint256 internal constant  SUM_U_CHALLENGE_4  =  0x51c0 ;
uint256 internal constant  SUM_U_CHALLENGE_5  =  0x51e0 ;
uint256 internal constant  SUM_U_CHALLENGE_6  =  0x5200 ;
uint256 internal constant  SUM_U_CHALLENGE_7  =  0x5220 ;
uint256 internal constant  SUM_U_CHALLENGE_8  =  0x5240 ;
uint256 internal constant  SUM_U_CHALLENGE_9  =  0x5260 ;
uint256 internal constant  SUM_U_CHALLENGE_10  =  0x5280 ;
uint256 internal constant  SUM_U_CHALLENGE_11  =  0x52a0 ;
uint256 internal constant  SUM_U_CHALLENGE_12  =  0x52c0 ;
uint256 internal constant  SUM_U_CHALLENGE_13  =  0x52e0 ;
uint256 internal constant  SUM_U_CHALLENGE_14  =  0x5300 ;
uint256 internal constant  SUM_U_CHALLENGE_15  =  0x5320 ;
uint256 internal constant  SUM_U_CHALLENGE_16  =  0x5340 ;
uint256 internal constant  SUM_U_CHALLENGE_17  =  0x5360 ;
uint256 internal constant  SUM_U_CHALLENGE_18  =  0x5380 ;
uint256 internal constant  SUM_U_CHALLENGE_19  =  0x53a0 ;
uint256 internal constant  SUM_U_CHALLENGE_20  =  0x53c0 ;
uint256 internal constant  SUM_U_CHALLENGE_21  =  0x53e0 ;
uint256 internal constant  SUM_U_CHALLENGE_22  =  0x5400 ;
uint256 internal constant  SUM_U_CHALLENGE_23  =  0x5420 ;
uint256 internal constant  SUM_U_CHALLENGE_24  =  0x5440 ;
uint256 internal constant  SUM_U_CHALLENGE_25  =  0x5460 ;
uint256 internal constant  SUM_U_CHALLENGE_26  =  0x5480 ;
uint256 internal constant  SUM_U_CHALLENGE_27  =  0x54a0 ;

// Barycentric domain
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC  =  0x54c0 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_1_LOC  =  0x54e0 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_2_LOC  =  0x5500 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_3_LOC  =  0x5520 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_4_LOC  =  0x5540 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_5_LOC  =  0x5560 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_6_LOC  =  0x5580 ;
uint256 internal constant  BARYCENTRIC_LAGRANGE_DENOMINATOR_7_LOC  =  0x55a0 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_0_LOC  =  0x55c0 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_1_LOC  =  0x55e0 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_2_LOC  =  0x5600 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_3_LOC  =  0x5620 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_4_LOC  =  0x5640 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_5_LOC  =  0x5660 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_6_LOC  =  0x5680 ;
uint256 internal constant  BARYCENTRIC_DOMAIN_7_LOC  =  0x56a0 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_0_LOC  =  0x56c0 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_1_LOC  =  0x56e0 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_2_LOC  =  0x5700 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_3_LOC  =  0x5720 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_4_LOC  =  0x5740 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_5_LOC  =  0x5760 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_6_LOC  =  0x5780 ;
uint256 internal constant  BARYCENTRIC_DENOMINATOR_INVERSES_7_LOC  =  0x57a0 ;

// Subrelation evaluations
uint256 internal constant  SUBRELATION_EVAL_0_LOC  =  0x57c0 ;
uint256 internal constant  SUBRELATION_EVAL_1_LOC  =  0x57e0 ;
uint256 internal constant  SUBRELATION_EVAL_2_LOC  =  0x5800 ;
uint256 internal constant  SUBRELATION_EVAL_3_LOC  =  0x5820 ;
uint256 internal constant  SUBRELATION_EVAL_4_LOC  =  0x5840 ;
uint256 internal constant  SUBRELATION_EVAL_5_LOC  =  0x5860 ;
uint256 internal constant  SUBRELATION_EVAL_6_LOC  =  0x5880 ;
uint256 internal constant  SUBRELATION_EVAL_7_LOC  =  0x58a0 ;
uint256 internal constant  SUBRELATION_EVAL_8_LOC  =  0x58c0 ;
uint256 internal constant  SUBRELATION_EVAL_9_LOC  =  0x58e0 ;
uint256 internal constant  SUBRELATION_EVAL_10_LOC  =  0x5900 ;
uint256 internal constant  SUBRELATION_EVAL_11_LOC  =  0x5920 ;
uint256 internal constant  SUBRELATION_EVAL_12_LOC  =  0x5940 ;
uint256 internal constant  SUBRELATION_EVAL_13_LOC  =  0x5960 ;
uint256 internal constant  SUBRELATION_EVAL_14_LOC  =  0x5980 ;
uint256 internal constant  SUBRELATION_EVAL_15_LOC  =  0x59a0 ;
uint256 internal constant  SUBRELATION_EVAL_16_LOC  =  0x59c0 ;
uint256 internal constant  SUBRELATION_EVAL_17_LOC  =  0x59e0 ;
uint256 internal constant  SUBRELATION_EVAL_18_LOC  =  0x5a00 ;
uint256 internal constant  SUBRELATION_EVAL_19_LOC  =  0x5a20 ;
uint256 internal constant  SUBRELATION_EVAL_20_LOC  =  0x5a40 ;
uint256 internal constant  SUBRELATION_EVAL_21_LOC  =  0x5a60 ;
uint256 internal constant  SUBRELATION_EVAL_22_LOC  =  0x5a80 ;
uint256 internal constant  SUBRELATION_EVAL_23_LOC  =  0x5aa0 ;
uint256 internal constant  SUBRELATION_EVAL_24_LOC  =  0x5ac0 ;
uint256 internal constant  SUBRELATION_EVAL_25_LOC  =  0x5ae0 ;

// Subrelation intermediates
uint256 internal constant  FINAL_ROUND_TARGET_LOC  =  0x5b00 ;
uint256 internal constant  POW_PARTIAL_EVALUATION_LOC  =  0x5b20 ;
uint256 internal constant  AUX_NON_NATIVE_FIELD_IDENTITY  =  0x5b40 ;
uint256 internal constant  AUX_LIMB_ACCUMULATOR_IDENTITY  =  0x5b60 ;
uint256 internal constant  AUX_RAM_CONSISTENCY_CHECK_IDENTITY  =  0x5b80 ;
uint256 internal constant  AUX_ROM_CONSISTENCY_CHECK_IDENTITY  =  0x5ba0 ;
uint256 internal constant  AUX_MEMORY_CHECK_IDENTITY  =  0x5bc0 ;


    // TODO(md): shplemini regions can be reused for the reserved sumcheck regions
    // 28 powers of evaluation challenge
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_0_LOC = 0x5be0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_1_LOC = 0x5c00;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_2_LOC = 0x5c20;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_3_LOC = 0x5c40;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_4_LOC = 0x5c60;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_5_LOC = 0x5c80;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_6_LOC = 0x5ca0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_7_LOC = 0x5cc0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_8_LOC = 0x5ce0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_9_LOC = 0x5d00;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_10_LOC = 0x5d20;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_11_LOC = 0x5d40;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_12_LOC = 0x5d60;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_13_LOC = 0x5d80;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_14_LOC = 0x5da0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_15_LOC = 0x5dc0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_16_LOC = 0x5de0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_17_LOC = 0x5e00;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_18_LOC = 0x5e20;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_19_LOC = 0x5e40;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_20_LOC = 0x5e60;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_21_LOC = 0x5e80;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_22_LOC = 0x5ea0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_23_LOC = 0x5ec0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_24_LOC = 0x5ee0;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_25_LOC = 0x5f00;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_26_LOC = 0x5f20;
    uint256 internal constant POWERS_OF_EVALUATION_CHALLENGE_27_LOC = 0x5f40;

    // 29 Inverted Gemini Denominators
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_0_LOC = 0x5f60;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_1_LOC = 0x5f80;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_2_LOC = 0x5fa0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_3_LOC = 0x5fc0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_4_LOC = 0x5fe0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_5_LOC = 0x6000;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_6_LOC = 0x6020;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_7_LOC = 0x6040;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_8_LOC = 0x6060;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_9_LOC = 0x6080;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_10_LOC = 0x60a0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_11_LOC = 0x60c0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_12_LOC = 0x60e0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_13_LOC = 0x6100;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_14_LOC = 0x6120;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_15_LOC = 0x6140;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_16_LOC = 0x6160;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_17_LOC = 0x6180;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_18_LOC = 0x61a0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_19_LOC = 0x61c0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_20_LOC = 0x61e0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_21_LOC = 0x6200;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_22_LOC = 0x6220;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_23_LOC = 0x6240;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_24_LOC = 0x6260;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_25_LOC = 0x6280;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_26_LOC = 0x62a0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_27_LOC = 0x62c0;
    uint256 internal constant INVERTED_GEMINI_DENOMINATOR_28_LOC = 0x62e0;

    // TODO: memory slots can be used and this will be deleted in time
    // The batch accumulator stores intermediate values when calculating the
    // Inverted Gemini Denominator
    // For the given circuit, this will require LOG_N + 1 iterations - we store the intermediate
    // accumulators in montgomery batch inversion up until this LOG_N. So there are LOG_N + 1
    // intermediate values to store
    // Note: not all LOG_N + 1 values are stored in memory as some will live on the stack
    //
    // Note: We have left enough scratch space that we could possibly use that instead for
    // storing these values
    uint256 internal constant BATCH_ACCUMULATOR_0_LOC = 0x6300;
    uint256 internal constant BATCH_ACCUMULATOR_1_LOC = 0x6320;
    uint256 internal constant BATCH_ACCUMULATOR_2_LOC = 0x6340;
    uint256 internal constant BATCH_ACCUMULATOR_3_LOC = 0x6360;
    uint256 internal constant BATCH_ACCUMULATOR_4_LOC = 0x6380;
    uint256 internal constant BATCH_ACCUMULATOR_5_LOC = 0x63a0;
    uint256 internal constant BATCH_ACCUMULATOR_6_LOC = 0x63c0;
    uint256 internal constant BATCH_ACCUMULATOR_7_LOC = 0x63e0;
    uint256 internal constant BATCH_ACCUMULATOR_8_LOC = 0x6400;


    // WORKTODO: We should NOT need these values, we can instead reuse the sumcheck evaluations memory regions
    // SCALARS FOR SHPLONK BATCHING
    //
    // TODO: write a more thorough explaination of what these are for and how they are used
    // NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2 = 44 + 28 + 2 = 74
    uint256 internal constant  BATCH_SCALAR_0_LOC  =  0x6420 ;
    uint256 internal constant  BATCH_SCALAR_1_LOC  =  0x6440 ;
    uint256 internal constant  BATCH_SCALAR_2_LOC  =  0x6460 ;
    uint256 internal constant  BATCH_SCALAR_3_LOC  =  0x6480 ;
    uint256 internal constant  BATCH_SCALAR_4_LOC  =  0x64a0 ;
    uint256 internal constant  BATCH_SCALAR_5_LOC  =  0x64c0 ;
    uint256 internal constant  BATCH_SCALAR_6_LOC  =  0x64e0 ;
    uint256 internal constant  BATCH_SCALAR_7_LOC  =  0x6500 ;
    uint256 internal constant  BATCH_SCALAR_8_LOC  =  0x6520 ;
    uint256 internal constant  BATCH_SCALAR_9_LOC  =  0x6540 ;
    uint256 internal constant  BATCH_SCALAR_10_LOC  =  0x6560 ;
    uint256 internal constant  BATCH_SCALAR_11_LOC  =  0x6580 ;
    uint256 internal constant  BATCH_SCALAR_12_LOC  =  0x65a0 ;
    uint256 internal constant  BATCH_SCALAR_13_LOC  =  0x65c0 ;
    uint256 internal constant  BATCH_SCALAR_14_LOC  =  0x65e0 ;
    uint256 internal constant  BATCH_SCALAR_15_LOC  =  0x6600 ;
    uint256 internal constant  BATCH_SCALAR_16_LOC  =  0x6620 ;
    uint256 internal constant  BATCH_SCALAR_17_LOC  =  0x6640 ;
    uint256 internal constant  BATCH_SCALAR_18_LOC  =  0x6660 ;
    uint256 internal constant  BATCH_SCALAR_19_LOC  =  0x6680 ;
    uint256 internal constant  BATCH_SCALAR_20_LOC  =  0x66a0 ;
    uint256 internal constant  BATCH_SCALAR_21_LOC  =  0x66c0 ;
    uint256 internal constant  BATCH_SCALAR_22_LOC  =  0x66e0 ;
    uint256 internal constant  BATCH_SCALAR_23_LOC  =  0x6700 ;
    uint256 internal constant  BATCH_SCALAR_24_LOC  =  0x6720 ;
    uint256 internal constant  BATCH_SCALAR_25_LOC  =  0x6740 ;
    uint256 internal constant  BATCH_SCALAR_26_LOC  =  0x6760 ;
    uint256 internal constant  BATCH_SCALAR_27_LOC  =  0x6780 ;
    uint256 internal constant  BATCH_SCALAR_28_LOC  =  0x67a0 ;
    uint256 internal constant  BATCH_SCALAR_29_LOC  =  0x67c0 ;
    uint256 internal constant  BATCH_SCALAR_30_LOC  =  0x67e0 ;
    uint256 internal constant  BATCH_SCALAR_31_LOC  =  0x6800 ;
    uint256 internal constant  BATCH_SCALAR_32_LOC  =  0x6820 ;
    uint256 internal constant  BATCH_SCALAR_33_LOC  =  0x6840 ;
    uint256 internal constant  BATCH_SCALAR_34_LOC  =  0x6860 ;
    uint256 internal constant  BATCH_SCALAR_35_LOC  =  0x6880 ;
    uint256 internal constant  BATCH_SCALAR_36_LOC  =  0x68a0 ;
    uint256 internal constant  BATCH_SCALAR_37_LOC  =  0x68c0 ;
    uint256 internal constant  BATCH_SCALAR_38_LOC  =  0x68e0 ;
    uint256 internal constant  BATCH_SCALAR_39_LOC  =  0x6900 ;
    uint256 internal constant  BATCH_SCALAR_40_LOC  =  0x6920 ;
    uint256 internal constant  BATCH_SCALAR_41_LOC  =  0x6940 ;
    uint256 internal constant  BATCH_SCALAR_42_LOC  =  0x6960 ;
    uint256 internal constant  BATCH_SCALAR_43_LOC  =  0x6980 ;
    uint256 internal constant  BATCH_SCALAR_44_LOC  =  0x69a0 ;
    uint256 internal constant  BATCH_SCALAR_45_LOC  =  0x69c0 ;
    uint256 internal constant  BATCH_SCALAR_46_LOC  =  0x69e0 ;
    uint256 internal constant  BATCH_SCALAR_47_LOC  =  0x6a00 ;
    uint256 internal constant  BATCH_SCALAR_48_LOC  =  0x6a20 ;
    uint256 internal constant  BATCH_SCALAR_49_LOC  =  0x6a40 ;
    uint256 internal constant  BATCH_SCALAR_50_LOC  =  0x6a60 ;
    uint256 internal constant  BATCH_SCALAR_51_LOC  =  0x6a80 ;
    uint256 internal constant  BATCH_SCALAR_52_LOC  =  0x6aa0 ;
    uint256 internal constant  BATCH_SCALAR_53_LOC  =  0x6ac0 ;
    uint256 internal constant  BATCH_SCALAR_54_LOC  =  0x6ae0 ;
    uint256 internal constant  BATCH_SCALAR_55_LOC  =  0x6b00 ;
    uint256 internal constant  BATCH_SCALAR_56_LOC  =  0x6b20 ;
    uint256 internal constant  BATCH_SCALAR_57_LOC  =  0x6b40 ;
    uint256 internal constant  BATCH_SCALAR_58_LOC  =  0x6b60 ;
    uint256 internal constant  BATCH_SCALAR_59_LOC  =  0x6b80 ;
    uint256 internal constant  BATCH_SCALAR_60_LOC  =  0x6ba0 ;
    uint256 internal constant  BATCH_SCALAR_61_LOC  =  0x6bc0 ;
    uint256 internal constant  BATCH_SCALAR_62_LOC  =  0x6be0 ;
    uint256 internal constant  BATCH_SCALAR_63_LOC  =  0x6c00 ;
    uint256 internal constant  BATCH_SCALAR_64_LOC  =  0x6c20 ;
    uint256 internal constant  BATCH_SCALAR_65_LOC  =  0x6c40 ;
    uint256 internal constant  BATCH_SCALAR_66_LOC  =  0x6c60 ;
    uint256 internal constant  BATCH_SCALAR_67_LOC  =  0x6c80 ;
    uint256 internal constant  BATCH_SCALAR_68_LOC  =  0x6ca0 ;
    uint256 internal constant  BATCH_SCALAR_69_LOC  =  0x6cc0 ;
    uint256 internal constant  BATCH_SCALAR_70_LOC  =  0x6ce0 ;
    uint256 internal constant  BATCH_SCALAR_71_LOC  =  0x6d00 ;
    uint256 internal constant  BATCH_SCALAR_72_LOC  =  0x6d20 ;
    uint256 internal constant  BATCH_SCALAR_73_LOC  =  0x6d40 ;

    // TODO: PROSE
    // LOG_N inverted values, used in calculating inversions
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_0_LOC = 0x6d60;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_1_LOC = 0x6d80;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_2_LOC = 0x6da0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_3_LOC = 0x6dc0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_4_LOC = 0x6de0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_5_LOC = 0x6e00;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_6_LOC = 0x6e20;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_7_LOC = 0x6e40;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_8_LOC = 0x6e60;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_9_LOC = 0x6e80;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_10_LOC = 0x6ea0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_11_LOC = 0x6ec0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_12_LOC = 0x6ee0;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_13_LOC = 0x6f00;
    uint256 internal constant BATCHED_EVALUATION_ACCUMULATOR_INVERSION_14_LOC = 0x6f20;

    // WORKTODO: could another place be reused here?
    uint256 internal constant BATCHED_EVALUATION_LOC =  0x6f40;
    uint256 internal constant CONSTANT_TERM_ACCUMULATOR_LOC = 0x6f60;

    // Aliases
    // Aliases for wire values (Elliptic curve gadget)
    uint256 internal constant EC_X_1 = W2_EVAL_LOC;
    uint256 internal constant EC_Y_1 = W3_EVAL_LOC;
    uint256 internal constant EC_X_2 = W1_SHIFT_EVAL_LOC;
    uint256 internal constant EC_Y_2 = W4_SHIFT_EVAL_LOC;
    uint256 internal constant EC_Y_3 = W3_SHIFT_EVAL_LOC;
    uint256 internal constant EC_X_3 = W2_SHIFT_EVAL_LOC;

    // Aliases for selectors (Elliptic curve gadget)
    uint256 internal constant EC_Q_SIGN = Q1_EVAL_LOC;
    uint256 internal constant EC_Q_IS_DOUBLE = QM_EVAL_LOC;

    // -1/2 mod p
    uint256 internal constant NEG_HALF_MODULO_P = 0x183227397098d014dc2822db40c0ac2e9419f4243cdcb848a1f0fac9f8000000;
    uint256 internal constant GRUMPKIN_CURVE_B_PARAMETER_NEGATED = 17; // -(-17)

    // Auxiliary relation constants
    uint256 internal constant LIMB_SIZE = 0x100000000000000000; // 2<<68
    uint256 internal constant SUBLIMB_SHIFT = 0x4000; // 2<<14

    // Poseidon internal constants

    uint256 internal constant POS_INTENAL_MATRIX_D_0 = 0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7;
    uint256 internal constant POS_INTENAL_MATRIX_D_1 = 0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b;
    uint256 internal constant POS_INTENAL_MATRIX_D_2 = 0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15;
    uint256 internal constant POS_INTENAL_MATRIX_D_3 = 0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b;

    // Constants inspecting proof components
    uint256 internal constant NUMBER_OF_UNSHIFTED_ENTITIES = 35;
    uint256 internal constant NUMBER_OF_SHIFTED_ENTITIES = 9;
    uint256 internal constant TOTAL_NUMBER_OF_ENTITIES = 44;

    // Constants for performing batch multiplication
    uint256 internal constant ACCUMULATOR = 0x00;
    uint256 internal constant ACCUMULATOR_2 = 0x40;
    uint256 internal constant G1_LOCATION = 0x60;
    uint256 internal constant SCALAR_LOCATION = 0xa0;


    // Error selectors
    uint256 internal constant PUBLIC_INPUT_TOO_LARGE_SELECTOR = 0x01;
    uint256 internal constant SUMCHECK_FAILED_SELECTOR = 0x02;
    uint256 internal constant PAIRING_FAILED_SELECTOR = 0x03;
    uint256 internal constant BATCH_ACCUMULATION_FAILED_SELECTOR = 0x04;
    uint256 internal constant MODEXP_FAILED_SELECTOR = 0x05;
    uint256 internal constant PROOF_POINT_NOT_ON_CURVE_SELECTOR = 0x06;

    constructor() {
        // TODO: verify the points are on the curve in the constructor
    }


    uint256 internal constant LOWER_128_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) public override returns (bool) {
        // uint256 gasBefore = gasleft();

        // Load the verification key into memory

        // Load the proof from calldata in one large chunk
        assembly {
            // Inline the verification key code here for the meantime
            // will be in it's own library
            // Note the split committments here will make a difference to costs in the end
            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                   LOAD VERIFCATION KEY                     */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            // Write the verification key into memory
            function loadVk() {
                // TODO: in the vk GENERATOR swap the location of l and m

                mstore(q_l_x_loc, 0x2e5f133c25f7e05bd6660196c892121f7fa686cb9a8717a5deea6cd0881e618e)
                mstore(q_l_y_loc, 0x1189bba9eeea96ba8935052434f4b0a60b0a481e3464dd81dfcd89e23def001b)
                mstore(q_r_x_loc, 0x2a93ffb34002da94f5b156ba5a212ac3616c848bd9c44c9821bbdd64cfd848af)
                mstore(q_r_y_loc, 0x015699dcc0b28766d45f5ddce8258393e84c40619d26034e76f778460a1e4d89)
                mstore(q_o_x_loc, 0x2057928e8c5eb539c32c3025007b7be1e1663c358f59540c6f949794c274f886)
                mstore(q_o_y_loc, 0x12bf0b15c3aa92792330f58b04512714c4a902e537fe87cc438293e1805eaabf)
                mstore(q_4_x_loc, 0x304f47a08d4687afa0e2502a9782c32c458bf873ef50c169b732a367e567aaf3)
                mstore(q_4_y_loc, 0x0bb37044594e7de200408a4db6bc46adf7790b06f17dce6f38b7deed480aa9f0)
                mstore(q_m_x_loc, 0x0aea5b04332ad8781411f7edde21266857ffe11e93af334b14a2b948429afaa4)
                mstore(q_m_y_loc, 0x2bd2e3884d486b387122effa12e8698daef82e9b99d7d25b7d5df91a9d738495)
                mstore(q_c_x_loc, 0x0e3b418ea1924b4514d5009cd983b5a8074fa95cd1fb200f019fdebe944e4225)
                mstore(q_c_y_loc, 0x1e6ef5bde7a9727f1c1d07c91461ae1b40524650b35fdd92ac7a129f263b1beb)
                mstore(q_arith_x_loc, 0x096841bfa8ec2295a5af5bf69ec539c31a05b221c84ed1d24c702e31ce1cbc95)
                mstore(q_arith_y_loc, 0x10b14cca7e9ff05fcf1e3084f4fc9ab098cf379864b2e2e2e0d33fc5df9d9a50)
                mstore(q_delta_range_x_loc, 0x2d27fd1a30a0ab04a05144c27ac41187d5cf89a6022e47b263d1ccb93b3cbea5)
                mstore(q_delta_range_y_loc, 0x238eb233e9aebc81285a2647f2598bab00a4367da47b12c2b0476afc2d94ab1d)
                mstore(q_elliptic_x_loc, 0x1c6fc8e14453adf64e6d9643ef9f1fb55e3a307ac1ec84f86cd736fc866e05ab)
                mstore(q_elliptic_y_loc, 0x1bf8619b1704b99ab8820ed94dd760da2945e8e1c771c0bdeadbe40aa5700cdd)
                mstore(q_aux_x_loc, 0x023fe0703623b99c93358348d76eb620f26ceafa58df018e3a8f1d599a61e76f)
                mstore(q_aux_y_loc, 0x2ceb9c4c4ca12ea769157ef10cde9644f9f0549805e48d5fd5d73a634d2cdcb5)
                mstore(q_lookup_x_loc, 0x1375bbfbf5ed31b38460f46a43ac14e2cda93a3bc5cfd6e8a93cca356694a346)
                mstore(q_lookup_y_loc, 0x204c5173892c19a97a04b5f8419898063df5136489809ddb9f7eabb58d6858ab)
                mstore(q_poseidon_2_external_x_loc, 0x1fa8529236d7eacdab8dcd8169af30d334be103357577353e9ef08dfda841785)
                mstore(q_poseidon_2_external_y_loc, 0x055251b013746385e921b4620e55ef4f08b4d8afc4dbca7e6c3ca0f1b52c5a2b)
                mstore(q_poseidon_2_internal_x_loc, 0x1515283648ab8622ac6447f1fcf201a598d8df325279bfac9a6564924df97ee5)
                mstore(q_poseidon_2_internal_y_loc, 0x0335bb595984ad38686009bca08f5f420e3b4cf888fad5af4a99eca08190a315)
                mstore(sigma_1_x_loc, 0x26cec5ff3eb1b803c52fa1fefaac7a2be5cd13c1a1cc20bb9f22049c7f8597d2)
                mstore(sigma_1_y_loc, 0x07e80e74eb0e06d7c0c9a3fbbdea4e86e5934faa8142625f175320778bcba65f)
                mstore(sigma_2_x_loc, 0x140b2faaf30cb5fc528621f4a395943e7fab8198dc734ac13253dd249682dd2a)
                mstore(sigma_2_y_loc, 0x12709c4a13428f4704d284c90a81cc83280680185ae6298187e86debcd3e00f7)
                mstore(sigma_3_x_loc, 0x0aca5621e9f49279969497b3da0eb8a74c68c3513f4cf98e8b1d6f88567557a8)
                mstore(sigma_3_y_loc, 0x2664811311f75057a16267bc0479eaeea2424156417cc4d3f8bd286fac9aa5d2)
                mstore(sigma_4_x_loc, 0x04417c606a41393e73113ec3f834883dbeb302889199b888c0f5ea58a008ff98)
                mstore(sigma_4_y_loc, 0x0865670de7962d29b6a9012f28ea52113c4e2b55d7de44e829edec87dba1d5c2)
                // TODO: in the proog pointers above swap id and table - to line up with how they actually should be
                mstore(table_1_x_loc, 0x1ec1b607634e31421b5047dc99d7674d6505fed978df0f42a3504f9771a8a7fa)
                mstore(table_1_y_loc, 0x1da802c6dc2fe6cffc6f9ae983080c66690ceee40c181b4d51fdba6c5c360297)
                mstore(table_2_x_loc, 0x1e38a0a482b7174f429a3bef25fb0a7656abc88cfd215b8e8404132601620784)
                mstore(table_2_y_loc, 0x2e9ea07a995fa6d589e37fba2715f3f1fa338652ddf84d4e2e4f33dccadb9156)
                mstore(table_3_x_loc, 0x211a0833bb3c6f9ae6c94519b6878ed6157c4a080df786a053d9a19796b9a7f8)
                mstore(table_3_y_loc, 0x1a3a450e1a272aa1fe9f097acf359502ff69df617de4918b37a497def94db2b5)
                mstore(table_4_x_loc, 0x281a984aef14716cd5d8fc2759eb8ea2464909b5c57d97b6bc50e4dad74d92d3)
                mstore(table_4_y_loc, 0x169160e1505685aabd5bd60e994bac45162c6868235cc4252c8b87d0f12603fd)
                mstore(id_1_x_loc, 0x01c082a85908fea4c69c4e51436fba7d965e1d88e485da16e35d8f4e8af3b8bd)
                mstore(id_1_y_loc, 0x11b0ada021468b059aa6c27f4d4950ef65b98d4d8808ae21718bd8b90f9bb365)
                mstore(id_2_x_loc, 0x0b8667619755bd09c7970defeae2c920df2b17b41608303ae1d7393615dd04e4)
                mstore(id_2_y_loc, 0x1c5419cd435c5516ac566a9d1dfecdb4e10190c63f2dbd8a1932785caf022e2c)
                mstore(id_3_x_loc, 0x110aee72793c4b4ede92c1375f058b4170fcf01bf18f8f1ee934f7ae0fa26da5)
                mstore(id_3_y_loc, 0x15c4f6a01ff04ef6b5225c896dfb7060a7a2c320395bda410e756d6b507b7eb8)
                mstore(id_4_x_loc, 0x2472aba130e7ed2aefad128109415ec2bdeb56e81e3cbeacc93e00c95f203579)
                mstore(id_4_y_loc, 0x0c867d0f8e2f9c861574383b89020980358d898497f80c198a6c17c2f4daf9a4)
                mstore(lagrange_first_x_loc, 0x0000000000000000000000000000000000000000000000000000000000000001)
                mstore(lagrange_first_y_loc, 0x0000000000000000000000000000000000000000000000000000000000000002)
                mstore(lagrange_last_x_loc, 0x13b825e996cc8d600f363dca4481a54d6dd3da85900cd9f0a61fa02600851998)
                mstore(lagrange_last_y_loc, 0x151cb86205f2dc38a5651840c1a4b4928f3f3c98f77c2abd08336562986dc404)

            }


            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                     Split Challenge                        */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            /**We can reduce the amount of hashing done in the verifier by splitting the output of
             * hash functions into two 128 bit values
             */
            function splitChallenge(challenge) -> first, second {
                first := and(challenge, LOWER_128_MASK)
                second := shr(128, challenge)
            }

            let p := 21888242871839275222246405745257275088548364400416034343698204186575808495617 // Prime field order

            // Add the skip offset to the given pointer

            // TODO(md): potential further optimisations
            // Rather than mcpying the entire sections to be hashed, we would get away with copying the previous hash
            // into the value before ( by caching the value we are swapping it with in scratch space ) and then
            // copying the value back when we are done hashing
            // rather than copying the entire section over to the lower registers
            loadVk()
            {

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                  LOAD PROOF INTO MEMORY                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // As all of our proof points are written in contiguous parts of memory, we call use a single
                // calldatacopy to place all of our proof into the correct memory regions
                // We copy the entire proof into memory as we must hash each proof section for challenge
                // evaluation
                let proof_ptr := add(calldataload(0x04), 0x24)

                // TODO: make sure this is evaluated as const before shipping
                // The last item in the proof, and the first item in the proof
                let proof_size := sub(ETA_CHALLENGE, proof_circuit_size_loc)
                calldatacopy(proof_circuit_size_loc, proof_ptr, proof_size)

                // TODO(md): IMPORTANT: Mod all of the base field items by q, and all prime field items by p
                // for the sake of testing we are assuming that these are correct

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    GENERATE CHALLENGES                     */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                /*
                 * Proof points (affine coordinates) in the proof are in the following format, where offset is
                 * the offset in the entire proof until the first bit of the x coordinate
                 * offset + 0x00: x - lower bits
                 * offset + 0x20: x - higher bits
                 * offset + 0x40: y - lower bits
                 * offset + 0x60: y - higher bits
                 *
                 * Proof points are in this extended format at the moment as the proofs are optimised for
                 * consumption by recursive verifiers
                 * In the future, it is expect that these proofs will be shortened to be 64 bytes
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


                // The use of mcpy will be a life saver here
                // TODO: make sure that we have enough of a scratch space to work with here
                // TODO: use an mcpy alternative once off plane - is it available in yul yet?
                let number_of_public_inputs := mload(proof_num_public_inputs_loc)

                // Note: can be mcpyed from proof
                // TODO: work what memory can be used here - if we use 0 solidity at all we can get
                // away with ignoring free memory practices entirely
                mcopy(0x00, proof_circuit_size_loc, 0x60)

                let public_inputs_start := add(calldataload(0x24), 0x24)
                let public_inputs_size := mul(number_of_public_inputs, 0x20)
                // Copy the public inputs into the eta buffer
                calldatacopy(0x60, public_inputs_start, public_inputs_size)

                // 0x260 = 3 * 32 bytes + 4 * 96 bytes for (w1,w2,w3)
                let eta_input_length := add(0x1e0, public_inputs_size)

                // Note: size will change once proof points are made smaller for keccak flavor
                // Right now it is 0x20 * 16 - should be 8
                mcopy(add(0x60, public_inputs_size), w_l_x0_loc, 0x1a0)

                let prev_challenge := mod(keccak256(0x00, eta_input_length), p)
                mstore(0x00, prev_challenge)

                // TODO: remember how to function jump
                let eta, etaTwo := splitChallenge(prev_challenge)

                mstore(ETA_CHALLENGE, eta)
                mstore(ETA_TWO_CHALLENGE, etaTwo)

                prev_challenge := mod(keccak256(0x00, 0x20), p)

                mstore(0x00, prev_challenge)
                let eta_three := and(prev_challenge, LOWER_128_MASK)
                mstore(ETA_THREE_CHALLENGE, eta_three)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*             GENERATE BETA and GAMMAA  CHALLENGE            */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/

                // Generate Beta and Gamma Chalenges
                mcopy(0x20, lookup_read_counts_x0_loc, 0x180)

                prev_challenge := mod(keccak256(0x00, 0x1a0), p)
                mstore(0x00, prev_challenge)
                let beta, gamma := splitChallenge(prev_challenge)

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

                mcopy(0x20, lookup_inverses_x0_loc, 0x100)

                prev_challenge := mod(keccak256(0x00, 0x120), p)
                mstore(0x00, prev_challenge)
                let alphas_0, alphas_1 := splitChallenge(prev_challenge)
                mstore(ALPHA_CHALLENGE_0, alphas_0)
                mstore(ALPHA_CHALLENGE_1, alphas_1)

                let i := 1
                // TODO: if we can afford bytecode size - unroll this
                // For number of alphas / 2 ( 25 /2 )
                for {} lt(i, 12) { i := add(i, 1) } {
                    prev_challenge := mod(keccak256(0x00, 0x20), p)
                    mstore(0x00, prev_challenge)

                    let alpha_even, alpha_odd := splitChallenge(prev_challenge)

                    let alpha_off_set := add(ALPHA_CHALLENGE_0, mul(i, 0x40))
                    mstore(alpha_off_set, alpha_even)
                    mstore(add(alpha_off_set, 0x20), alpha_odd)
                }
                // The final alpha challenge
                prev_challenge := mod(keccak256(0x00, 0x20), p)
                mstore(0x00, prev_challenge)

                let alpha_24 := and(prev_challenge, LOWER_128_MASK)
                mstore(ALPHA_CHALLENGE_24, alpha_24)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                       GATE CHALLENGES                      */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // TODO: PROSE
                //
                i := 0
                for {} lt(i, CONST_PROOF_SIZE_LOG_N) {} {
                    prev_challenge := mod(keccak256(0x00, 0x20), p)
                    mstore(0x00, prev_challenge)
                    let gate_off := add(GATE_CHALLENGE_0, mul(0x20, i))
                    let gate_challenge := and(prev_challenge, LOWER_128_MASK)

                    mstore(gate_off, gate_challenge)

                    i := add(i, 1)
                }

                // TODO: I think that the order of the values taken from the univariates is wrong
                // it should be [proof_size, batched length]
                // rather than as written above [batched_size]{proof_size}
                // Total nuber of iterations is 28 ,with 8 for each univariate
                i := 0
                for {} lt(i, CONST_PROOF_SIZE_LOG_N) {} {
                    // Increase by 20 * batched relation length (8)
                    // 20 * 8 = 160 (0xa0)
                    let proof_off := mul(i, 0x100)
                    let read_off := add(sumcheck_univariate_0_0, proof_off)

                    mcopy(0x20, read_off, 0x100)

                    // Hash 0xa0 + 20 (prev hash) = 0xc0
                    prev_challenge := mod(keccak256(0x00, 0x120), p)
                    mstore(0x00, prev_challenge)

                    let sumcheck_u_challenge := and(prev_challenge, LOWER_128_MASK)

                    let write_off := add(SUM_U_CHALLENGE_0, mul(i, 0x20))
                    mstore(write_off, sumcheck_u_challenge)

                    i := add(i, 1)
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
                // - QARITH
                // - QRANGE
                // - QELLIPTIC
                // - QAUX
                // - QLOOKUP
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
                // - TABLE1_SHIFT
                // - TABLE2_SHIFT
                // - TABLE3_SHIFT
                // - TABLE4_SHIFT
                // - W1_SHIFT
                // - W2_SHIFT
                // - W3_SHIFT
                // - W4_SHIFT
                // - Z_PERM_SHIFT
                //
                // Hash of all of the above evaluations
                // Number of bytes to copy = 0x20 * NUMBER_OF_ENTITIES (44) = 0x580
                mcopy(0x20, QM_EVAL_LOC, 0x580)
                prev_challenge := mod(keccak256(0x00, 0x5a0), p)
                mstore(0x00, prev_challenge)

                let rho := and(prev_challenge, LOWER_128_MASK)

                mstore(RHO_CHALLENGE, rho)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                      GEMINI R CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The Gemini R challenge contains a of all of commitments to all of the univariates
                // evaluated in the Gemini Protocol
                // So for multivariate polynomials in l variables, we will hash l - 1 commitments.
                // For this implementation, we have a fixed number of of rounds and thus 27 committments
                // The format of these commitments are proof points, which are explained above
                // 0x80 * 27 = 0xd80
                mcopy(0x20, GEMINI_FOLD_UNIVARIATE_0_X0_LOC, 0xd80)


                prev_challenge := mod(keccak256(0x00, 0xda0), p)
                mstore(0x00, prev_challenge)

                let geminiR := and(prev_challenge, LOWER_128_MASK)

                mstore(GEMINI_R_CHALLENGE, geminiR)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK NU CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // The shplonk nu challenge hashes the evaluations of the above gemini univariates
                // 0x20 * 28 = 0x380
                mcopy(0x20, GEMINI_A_EVAL_0, 0x380)
                prev_challenge := mod(keccak256(0x00, 0x3a0), p)
                mstore(0x00, prev_challenge)

                let shplonkNu := and(prev_challenge, LOWER_128_MASK)
                mstore(SHPLONK_NU_CHALLENGE, shplonkNu)


                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                    SHPLONK Z CHALLENGE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
                // Generate Shplonk Z
                // Hash of the single shplonk Q commitment
                mcopy(0x20, SHPLONK_Q_X0_LOC, 0x80)
                prev_challenge := mod(keccak256(0x00, 0xa0), p)

                let shplonkZ := and(prev_challenge, LOWER_128_MASK)
                mstore(SHPLONK_Z_CHALLENGE, shplonkZ)

                /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
                /*                     CHALLENGES COMPLETE                    */
                /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            }

            /*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/
            /*                     PUBLIC INPUT DELTA                     */
            /*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/
            /**Generate public inputa delta
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
             * We extra terms to add to this product that correspond to public input values
             *
             */

            // TODO: think about how to optimize this further
            {
                let beta := mload(BETA_CHALLENGE)
                let gamma := mload(GAMMA_CHALLENGE)
                let domain_size := mload(proof_circuit_size_loc)
                // NOTE(md): compiler broken when offset is used in a variable name?
                let pub_off := mload(proof_pub_inputs_offset_loc)

                let numerator_value := 1
                let denominator_value := 1

                let p_clone := p // move p to the front of the stack

                // Assume both domainSize and offset are less than p
                // numerator_acc = gamma + (beta * (domainSize + offset))
                let numerator_acc := addmod(gamma, mulmod(beta, add(domain_size, pub_off), p_clone), p_clone)
                // demonimator_acc = gamma - (beta * (offset + 1))
                let beta_x_off := mulmod(beta, add(pub_off, 1), p_clone)
                let denominator_acc := addmod(gamma, sub(p_clone, beta_x_off), p_clone)

                let valid_inputs := true
                // Load the starting point of the public inputs (jump over the selector and the length of public inputs [0x24])
                let public_inputs_ptr := add(calldataload(0x24), 0x24)

                // endpoint_ptr = public_inputs_ptr + num_inputs * 0x20. // every public input is 0x20 bytes
                let endpoint_ptr := add(public_inputs_ptr, mul(mload(proof_num_public_inputs_loc), 0x20))

                for {} lt(public_inputs_ptr, endpoint_ptr) { public_inputs_ptr := add(public_inputs_ptr, 0x20) } {
                    /**
                     */
                    let input := calldataload(public_inputs_ptr)

                    valid_inputs := and(valid_inputs, lt(input, p_clone))

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

                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR, numerator_value)
                mstore(PUBLIC_INPUTS_DELTA_DENOMINATOR, denominator_value)

                // TODO(md): optimise this by performing the inversion later - but just doing it here for now
                let dom_inverse := 0
                {
                    mstore(0, 0x20)
                    mstore(0x20, 0x20)
                    mstore(0x40, 0x20)
                    mstore(0x60, denominator_value)
                    mstore(0x80, sub(p, 2))
                    mstore(0xa0, p)
                    if iszero(staticcall(gas(), 0x05, 0x00, 0xc0, 0x00, 0x20)) {
                        mstore(0x00, MODEXP_FAILED_SELECTOR)
                        revert(0x00, 0x04)
                    }
                    // 1 / (0 . 1 . 2 . 3 . 4 . 5 . 6 . 7)
                    dom_inverse := mload(0x00)
                }
                // Calculate the public inputs delta
                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR, mulmod(numerator_value, dom_inverse, p))

                // TODO(md): store the result in the numerator location
            }

            // Sumcheck
            {
                // We write the barycentric domain values into memory
                // These are written once per program execution, and reused across all
                // sumcheck rounds
                // TODO: Optimisation: If we can write these into the program bytecode then
                // we could use a codecopy to load them into memory as a single slab, rather than
                // writing a series of individual values

                // WORKTODO: The non-via ir compiler will be able to take a long bytes constant
                // and it will write as a code copy, so we can optimise this table write further
                // by writing it as a single large bytes constant

                // TASK:
                // Write to the free memory pointer where we want this to go
                // Outside of assembly at the beginning of the verify function
                // Attempt to allocate this variable, when it will codecopy it to the
                // free memory pointer, - in the place we want it :)
                function writeBarycentricTables() {
                    // We write into hardcoded memory regions
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC,
                        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_1_LOC,
                        0x00000000000000000000000000000000000000000000000000000000000002d0
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_2_LOC,
                        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff11
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_3_LOC,
                        0x0000000000000000000000000000000000000000000000000000000000000090
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_4_LOC,
                        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff71
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_5_LOC,
                        0x00000000000000000000000000000000000000000000000000000000000000f0
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_6_LOC,
                        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31
                    )
                    mstore(
                        BARYCENTRIC_LAGRANGE_DENOMINATOR_7_LOC,
                        0x00000000000000000000000000000000000000000000000000000000000013b0
                    )

                    mstore(BARYCENTRIC_DOMAIN_0_LOC, 0x00)
                    mstore(BARYCENTRIC_DOMAIN_1_LOC, 0x01)
                    mstore(BARYCENTRIC_DOMAIN_2_LOC, 0x02)
                    mstore(BARYCENTRIC_DOMAIN_3_LOC, 0x03)
                    mstore(BARYCENTRIC_DOMAIN_4_LOC, 0x04)
                    mstore(BARYCENTRIC_DOMAIN_5_LOC, 0x05)
                    mstore(BARYCENTRIC_DOMAIN_6_LOC, 0x06)
                    mstore(BARYCENTRIC_DOMAIN_7_LOC, 0x07)
                }

                /**
                 * Batch inversion expects that the values are provided as a slab of memory
                 * Each 32 bytes each (Frs)
                 *
                 * We use Montgomery's batch inversion trick to invert the values
                 * One inversion is required for each round of sumcheck, as it is used to compute the
                 * Barycentric evaluations
                 *
                 * The way batch inversion works is as follows. Let's say you want to compute \{ 1/x_1, 1/x_2, ..., 1/x_n \}
                 * The trick is to compute the product x_1x_2...x_n , whilst storing all of the temporary products.
                 * i.e. we have an array A = [x_1, x_1x_2, ..., x_1x_2...x_n]
                 * We then compute a single inverse: I = 1 / x_1x_2...x_n
                 * Finally, we can use our accumulated products, to quotient out individual inverses.
                 * We can get an individual inverse at index i, by computing I.A_{i-1}.(x_nx_n-1...x_i+1)
                 * The last product term we can compute on-the-fly, as it grows by one element for each additional inverse that we
                 * require.
                 */
                function batchInvertInplace(p_clone) {
                    // We know that there will be 8 denominators
                    let accumulator := mload(BARYCENTRIC_DENOMINATOR_INVERSES_0_LOC)

                    // 0
                    let t0 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_1_LOC), p_clone)
                    // 0 . 1
                    let t1 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_2_LOC), p_clone)
                    // 0 . 1 . 2
                    let t2 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_3_LOC), p_clone)
                    // 0 . 1 . 2 . 3
                    let t3 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_4_LOC), p_clone)
                    // 0 . 1 . 2 . 3 . 4
                    let t4 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_5_LOC), p_clone)
                    // 0 . 1 . 2 . 3 . 4 . 5
                    let t5 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_6_LOC), p_clone)
                    // 0 . 1 . 2 . 3 . 4 . 5 . 6
                    let t6 := accumulator
                    accumulator := mulmod(accumulator, mload(BARYCENTRIC_DENOMINATOR_INVERSES_7_LOC), p_clone)
                    // 0 . 1 . 2 . 3 . 4 . 5 . 6 . 7

                    {
                        mstore(0, 0x20)
                        mstore(0x20, 0x20)
                        mstore(0x40, 0x20)
                        mstore(0x60, accumulator)
                        mstore(0x80, sub(p_clone, 2))
                        mstore(0xa0, p_clone)
                        if iszero(staticcall(gas(), 0x05, 0x00, 0xc0, 0x00, 0x20)) {
                            mstore(0x00, MODEXP_FAILED_SELECTOR)
                            revert(0x00, 0x04)
                        }
                        // 1 / (0 . 1 . 2 . 3 . 4 . 5 . 6 . 7)
                        accumulator := mload(0x00)
                    }

                    // (0 . 1 . 2 . 3 . 4 . 5 . 6) / (0 . 1 . 2 . 3 . 4 . 5 . 6 . 7)  = 1 / 7
                    t6 := mulmod(accumulator, t6, p_clone)
                    let temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_7_LOC)
                    // Inverse of 1/7
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_7_LOC, t6)

                    // 1 / (0 . 1 . 2 . 3 . 4 . 5 . 6)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // (0 . 1 . 2 . 3 . 4 . 5) / (0 . 1 . 2 . 3 . 4 . 5 . 6)  = 1 / 6
                    t5 := mulmod(accumulator, t5, p_clone)
                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_6_LOC)
                    // Inverse of 1/6
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_6_LOC, t5)

                    // 1 / (0 . 1 . 2 . 3 . 4 . 5)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // (0 . 1 . 2 . 3 . 4) / (0 . 1 . 2 . 3 . 4 . 5)  = 1 / 5
                    t4 := mulmod(accumulator, t4, p_clone)
                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_5_LOC)
                    // Inverse of 1/5
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_5_LOC, t4)

                    // 1 / (0 . 1 . 2 . 3 . 4)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // (0 . 1 . 2 . 3) / (0 . 1 . 2 . 3 . 4)  = 1 / 4
                    t3 := mulmod(accumulator, t3, p_clone)

                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_4_LOC)
                    // Inverse of 1/4
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_4_LOC, t3)

                    // 1 / (0 . 1 . 2 . 3)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // (0 . 1 . 2) / (0 . 1 . 2 . 3)  = 1 / 3
                    t2 := mulmod(accumulator, t2, p_clone)

                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_3_LOC)
                    // Inverse of 1/3
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_3_LOC, t2)

                    // 1 / (0 . 1 . 2)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // (0 . 1) / (0 . 1 . 2)  = 1 / 2
                    t1 := mulmod(accumulator, t1, p_clone)

                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_2_LOC)
                    // Inverse of 1/2
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_2_LOC, t1)

                    // 1 / (0 . 1)
                    accumulator := mulmod(accumulator, temp, p_clone)

                    // 0 / (0 . 1)  = 1 / 0 (Note: index not value)
                    t0 := mulmod(accumulator, t0, p_clone)
                    // 1 / 0
                    temp := mload(BARYCENTRIC_DENOMINATOR_INVERSES_1_LOC)
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_1_LOC, t0)

                    accumulator := mulmod(accumulator, temp, p_clone)
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_0_LOC, accumulator)
                }

                // Note: pass around p to keep it on the stack
                function computeNextTargetSum(
                    round_univariates_ptr, /*: uint256[] */
                    round_challenge, /*: uint256 */
                    p_clone, /*: uint256 */ /* TEMP */
                ) -> next_target /*: uint256 */ {
                    // Next target sum, Barycentric evaluation at the given challenge point

                    // Compute B(x)
                    let i := 0
                    let numerator_value := 1
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        numerator_value :=
                            mulmod(numerator_value, addmod(round_challenge, sub(p_clone, i), p_clone), p_clone)
                        i := add(i, 1)
                    }
                    // NOTE: Correct

                    // Calculate domainInverses for barycentric evaluation
                    // TODO_OPT(md): could be unrolled
                    i := 0
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        let inv := mload(add(BARYCENTRIC_LAGRANGE_DENOMINATOR_0_LOC, mul(i, 0x20)))
                        let rc_minus_domain :=
                            addmod(round_challenge, sub(p_clone, mload(add(BARYCENTRIC_DOMAIN_0_LOC, mul(i, 0x20)))), p_clone)

                        inv := mulmod(inv, rc_minus_domain, p_clone)
                        mstore(add(BARYCENTRIC_DENOMINATOR_INVERSES_0_LOC, mul(i, 0x20)), inv)
                        i := add(i, 1)
                    }

                    batchInvertInplace(p_clone)

                    // Compute the next round target
                    // TODO( ): that means we are messing up in here
                    i := 0
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        let off := mul(i, 0x20)
                        let term := mload(add(round_univariates_ptr, off))
                        let inverse := mload(add(BARYCENTRIC_DENOMINATOR_INVERSES_0_LOC, off))

                        term := mulmod(term, inverse, p_clone)
                        next_target := addmod(next_target, term, p_clone)
                        i := add(i, 1)
                    }

                    next_target := mulmod(next_target, numerator_value, p_clone)
                }

                function partiallyEvaluatePOW(
                    round_challenge, /*: uint256 */ current_evaluation, /*: uint256 */ round, /*: uint256 */ p_clone
                ) -> /*: uint256 */ next_evaluation /*: uint256 */ {
                    let gate_challenge := mload(add(GATE_CHALLENGE_0, mul(round, 0x20)))
                    let gate_challenge_minus_one := sub(gate_challenge, 1)

                    let univariate_evaluation :=
                        addmod(1, mulmod(round_challenge, gate_challenge_minus_one, p_clone), p_clone)

                    next_evaluation := mulmod(current_evaluation, univariate_evaluation, p_clone)
                }

                writeBarycentricTables()

                let round := 0
                let valid := true
                let round_target := 0
                let pow_partial_evaluation := 1

                for {} lt(round, 15) {} {
                    let round_univariates_off := add(sumcheck_univariate_0_0, mul(round, 0x100))
                    let challenge_off := add(SUM_U_CHALLENGE_0, mul(round, 0x20))

                    let round_challenge := mload(challenge_off)

                    // Total sum = u[0] + u[1]
                    let total_sum := addmod(mload(round_univariates_off), mload(add(round_univariates_off, 0x20)), p)
                    valid := and(valid, eq(total_sum, round_target))

                    round_target := computeNextTargetSum(round_univariates_off, round_challenge, p)
                    pow_partial_evaluation := partiallyEvaluatePOW(round_challenge, pow_partial_evaluation, round, p)

                    round := add(round, 1)
                }

                if iszero(valid) {
                    mstore(0x00, SUMCHECK_FAILED_SELECTOR)
                    revert(0x00, 0x04)
                }


                // The final sumcheck round; accumulating evaluations
                // Uses pow partial evaluation as the gate scaling factor

                // NOTE: maybe mstore pow_partial_evaluation here rather than keeping on the stack
                // TODO(md): add to offsets script
                mstore(POW_PARTIAL_EVALUATION_LOC, pow_partial_evaluation)
                mstore(FINAL_ROUND_TARGET_LOC, round_target)

            /**
             * COMPUTE ARITHMETIC WIDGET EVALUATION
             */
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
                let w1q1 := mulmod(mload(W1_EVAL_LOC), mload(Q1_EVAL_LOC), p)
                let w2q2 := mulmod(mload(W2_EVAL_LOC), mload(Q2_EVAL_LOC), p)
                let w3q3 := mulmod(mload(W3_EVAL_LOC), mload(Q3_EVAL_LOC), p)
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
                        // TODO: calculate this in advance
                        NEG_HALF_MODULO_P,
                        // NEGATIVE_INVERSE_OF_2_MODULO_P,
                        p
                    )

                // (w_1 . w_2 . q_m . (q_arith - 3)) / -2) + (w_1 . q_1) + (w_2 . q_2) + (w_3 . q_3) + (w_4 . q_4) + q_c
                let identity :=
                    addmod(
                        mload(QC_EVAL_LOC), addmod(w4q3, addmod(w3q3, addmod(w2q2, addmod(w1q1, w1w2qm, p), p), p), p), p
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
                                    sub(p, mload(W1_SHIFT_EVAL_LOC)), addmod(mload(W1_EVAL_LOC), mload(W4_EVAL_LOC), p), p
                                ),
                                p
                            ),
                            p
                        )

                // Split up the two relations
                let contribution_0 := addmod(identity, mulmod(addmod(q_arith, sub(p, 1), p), mload(W4_SHIFT_EVAL_LOC), p), p)
                contribution_0 := mulmod(mulmod(contribution_0, q_arith, p), mload(POW_PARTIAL_EVALUATION_LOC), p)
                mstore(SUBRELATION_EVAL_0_LOC, contribution_0)

                let contribution_1 := mulmod(extra_small_addition_gate_identity, addmod(q_arith, sub(p, 1), p), p)
                contribution_1 := mulmod(contribution_1, q_arith, p)
                contribution_1 := mulmod(contribution_1, mload(POW_PARTIAL_EVALUATION_LOC), p)
                mstore(SUBRELATION_EVAL_1_LOC, contribution_1)
            }

            /**
             * COMPUTE PERMUTATION WIDGET EVALUATION
             */
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
                    let acc := mulmod(addmod(mload(Z_PERM_EVAL_LOC), mload(LAGRANGE_FIRST_EVAL_LOC), p), numerator, p)

                    acc := addmod(
                        acc,
                        sub(
                            p,
                            mulmod(
                                addmod(
                                mload(Z_PERM_SHIFT_EVAL_LOC),
                                mulmod(
                                    mload(LAGRANGE_LAST_EVAL_LOC),
                                        mload(PUBLIC_INPUTS_DELTA_NUMERATOR),
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

                    acc := mulmod(mulmod(mload(LAGRANGE_LAST_EVAL_LOC), mload(Z_PERM_SHIFT_EVAL_LOC), p), mload(POW_PARTIAL_EVALUATION_LOC), p)
                    mstore(SUBRELATION_EVAL_3_LOC, acc)
                }
            }

                /**
                 * LOGUP WIDGET EVALUATION
                 */
                {
                    let eta := mload(ETA_CHALLENGE)
                    let eta_two := mload(ETA_TWO_CHALLENGE)
                    let eta_three := mload(ETA_THREE_CHALLENGE)

                    let beta := mload(BETA_CHALLENGE)
                    let gamma := mload(GAMMA_CHALLENGE)

                    let t0 := addmod(addmod(mload(TABLE1_EVAL_LOC), gamma, p), mulmod(mload(TABLE2_EVAL_LOC), eta, p), p)
                    let t1 := addmod(mulmod(mload(TABLE3_EVAL_LOC), eta_two, p), mulmod(mload(TABLE4_EVAL_LOC), eta_three, p), p)
                    let write_term := addmod(t0, t1, p)

                    t0 := addmod(addmod(mload(W1_EVAL_LOC), gamma, p), mulmod(mload(Q2_EVAL_LOC), mload(W1_SHIFT_EVAL_LOC), p), p)
                    t1 := addmod(mload(W2_EVAL_LOC), mulmod(mload(QM_EVAL_LOC), mload(W2_SHIFT_EVAL_LOC), p), p)
                    let t2 := addmod(mload(W3_EVAL_LOC), mulmod(mload(QC_EVAL_LOC), mload(W3_SHIFT_EVAL_LOC), p), p)

                    let read_term := addmod(t0, mulmod(t1, eta, p), p)
                    read_term := addmod(read_term, mulmod(t2, eta_two, p), p)
                    read_term := addmod(read_term, mulmod(mload(Q3_EVAL_LOC), eta_three, p), p)

                    let read_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), write_term, p)
                    let write_inverse := mulmod(mload(LOOKUP_INVERSES_EVAL_LOC), read_term, p)

                    let inverse_exists_xor := addmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)
                    inverse_exists_xor := addmod(inverse_exists_xor, sub(p, mulmod(mload(LOOKUP_READ_TAGS_EVAL_LOC), mload(QLOOKUP_EVAL_LOC), p)), p)

                    let accumulator_none := mulmod(mulmod(read_term, write_term, p), mload(LOOKUP_INVERSES_EVAL_LOC), p)
                    accumulator_none := addmod(accumulator_none, sub(p, inverse_exists_xor), p)
                    accumulator_none := mulmod(accumulator_none, mload(POW_PARTIAL_EVALUATION_LOC), p)

                    let accumulator_one := mulmod(mload(QLOOKUP_EVAL_LOC), read_inverse, p)
                    accumulator_one := addmod(accumulator_one, sub(p, mulmod(mload(LOOKUP_READ_COUNTS_EVAL_LOC), write_inverse, p)), p)

                    mstore(SUBRELATION_EVAL_4_LOC, accumulator_none)
                    mstore(SUBRELATION_EVAL_5_LOC, accumulator_one)
                }

                /**
                 * DELTA RANGE RELATION
                 */
                {
                    // TODO(md): optimise the calculations
                    let minus_one := sub(p, 1)
                    let minus_two := sub(p, 2)
                    let minus_three := sub(p, 3)

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
                        mstore(SUBRELATION_EVAL_6_LOC, acc)
                    }

                    {
                        let acc := delta_2
                        acc := mulmod(acc, addmod(delta_2, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_2, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_7_LOC, acc)
                    }

                    {
                        let acc := delta_3
                        acc := mulmod(acc, addmod(delta_3, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_3, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_8_LOC, acc)
                    }

                    {
                        let acc := delta_4
                        acc := mulmod(acc, addmod(delta_4, minus_one, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_two, p), p)
                        acc := mulmod(acc, addmod(delta_4, minus_three, p), p)
                        acc := mulmod(acc, mload(QRANGE_EVAL_LOC), p)
                        acc := mulmod(acc, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        mstore(SUBRELATION_EVAL_9_LOC, acc)
                    }
                }

                /**
                 * ELLIPTIC CURVE RELATION
                 */
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
                        mstore(SUBRELATION_EVAL_10_LOC, eval)
                    }

                    {
                        let y1_plus_y3 := addmod(mload(EC_Y_1), mload(EC_Y_3), p)
                        let y_diff := mulmod(mload(EC_Y_2), mload(EC_Q_SIGN), p)
                        y_diff := addmod(y_diff, sub(p, mload(EC_Y_1)), p)
                        let y_add_identity := mulmod(y1_plus_y3, x_diff, p)
                        y_add_identity := addmod(y_add_identity, mulmod(addmod(mload(EC_X_3), sub(p, mload(EC_X_1)), p), y_diff, p), p)

                        let eval := mulmod(y_add_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        eval := mulmod(eval, mload(QELLIPTIC_EVAL_LOC), p)
                        eval := mulmod(eval, addmod(1, sub(p, mload(EC_Q_IS_DOUBLE)), p), p)
                        mstore(SUBRELATION_EVAL_11_LOC, eval)
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
                        acc := addmod(acc, mload(SUBRELATION_EVAL_10_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_10_LOC, acc)
                    }

                    {
                        let x1_sqr_mul_3 := mulmod(addmod(addmod(mload(EC_X_1), mload(EC_X_1), p), mload(EC_X_1), p), mload(EC_X_1), p)
                        let y_double_identity := mulmod(x1_sqr_mul_3, addmod(mload(EC_X_1), sub(p, mload(EC_X_3)), p), p)
                        y_double_identity := addmod(
                            y_double_identity,
                            sub(p,
                                mulmod(
                                    addmod(mload(EC_Y_1), mload(EC_Y_1), p),
                                    addmod(mload(EC_Y_1), mload(EC_Y_3), p),
                                    p
                                )
                            )
                        , p)

                        let acc := mulmod(y_double_identity, mload(POW_PARTIAL_EVALUATION_LOC), p)
                        acc := mulmod(mulmod(acc, mload(QELLIPTIC_EVAL_LOC), p), mload(EC_Q_IS_DOUBLE), p)
                        acc := addmod(acc, mload(SUBRELATION_EVAL_11_LOC), p)

                        // Add to existing contribution - and double check that numbers here
                        mstore(SUBRELATION_EVAL_11_LOC, acc)
                    }
                }

                // Auxiliary Relation
            {
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
                            mload(Q3_EVAL_LOC),
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
                            mload(Q2_EVAL_LOC),
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

                    mstore(
                        AUX_LIMB_ACCUMULATOR_IDENTITY,
                        mulmod(addmod(limb_accumulator_1, limb_accumulator_2, p), mload(Q3_EVAL_LOC), p)
                    )
                }

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
                    memory_record_check := addmod(memory_record_check, mulmod(mload(W2_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p), p)
                    memory_record_check := addmod(memory_record_check, mulmod(mload(W1_EVAL_LOC), mload(ETA_CHALLENGE), p), p)
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
                    let index_is_monotonically_increasing := mulmod(index_delta, addmod(index_delta, sub(p, 1), p), p)

                    // adjacent_values_match_if_adjacent_indices_match = record_delta * (1 - index_delta)
                    let adjacent_values_match_if_adjacent_indices_match :=
                        mulmod(record_delta, addmod(1, sub(p, index_delta), p), p)

                    mstore(
                        SUBRELATION_EVAL_13_LOC,
                        mulmod(
                            adjacent_values_match_if_adjacent_indices_match,
                            mulmod(
                                mload(Q1_EVAL_LOC),
                                mulmod(
                                    mload(Q2_EVAL_LOC),
                                    mulmod(
                                        mload(QAUX_EVAL_LOC),
                                        mload(POW_PARTIAL_EVALUATION_LOC),
                                        p
                                    ),
                                    p
                                ),
                                p
                            ),
                            p
                        ))

                    // ROM_CONSISTENCY_CHECK_2
                    mstore(
                        SUBRELATION_EVAL_14_LOC,
                        mulmod(
                            index_is_monotonically_increasing,
                            mulmod(
                                mload(Q1_EVAL_LOC),
                                mulmod(
                                    mload(Q2_EVAL_LOC),
                                    mulmod(
                                        mload(QAUX_EVAL_LOC),
                                        mload(POW_PARTIAL_EVALUATION_LOC),
                                        p
                                    ),
                                    p
                                ),
                                p
                                ),
                                p
                            )
                        )

                    mstore(
                        AUX_ROM_CONSISTENCY_CHECK_IDENTITY,
                        mulmod(
                            memory_record_check,
                            mulmod(
                                mload(Q1_EVAL_LOC),
                                mload(Q2_EVAL_LOC),
                                p
                            ),
                            p
                        )
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
                        next_gate_access_type := addmod(next_gate_access_type, mulmod(mload(W2_SHIFT_EVAL_LOC), mload(ETA_TWO_CHALLENGE), p), p)
                        next_gate_access_type := addmod(next_gate_access_type, mulmod(mload(W1_SHIFT_EVAL_LOC), mload(ETA_CHALLENGE), p), p)
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
                        let access_check := mulmod(access_type, addmod(access_type, sub(p, 1), p), p)
                        let next_gate_access_type_is_boolean :=
                            mulmod(next_gate_access_type, addmod(next_gate_access_type, sub(p, 1), p), p)


                        // scaled_activation_selector = q_arith * q_aux * alpha
                        let scaled_activation_selector := mulmod(
                            mload(QARITH_EVAL_LOC),
                            mulmod(
                                mload(QAUX_EVAL_LOC),
                                mload(POW_PARTIAL_EVALUATION_LOC),
                                p
                            ),
                            p
                        )

                        mstore(
                            SUBRELATION_EVAL_15_LOC,
                            mulmod(
                                adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation,
                                scaled_activation_selector,
                                p
                            )
                        )

                        mstore(
                            SUBRELATION_EVAL_16_LOC,
                            mulmod(
                                index_is_monotonically_increasing,
                                scaled_activation_selector,
                                p
                            )
                        )

                        mstore(
                            SUBRELATION_EVAL_17_LOC,
                            mulmod(
                                next_gate_access_type_is_boolean,
                                scaled_activation_selector,
                                p
                            )
                        )

                        mstore(AUX_RAM_CONSISTENCY_CHECK_IDENTITY, mulmod(access_check, mload(QARITH_EVAL_LOC), p))
                    }

                    {
                        // timestamp_delta = w_2_omega - w_2
                        let timestamp_delta := addmod(mload(W2_SHIFT_EVAL_LOC), sub(p, mload(W2_EVAL_LOC)), p)

                        // TODO(md): formula discrepancy between relations.sol and blake-opt.sol
                        // TODO: suspicious

                        // RAM_timestamp_check_identity = (1 - index_delta) * timestamp_delta - w_3
                        let RAM_TIMESTAMP_CHECK_IDENTITY :=
                            addmod(
                                mulmod(timestamp_delta, addmod(1, sub(p, index_delta), p), p), sub(p, mload(W3_EVAL_LOC)), p
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
                            addmod(memory_identity,
                                mulmod(RAM_TIMESTAMP_CHECK_IDENTITY,
                                    mulmod(
                                        mload(Q4_EVAL_LOC),
                                        mload(Q1_EVAL_LOC),
                                     p),
                                p),
                            p)

                        memory_identity :=
                            addmod(memory_identity, mulmod(mload(AUX_MEMORY_CHECK_IDENTITY), mulmod(mload(QM_EVAL_LOC), mload(Q1_EVAL_LOC), p), p), p)
                        memory_identity :=
                            addmod(memory_identity, mload(AUX_RAM_CONSISTENCY_CHECK_IDENTITY), p)


                        let auxiliary_identity := addmod(memory_identity, mload(AUX_NON_NATIVE_FIELD_IDENTITY), p)
                        auxiliary_identity := addmod(auxiliary_identity, mload(AUX_LIMB_ACCUMULATOR_IDENTITY), p)

                        auxiliary_identity := mulmod(auxiliary_identity, mulmod(mload(QAUX_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p), p)
                        mstore(SUBRELATION_EVAL_12_LOC, auxiliary_identity)
                    }
                }
            }

            /*
             * Poseidon External Relation
             */
            {
                let s1 := addmod(mload(W1_EVAL_LOC), mload(Q1_EVAL_LOC), p)
                let s2 := addmod(mload(W2_EVAL_LOC), mload(Q2_EVAL_LOC), p)
                let s3 := addmod(mload(W3_EVAL_LOC), mload(Q3_EVAL_LOC), p)
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

                let q_pos_by_scaling := mulmod(mload(QPOSEIDON2_EXTERNAL_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p)

                mstore(
                    SUBRELATION_EVAL_18_LOC,
                    addmod(
                        mload(SUBRELATION_EVAL_18_LOC),
                        mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p),
                        p
                    )
                )

                mstore(
                    SUBRELATION_EVAL_19_LOC,
                    addmod(
                        mload(SUBRELATION_EVAL_19_LOC),
                        mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p),
                        p
                    )
                )

                mstore(
                    SUBRELATION_EVAL_20_LOC,
                    addmod(
                        mload(SUBRELATION_EVAL_20_LOC),
                        mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p),
                        p
                    )
                )

                mstore(
                    SUBRELATION_EVAL_21_LOC,
                    addmod(
                        mload(SUBRELATION_EVAL_21_LOC),
                        mulmod(q_pos_by_scaling, addmod(v4, sub(p, mload(W4_SHIFT_EVAL_LOC)), p), p),
                        p
                    )
                )
            }

            /*
             * Poseidon Internal Relation
             */
            {

                // TODO(md): could reuse s1 etc?
                let s1 := addmod(mload(W1_EVAL_LOC), mload(Q1_EVAL_LOC), p)

                // apply s-box round
                let t0 := mulmod(s1, s1, p)
                let u1 := mulmod(t0, mulmod(t0, s1, p), p)
                let u2 := mload(W2_EVAL_LOC)
                let u3 := mload(W3_EVAL_LOC)
                let u4 := mload(W4_EVAL_LOC)

                // matrix mul v = M_I * u 4 muls and 7 additions
                let u_sum := addmod(u1, u2, p)
                u_sum := addmod(u_sum, addmod(u3, u4, p), p)

                let q_pos_by_scaling := mulmod(mload(QPOSEIDON2_INTERNAL_EVAL_LOC), mload(POW_PARTIAL_EVALUATION_LOC), p)

                let v1 := addmod(mulmod(u1, POS_INTENAL_MATRIX_D_0 , p), u_sum, p)

                mstore(SUBRELATION_EVAL_22_LOC, mulmod(q_pos_by_scaling, addmod(v1, sub(p, mload(W1_SHIFT_EVAL_LOC)), p), p))

                let v2 := addmod(mulmod(u2, POS_INTENAL_MATRIX_D_1, p), u_sum, p)

                mstore(SUBRELATION_EVAL_23_LOC, mulmod(q_pos_by_scaling, addmod(v2, sub(p, mload(W2_SHIFT_EVAL_LOC)), p), p))

                let v3 := addmod(mulmod(u3, POS_INTENAL_MATRIX_D_2, p), u_sum, p)

                mstore(SUBRELATION_EVAL_24_LOC, mulmod(q_pos_by_scaling, addmod(v3, sub(p, mload(W3_SHIFT_EVAL_LOC)), p), p))

                let v4 := addmod(mulmod(u4, POS_INTENAL_MATRIX_D_3, p), u_sum, p)
                mstore(SUBRELATION_EVAL_25_LOC, mulmod(q_pos_by_scaling, addmod(v4, sub(p, mload(W4_SHIFT_EVAL_LOC)), p), p))
            }

            // Scale and batch subrelations by subrelation challenges
            // linear combination of subrelations
            let accumulator := mload(SUBRELATION_EVAL_0_LOC)

            // TODO(md): unroll???
            // TODO(md): not optimal
            for {let i:= 1} lt(i, NUMBER_OF_SUBRELATIONS) {i := add(i, 1)} {
                let evaluation_off := mul(i, 0x20)
                let challenge_off := sub(evaluation_off , 0x20)

                accumulator := addmod(
                    accumulator,
                    mulmod(
                        mload(add(SUBRELATION_EVAL_0_LOC, evaluation_off)),
                        mload(add(ALPHA_CHALLENGE_0, challenge_off)),
                        p),
                    p)
            }

            let sumcheck_valid := eq(accumulator, mload(FINAL_ROUND_TARGET_LOC))
            if iszero(sumcheck_valid) {
                // TOOD: errs
                mstore(0x00, 0x69696969)
                return(0x00, 0x20)
            }
            }

            // Shplemini Commitment scheme

            // Compute powers of evaluation challenge
            let cache := mload(GEMINI_R_CHALLENGE)
            let off := POWERS_OF_EVALUATION_CHALLENGE_0_LOC
            mstore(off, cache)
            for {let i := 1} lt(i, CONST_PROOF_SIZE_LOG_N) {i := add(i, 1)} {
                off := add(off, 0x20)
                cache := mulmod(cache, cache, p)
                mstore(off, cache)
            }

            // Compute Inverted Gemini Denominators
            let eval_challenge := mload(SHPLONK_Z_CHALLENGE)
            mstore(INVERTED_GEMINI_DENOMINATOR_0_LOC, addmod(eval_challenge, sub(p, mload(POWERS_OF_EVALUATION_CHALLENGE_0_LOC)), p))

            let vanishing_eval_off := INVERTED_GEMINI_DENOMINATOR_1_LOC
            let eval_challenge_powers_off := POWERS_OF_EVALUATION_CHALLENGE_0_LOC
            for {let i := 0} lt(i, add(LOG_N, 2)) {i := add(i, 1)} {

                // TODO: Branchless dummy proof selection
                // If (i <= LOG_N + 1) in our loop, then the inverted denominator contribution will
                // need to be 0 - so we can multiply the result of the eval challenge by the result
                //
                // TODO: reason more if i decide to go that direction
                // TODO: measure - is an addmod + stack operations cheaper than a jump???

                // TODO: add(CONSTANT, CONSTANT) is evaluated at comptime
                let temp := addmod(eval_challenge, mload(eval_challenge_powers_off), p)

                mstore(vanishing_eval_off, addmod(eval_challenge, mload(eval_challenge_powers_off), p))

                // NOTES -
                // These notes are related to the non yul version of this code
                // ------------------
                // TODO: can we assume that memory inside inverse_vanishing_evals is zeroed
                // But also, DO we want it to be zeroed
                // The efficient algorithm here will invert the field elements in a batch
                // we cannot invert this in a batch as it may contain zeros - so multiplying them
                // is unsafe.

                // If we know what LOG_N is
                // We need to produce a different verifier that will perform a different batch inversion
                // function depending on the value of LOG_N
                // This version of the function is only going to write up to the LOG_N that we KNOW
                // But in cpp we can `template` this function such that it generates the correct output code
                // If we do decide to do this - we will need to very intently document this process

                vanishing_eval_off := add(vanishing_eval_off, 0x20)
                eval_challenge_powers_off := add(eval_challenge_powers_off, 0x20)
            }

            // Invert all of the round_inverted denominators AND invert the geminiR challenge
            // ----------------
            // To do this, we again use montgomery's batch inversion trick
            // The following code will invert up until LOG_N scalars writing their result back into the memory
            // location that they came from
            // In this example, LOG_N + 1 is 16, plus an additional element for geminiR so we have 17 inversions
            //
            // REVIEWTODO: check that the comment made here is correct

            // There will be 16 intermediate values
            // So we will need to store many of the original accumulator values in memory
            // TODO: update this comment with the number that were chosen

            // Remark: We store the accumulator outside this scope, as it's final value is immediately used
            // as soon as this current scope resumes - as geminiR challenge's inversion
            let accumulator := mload(GEMINI_R_CHALLENGE)
            {
                mstore(BATCH_ACCUMULATOR_0_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_0_LOC), p)

                mstore(BATCH_ACCUMULATOR_1_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_1_LOC), p)

                mstore(BATCH_ACCUMULATOR_2_LOC , accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_2_LOC), p)

                mstore(BATCH_ACCUMULATOR_3_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_3_LOC), p)

                mstore(BATCH_ACCUMULATOR_4_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_4_LOC), p)

                mstore(BATCH_ACCUMULATOR_5_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_5_LOC), p)

                mstore(BATCH_ACCUMULATOR_6_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_6_LOC), p)

                mstore(BATCH_ACCUMULATOR_7_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_7_LOC), p)

                mstore(BATCH_ACCUMULATOR_8_LOC, accumulator)
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_8_LOC), p)

                let t9 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_9_LOC), p)

                let t10 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_10_LOC), p)

                let t11 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_11_LOC), p)

                let t12 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_12_LOC), p)

                let t13 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_13_LOC), p)

                let t14 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_14_LOC), p)

                let t15 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_15_LOC), p)

                let t16 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_16_LOC), p)

                let t17 := accumulator
                accumulator := mulmod(accumulator, mload(INVERTED_GEMINI_DENOMINATOR_17_LOC), p)

                {
                    mstore(0, 0x20)
                    mstore(0x20, 0x20)
                    mstore(0x40, 0x20)
                    mstore(0x60, accumulator)
                    mstore(0x80, sub(p, 2))
                    mstore(0xa0, p)
                    if iszero(staticcall(gas(), 0x05, 0x00, 0xc0, 0x00, 0x20)) {
                        mstore(0x00, MODEXP_FAILED_SELECTOR)
                        revert(0x00, 0x04)
                    }
                    // 1 / (0 . 1 . 2 . 3 . 4 . 5 . 6 . 7)
                    accumulator := mload(0x00)
                }

                t17 := mulmod(accumulator, t17, p)
                let temp := mload(INVERTED_GEMINI_DENOMINATOR_17_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_17_LOC, t17)

                accumulator := mulmod(accumulator, temp, p)

                t16 := mulmod(accumulator, t16, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_16_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_16_LOC, t16)

                accumulator := mulmod(accumulator, temp, p)

                t15 := mulmod(accumulator, t15, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_15_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_15_LOC, t15)

                accumulator := mulmod(accumulator, temp, p)

                t14 := mulmod(accumulator, t14, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_14_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_14_LOC, t14)

                accumulator := mulmod(accumulator, temp, p)

                t13 := mulmod(accumulator, t13, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_13_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_13_LOC, t13)

                accumulator := mulmod(accumulator, temp, p)

                t12 := mulmod(accumulator, t12, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_12_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_12_LOC, t12)

                accumulator := mulmod(accumulator, temp, p)

                t11 := mulmod(accumulator, t11, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_11_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_11_LOC, t11)

                accumulator := mulmod(accumulator, temp, p)

                t10 := mulmod(accumulator, t10, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_10_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_10_LOC, t10)

                accumulator := mulmod(accumulator, temp, p)

                t9 := mulmod(accumulator, t9, p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_9_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_9_LOC, t9)

                accumulator := mulmod(accumulator, temp, p)

                let t8 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_8_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_8_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_8_LOC, t8)

                accumulator := mulmod(accumulator, temp, p)

                let t7 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_7_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_7_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_7_LOC, t7)

                accumulator := mulmod(accumulator, temp, p)

                let t6 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_6_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_6_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_6_LOC, t6)

                accumulator := mulmod(accumulator, temp, p)

                let t5 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_5_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_5_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_5_LOC, t5)

                accumulator := mulmod(accumulator, temp, p)

                let t4 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_4_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_4_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_4_LOC, t4)

                accumulator := mulmod(accumulator, temp, p)

                let t3 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_3_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_3_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_3_LOC, t3)

                accumulator := mulmod(accumulator, temp, p)

                let t2 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_2_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_2_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_2_LOC, t2)

                accumulator := mulmod(accumulator, temp, p)

                let t1 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_1_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_1_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_1_LOC, t1)

                accumulator := mulmod(accumulator, temp, p)

                let t0 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_0_LOC), p)
                temp := mload(INVERTED_GEMINI_DENOMINATOR_0_LOC)
                mstore(INVERTED_GEMINI_DENOMINATOR_0_LOC, t0)

                // The accumulator now stores the inversion of the GEMINI_R_CHALLENGE
                accumulator := mulmod(accumulator, temp, p)
            }

           let unshifted_scalar := 0
           let shifted_scalar := 0
           {
                let inverted_gemini_denominator_0 := mload(INVERTED_GEMINI_DENOMINATOR_0_LOC)
                let inverted_gemini_denominator_1 := mload(INVERTED_GEMINI_DENOMINATOR_1_LOC)
                let shplonk_nu := mload(SHPLONK_NU_CHALLENGE)

                // accumulator takes the value of `INVERTED_GEMINI_DENOMINATOR_0` here
                unshifted_scalar := addmod(
                    inverted_gemini_denominator_0,
                    mulmod(shplonk_nu, inverted_gemini_denominator_1, p),
                    p
                )

                // WORKTODO: MAKE A COMMENT ABOUT HOW WE ALSO STORE GEMINI R
                shifted_scalar := mulmod(
                    accumulator, // (1 / gemini_r_challenge)
                    // (inverse_vanishing_evals[0]) - (shplonk_nu * inverse_vanishing_evals[1])
                    addmod(
                        inverted_gemini_denominator_0,
                        // - (shplonk_nu * inverse_vanishing_evals[1])
                        sub(
                            p,
                            mulmod(
                                shplonk_nu,
                                inverted_gemini_denominator_1,
                                p
                            )
                        ),
                        p
                    ),
                    p
                )

           }

            // This function takes a proof point from its field element representaiton into its
            // functional bytes representation
            //
            // WORKTODO: check that these offsets are correct!!
            // Proof points are sent in the proof in the format:
            // 0x00: x_coordinate_low
            // 0x20: x_coordinate_high
            // 0x40: y_coordinate_low
            // 0x60: y_coordinate_high
            //
            // The reason being, proofs in their current form are optimised to make recursive proving
            // simpler. In essence this is tech debt, and will be updated at a future point
            // <MAKEISSUE>
            // This function converts the proofs into their correct version
            // 0x00: x_coordinate
            // 0x20: y_coordinate
            //
            // This is the form that the bn254 ecMul precompile expects, and such is the form we will use
            //
            // The expected usage of this function is to convert proof points on the fly
            // and write them into the scratch space in order to be accumulated with the
            // ecMul precompile
            //
            // TODO: write in here where the scalar is expected in scratch space
            function writeProofPointIntoScratchSpace(proof_memory_location) {
                let x_low := mload(proof_memory_location)
                let x_high := mload(add(proof_memory_location, 0x20))

                // x_low | x_high < 136
                mstore(0x60, or(shl(136, x_high), x_low))

                let y_low := mload(add(proof_memory_location, 0x40))
                let y_high := mload(add(proof_memory_location, 0x60))

                // y_low | y_high < 136
                mstore(0x80, or(shl(136, y_high), y_low))

                // By now, we should expect our scratch space to look as follows
                // 0x00: scalar
                // 0x20: x_coordinate
                // 0x40: y_coordinate
            }

            // TODO: cleanup multiple implementations
            function writeProofPointOntoStack(proof_point_memory_location) -> x, y {
                let x_low := mload(proof_point_memory_location)
                let x_high := mload(add(proof_point_memory_location, 0x20))

                let y_low := mload(add(proof_point_memory_location, 0x40))
                let y_high := mload(add(proof_point_memory_location, 0x60))


                x := or(shl(136, x_high), x_low)
                y := or(shl(136, y_high), y_low)
            }

            function validateProofPointOnCurve(success_flag, proof_point_memory_location, p_clone, q_clone) -> success_return {
                let x, y := writeProofPointOntoStack(proof_point_memory_location)

                let xx := mulmod(x, x, p_clone)
                let yy := mulmod(y, y, p_clone)
                let xy := mulmod(x, y, p_clone)

                success_return := and(success_flag, iszero(eq(mulmod(y, y, q_clone), addmod(mulmod(x, xx, q_clone), 3, q_clone))))
            }

            // This function takes the values currently in scratch space, and performs an EC MUL
            // Adding the result to the point stored in an accumulator
            // We assume that the accumulator is stored within scratch space at
            //
            // 0x00: Accumulator_x_coordinate
            // 0x20: Accumulator_y_coordinate
            // function ecMulAndAccumulate(accumulator) -> success_flag {

                // let success := staticcall(
                //     gas(),
                //     7,
                //     0x40,
                //     0x60,

                // )

            // }


            // TODO: Write a comment that describes the process of accumulating commitments and scalars
            // into one large value that will be used on the rhs of the pairing check

            // Accumulators
            // TODO: explain what these are for more in depth
            {

            }
            let batchingChallenge := 1
            let batchedEvaluation := 0

            let neg_unshifted_scalar := sub(p, unshifted_scalar)
            let neg_shifted_scalar := sub(p, shifted_scalar)

            // TODO: there is a tradeoff between doing this in a loop / just unrolling the whole thing
            // For now i have decided to calculate all of the scalars in this loop.
            // But accumulate the commitments unrolled

            // WORKTODO: THIS IS NOT USED, WE MANUALLY WRITE THIS AGAIN???
            mstore(BATCH_SCALAR_0_LOC, 1)
            for {let i := 1} lt(i, add(NUMBER_OF_UNSHIFTED_ENTITIES, 1)) {i := add(i, 1)} {
                let arr_index_off := mul(i, 0x20)
                // TODO: opt this - redundant comp here
                let index_minus_one := mul(sub(i, 1), 0x20)

                // We write into the scalars offset
                let scalars_off := add(BATCH_SCALAR_0_LOC, arr_index_off)
                // Sumcheck evaluations offset
                let evaluation_off := add(QM_EVAL_LOC, index_minus_one)

                mstore(scalars_off, mulmod(neg_unshifted_scalar, batchingChallenge, p) )

                batchedEvaluation := addmod(batchedEvaluation, mulmod(mload(evaluation_off), batchingChallenge, p), p)
                batchingChallenge := mulmod(batchingChallenge, mload(RHO_CHALLENGE), p)
            }

            for {let i:= add(NUMBER_OF_UNSHIFTED_ENTITIES, 1)} lt(i, add(NUMBER_OF_ENTITIES, 1)) {i := add(i, 1)} {
                let arr_index_off := mul(i, 0x20)
                // TODO: opt this - redundant comp here
                let index_minus_one := mul(sub(i, 1), 0x20)

                // We write into the scalars offset
                let scalars_off := add(BATCH_SCALAR_0_LOC, arr_index_off)
                // Sumcheck evaluations offset
                let evaluation_off := add(QM_EVAL_LOC, index_minus_one)

                mstore(scalars_off, mulmod(neg_shifted_scalar, batchingChallenge, p) )

                batchedEvaluation := addmod(batchedEvaluation, mulmod(mload(evaluation_off), batchingChallenge, p), p)
                batchingChallenge := mulmod(batchingChallenge, mload(RHO_CHALLENGE), p)
            }

            mstore(BATCHED_EVALUATION_LOC, batchedEvaluation)

            // Validate the proof points are on the curve
            {
                let q := 21888242871839275222246405745257275088696311157297823662689037894645226208583 // EC group order
                let success_flag := 1
                success_flag := validateProofPointOnCurve(success_flag, w_l_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, w_r_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, w_o_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, lookup_read_counts_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, lookup_read_tags_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, w_4_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, lookup_inverses_x0_loc, p, q)
                success_flag := validateProofPointOnCurve(success_flag, z_perm_x0_loc, p, q)

                if iszero(success_flag) {
                    mstore(0x00, PROOF_POINT_NOT_ON_CURVE_SELECTOR)
                    revert(0x00, 0x04)
                }
            }

            let precomp_success_flag := 1
            // THe initial accumulator is 1 * shplonk

            // TODO make constant
            {
                // accumulator = 1 * shplonk_q
                // WORKTODO(md): we can ignore this accumulation as we are multiplying by 1,
                // Just set the accumulator instead
                mstore(SCALAR_LOCATION, 0x1)
                writeProofPointIntoScratchSpace(SHPLONK_Q_X0_LOC)
                precomp_success_flag := staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR, 0x40)
            }

            // Accumulate vk points
            // TODO: this method of copying into scrath space could be avoided?
            // OPT: An alternative i can think of is storing the location the scalar need to go onto the stack,
            // then call the precompile with the proof point in place.
            // WORKTODO: I may have overridden the vk by this point
            // although we only use it from this point onwards -
            // WARNING: DUPLICATED
            loadVk()
            {
                // Acumulator = acumulator + scalar[1] * vk[0]
                mcopy(G1_LOCATION, q_m_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_1_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[2] * vk[1]
                mcopy(G1_LOCATION, q_c_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_2_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[3] * vk[2]
                mcopy(G1_LOCATION, q_l_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_3_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[4] * vk[3]
                mcopy(G1_LOCATION, q_r_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_4_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[5] * vk[4]
                mcopy(G1_LOCATION, q_o_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_5_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[6] * vk[5]
                mcopy(G1_LOCATION, q_4_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_6_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[7] * vk[6]
                mcopy(G1_LOCATION, q_arith_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_7_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[8] * vk[7]
                mcopy(G1_LOCATION, q_delta_range_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_8_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[9] * vk[8]
                mcopy(G1_LOCATION, q_elliptic_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_9_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[10] * vk[9]
                mcopy(G1_LOCATION, q_aux_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_10_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[11] * vk[10]
                mcopy(G1_LOCATION, q_lookup_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_11_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[12] * vk[11]
                mcopy(G1_LOCATION, q_poseidon_2_external_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_12_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[13] * vk[12]
                mcopy(G1_LOCATION, q_poseidon_2_internal_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_13_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[14] * vk[13]
                mcopy(G1_LOCATION, sigma_1_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_14_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[15] * vk[14]
                mcopy(G1_LOCATION, sigma_2_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_15_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[16] * vk[15]
                mcopy(G1_LOCATION, sigma_3_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_16_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[17] * vk[16]
                mcopy(G1_LOCATION, sigma_4_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_17_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[18] * vk[17]
                mcopy(G1_LOCATION, id_1_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_18_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[19] * vk[18]
                mcopy(G1_LOCATION, id_2_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_19_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[20] * vk[19]
                mcopy(G1_LOCATION, id_3_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_20_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[21] * vk[20]
                mcopy(G1_LOCATION, id_4_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_21_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[22] * vk[21]
                mcopy(G1_LOCATION, table_1_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_22_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[23] * vk[22]
                mcopy(G1_LOCATION, table_2_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_23_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[24] * vk[23]
                mcopy(G1_LOCATION, table_3_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_24_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[25] * vk[24]
                mcopy(G1_LOCATION, table_4_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_25_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[26] * vk[25]
                mcopy(G1_LOCATION, lagrange_first_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_26_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[27] * vk[26]
                mcopy(G1_LOCATION, lagrange_last_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_27_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulate proof points
                // Accumulator = accumulator + scalar[28] * w_l
                writeProofPointIntoScratchSpace(w_l_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_28_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[28] * w_l
                writeProofPointIntoScratchSpace(w_r_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_29_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[30] * w_o
                 writeProofPointIntoScratchSpace(w_o_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_30_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[31] * w_4
                writeProofPointIntoScratchSpace(w_4_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_31_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[32] * z_perm
                 writeProofPointIntoScratchSpace(z_perm_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_32_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[33] * lookup_inverses
                writeProofPointIntoScratchSpace(lookup_inverses_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_33_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[34] * lookup_read_counts
                writeProofPointIntoScratchSpace(lookup_read_counts_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_34_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[35] * lookup_read_tags
                writeProofPointIntoScratchSpace(lookup_read_tags_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_35_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // To be shifted accumulators
                // Accumulator = accumulator + scalar[36] * table_1
                mcopy(G1_LOCATION, table_1_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_36_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[37] * table_2
                mcopy(G1_LOCATION, table_2_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_37_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[38] * table_3
                mcopy(G1_LOCATION, table_3_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_38_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[39] * table_4
                mcopy(G1_LOCATION, table_4_x_loc, 0x40)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_39_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[40] * w_l
                writeProofPointIntoScratchSpace(w_l_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_40_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[41] * w_r
                writeProofPointIntoScratchSpace(w_r_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_41_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[42] * w_o
                writeProofPointIntoScratchSpace(w_o_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_42_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // Accumulator = accumulator + scalar[43] * w_4
                writeProofPointIntoScratchSpace(w_4_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_43_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[44] * z_perm
                writeProofPointIntoScratchSpace(z_perm_x0_loc)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_44_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
            }

            // TODO(md): there is no reason that this isnt done before the accumulation above
            // Batch gemini claims from the prover

            // WORKTODO: note we can reuse all of the batch scalar memory locations up to 44 at this point
            // We can also accumulate commitments in place

            {

            let constantTermAcc := 0
            let shplonkNu := mload(SHPLONK_NU_CHALLENGE)
            let batchingChallenge2 := mulmod(shplonkNu, shplonkNu , p)

            // TOOD: unwrap???
            let bound := sub(LOG_N, 2)
            for {let i := 0} lt(i, CONST_PROOF_SIZE_LOG_N) {i := add(i, 1)} {
                off := mul(i, 0x20)
                let vanishing_evals_off := add(INVERTED_GEMINI_DENOMINATOR_2_LOC, off)
                let scalarOff := add(BATCH_SCALAR_0_LOC, off)
                let evaluationsOff := add(GEMINI_A_EVAL_1, off)

                // i >= LOG_N -1
                let scalingFactor := 0 // update

                // TODO: optimise
                let dum := gt(i, bound)
                if iszero(dum) {
                    scalingFactor := mulmod(batchingChallenge2, mload(vanishing_evals_off), p)
                }
                // If the scalingFactor is 0, this will be 0 as (p mod p == 0 mod p)
                mstore(scalarOff, sub(p, scalingFactor))

                constantTermAcc := addmod(constantTermAcc, mulmod(scalingFactor, mload(evaluationsOff), p), p)
                batchingChallenge2  := mulmod(batchingChallenge2, shplonkNu, p)
            }
            mstore(CONSTANT_TERM_ACCUMULATOR_LOC, constantTermAcc)
        }

            // Accumulate these LOG_N scalars with the gemini fold univariates
            {
                {
                // accumulator = accumulator + scalar[45] * gemini_fold_univariates[0]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_0_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_0_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[46] * gemini_fold_univariates[1]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_1_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_1_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[47] * gemini_fold_univariates[2]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_2_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_2_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[48] * gemini_fold_univariates[3]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_3_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_3_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[49] * gemini_fold_univariates[4]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_4_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_4_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                }

                {
                // accumulator = accumulator + scalar[50] * gemini_fold_univariates[5]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_5_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_5_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[51] * gemini_fold_univariates[6]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_6_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_6_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[52] * gemini_fold_univariates[7]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_7_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_7_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[53] * gemini_fold_univariates[8]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_8_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_8_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[54] * gemini_fold_univariates[9]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_9_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_9_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[55] * gemini_fold_univariates[10]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_10_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_10_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                }

                {
                // accumulator = accumulator + scalar[56] * gemini_fold_univariates[11]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_11_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_11_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[57] * gemini_fold_univariates[12]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_12_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_12_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[58] * gemini_fold_univariates[13]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_13_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_13_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[59] * gemini_fold_univariates[14]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_14_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_14_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[60] * gemini_fold_univariates[15]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_15_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_15_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

            }


            {
                // accumulator = accumulator + scalar[61] * gemini_fold_univariates[16]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_16_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_16_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[62] * gemini_fold_univariates[17]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_17_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_17_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[63] * gemini_fold_univariates[18]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_18_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_18_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[64] * gemini_fold_univariates[19]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_19_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_19_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[65] * gemini_fold_univariates[20]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_20_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_20_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

            }

            {

                // accumulator = accumulator + scalar[66] * gemini_fold_univariates[21]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_21_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_21_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[67] * gemini_fold_univariates[22]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_22_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_22_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[68] * gemini_fold_univariates[23]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_23_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_23_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[69] * gemini_fold_univariates[24]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_24_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_24_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[70] * gemini_fold_univariates[25]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_25_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_25_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))

                // accumulator = accumulator + scalar[71] * gemini_fold_univariates[26]
                writeProofPointIntoScratchSpace(GEMINI_FOLD_UNIVARIATE_26_X0_LOC)
                mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_26_LOC))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
            }

        }


            // TODO: bundle this batch inversion with the other batch inversions
            // Yet another batched inversion
            // We need to invert (1 - u) + u
            // This u value is known earlier in the code as it calculated in the transcript
            // So we can perforn the inversion earlier
            // Although a modexp is only 200 gas so it doesnt cost that much

            // Batch invert the (1 - u) + u for each LOG_N u values - LOG_N is 15 for this program
            {
                let p_plus_one := add(p, 1)
                // WARNING: We overwrite the SUM_U_CHALLENGES HERE
                // TODO: write aliases for these variables
                // Explain at the top of the file why we have used an alias for the value
                let u := mload(SUM_U_CHALLENGE_14)
                let pow := mload(POWERS_OF_EVALUATION_CHALLENGE_14_LOC)
                // OPT: P + 1 in here should be a constant
                let product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)

                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_14_LOC, product)
                accumulator := product

                mstore(BATCH_ACCUMULATOR_0_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_13)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_13_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_13_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_1_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_12)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_12_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_12_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_2_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_11)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_11_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_11_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_3_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_10)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_10_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_10_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_4_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_9)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_9_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_9_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_5_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_8)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_8_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_8_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_6_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_7)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_7_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_7_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_7_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_6)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_6_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_6_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                mstore(BATCH_ACCUMULATOR_8_LOC, accumulator)
                u := mload(SUM_U_CHALLENGE_5)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_5_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_5_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                let t9 := accumulator
                u := mload(SUM_U_CHALLENGE_4)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_4_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_4_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                let t10 := accumulator
                u := mload(SUM_U_CHALLENGE_3)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_3_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_3_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                let t11 := accumulator
                u := mload(SUM_U_CHALLENGE_2)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_2_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_2_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                let t12 := accumulator
                u := mload(SUM_U_CHALLENGE_1)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_1_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_1_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                let t13 := accumulator
                u := mload(SUM_U_CHALLENGE_0)
                pow := mload(POWERS_OF_EVALUATION_CHALLENGE_0_LOC)
                product := addmod(mulmod(sub(p_plus_one, u), pow, p), u, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_0_LOC, product)
                accumulator := mulmod(accumulator, product, p)

                {
                    // There is an accumulator for batchMUL stored within 0x00 -> 0x3f
                    mstore(0x40, 0x20)
                    mstore(0x60, 0x20)
                    mstore(0x80, 0x20)
                    mstore(0xa0, accumulator)
                    mstore(0xc0, sub(p, 2))
                    mstore(0xe0, p)
                    if iszero(staticcall(gas(), 0x05, 0x40, 0xe0, 0x40, 0x20)) {
                        mstore(0x00, MODEXP_FAILED_SELECTOR)
                        revert(0x00, 0x04)
                    }
                    accumulator := mload(0x40)
                }

                // TODO: as noted above - alias the sum us
                t13 := mulmod(accumulator, t13, p)
                let temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_0_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_0_LOC, t13)

                accumulator := mulmod(accumulator, temp, p)

                t12 := mulmod(accumulator, t12, p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_1_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_1_LOC, t12)

                accumulator := mulmod(accumulator, temp, p)

                t11 := mulmod(accumulator, t11, p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_2_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_2_LOC, t11)

                accumulator := mulmod(accumulator, temp, p)

                t10 := mulmod(accumulator, t10, p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_3_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_3_LOC, t10)

                accumulator := mulmod(accumulator, temp, p)

                t9 := mulmod(accumulator, t9, p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_4_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_4_LOC, t9)

                accumulator := mulmod(accumulator, temp, p)

                let t8 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_8_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_5_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_5_LOC, t8)

                accumulator := mulmod(accumulator, temp, p)

                let t7 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_7_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_6_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_6_LOC, t7)

                accumulator := mulmod(accumulator, temp, p)

                let t6 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_6_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_7_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_7_LOC, t6)

                accumulator := mulmod(accumulator, temp, p)

                let t5 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_5_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_8_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_8_LOC, t5)

                accumulator := mulmod(accumulator, temp, p)

                let t4 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_4_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_9_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_9_LOC, t4)

                accumulator := mulmod(accumulator, temp, p)

                let t3 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_3_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_10_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_10_LOC, t3)

                accumulator := mulmod(accumulator, temp, p)

                let t2 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_2_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_11_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_11_LOC, t2)

                accumulator := mulmod(accumulator, temp, p)

                let t1 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_1_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_12_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_12_LOC, t1)

                accumulator := mulmod(accumulator, temp, p)

                let t0 := mulmod(accumulator, mload(BATCH_ACCUMULATOR_0_LOC), p)
                temp := mload(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_13_LOC)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_13_LOC, t0)

                accumulator := mulmod(accumulator, temp, p)
                mstore(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_14_LOC, accumulator)
            }

            {
                let batchedEvalRoundAcc := mload(BATCHED_EVALUATION_LOC)

                // Compute Gemini Batched Univariate Evaluation
                for {let i := LOG_N} gt(i, 0) {i := sub(i, 1)} {
                    // TODO: opt
                    let p_plus_one := add(p, 1)

                    // TODO: remove the sub 1 here
                    off := mul(sub(i, 1), 0x20)

                    // TODO: think about how pow is used here: it is used in the above batch inversion
                    // so we probabaly want to avoid loading it to often

                    let challPower := mload(add(POWERS_OF_EVALUATION_CHALLENGE_0_LOC, off))
                    let u := mload(add(SUM_U_CHALLENGE_0, off))
                    let inversion := mload(add(BATCHED_EVALUATION_ACCUMULATOR_INVERSION_0_LOC, off))
                    let evalNeg := mload(add(GEMINI_A_EVAL_0, off))

                    batchedEvalRoundAcc := mulmod(challPower,
                        mulmod(
                            batchedEvalRoundAcc,
                            2,
                            p
                        ),
                        p
                    )
                    batchedEvalRoundAcc := addmod(batchedEvalRoundAcc, sub(p,
                        mulmod(
                            evalNeg,
                            sub(
                                mulmod(challPower, sub(p_plus_one, u), p),
                                u
                            ),
                            p
                        )
                    ),p)

                    batchedEvalRoundAcc := mulmod(batchedEvalRoundAcc, inversion, p)
                }

                let a0Pos := batchedEvalRoundAcc

                let constantTermAcc := addmod(mload(CONSTANT_TERM_ACCUMULATOR_LOC),
                    mulmod(
                        a0Pos,
                        mload(INVERTED_GEMINI_DENOMINATOR_0_LOC),
                        p
                    ),
                    p
                )
                constantTermAcc := addmod(constantTermAcc,
                    mulmod(
                        mload(GEMINI_A_EVAL_0),
                        mulmod(
                            mload(SHPLONK_NU_CHALLENGE),
                            mload(INVERTED_GEMINI_DENOMINATOR_1_LOC),
                            p
                        ),
                        p
                    ),
                    p
                )

                // Accumulate the constant term accumulator
                // Accumulator = accumulator + 1 * costant term accumulator
                mstore(G1_LOCATION, 0x01)
                mstore(add(G1_LOCATION, 0x20), 0x02)
                mstore(SCALAR_LOCATION, constantTermAcc)
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))


                // Accumlate final quotient commitment into shplonk check
                // Accumulator = accumulator + shplonkZ * quotient commitment
                writeProofPointIntoScratchSpace(KZG_QUOTIENT_X0_LOC)
                let x := mload(0x60)
                let y := mload(0x80)

                mstore(SCALAR_LOCATION, mload(SHPLONK_Z_CHALLENGE))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, ACCUMULATOR_2, 0x40))
                precomp_success_flag := and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, ACCUMULATOR, 0x40))
            }

            if iszero(precomp_success_flag) {
                mstore(0x00, BATCH_ACCUMULATION_FAILED_SELECTOR)
                revert(0x00, 0x04)
            }

            {
                let q := 21888242871839275222246405745257275088696311157297823662689037894645226208583 // EC group order
                // NOTE: this was written to scratch space above, OPT?
                // P_1
                let x, y := writeProofPointOntoStack(KZG_QUOTIENT_X0_LOC)
                mstore(0xc0, x)
                mstore(0xe0, sub(q, y))

                // Move values around for the pairing check
                // pairing check - layout TODO and prose

                // p_0
                mcopy(0x00, ACCUMULATOR, 0x40)

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

                let pairing_success := staticcall(gas(), 8, 0x00, 0x180, 0x00, 0x20)
                if iszero(and(pairing_success, mload(0x00))) {
                    mstore(0x00, PAIRING_FAILED_SELECTOR)
                    revert(0x00, 0x04)
                }

            }
            {
                mstore(0x00, 0x01)
                return(0x00, 0x20) // Proof succeeded!
            }
        }

    }
}

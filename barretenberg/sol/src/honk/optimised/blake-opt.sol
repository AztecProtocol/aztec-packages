pragma solidity ^0.8.26;

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
    uint256 internal constant eval_Q_M_loc = 0x31c0;
    uint256 internal constant eval_Q_C_loc = 0x31e0;
    uint256 internal constant eval_Q_L_loc = 0x3200;
    uint256 internal constant eval_Q_R_loc = 0x3220;
    uint256 internal constant eval_Q_O_loc = 0x3240;
    uint256 internal constant eval_Q_4_loc = 0x3260;
    uint256 internal constant eval_Q_ARITH_loc = 0x3280;
    uint256 internal constant eval_Q_RANGE_loc = 0x32a0;
    uint256 internal constant eval_Q_ELLIPTIC_loc = 0x32c0;
    uint256 internal constant eval_Q_AUX_loc = 0x32e0;
    uint256 internal constant eval_Q_LOOKUP_loc = 0x3300;
    uint256 internal constant eval_Q_POSEIDON2_EXTERNAL_loc = 0x3320;
    uint256 internal constant eval_Q_POSEIDON2_INTERNAL_loc = 0x3340;
    uint256 internal constant eval_SIGMA_1_loc = 0x3360;
    uint256 internal constant eval_SIGMA_2_loc = 0x3380;
    uint256 internal constant eval_SIGMA_3_loc = 0x33a0;
    uint256 internal constant eval_SIGMA_4_loc = 0x33c0;
    uint256 internal constant eval_ID_1_loc = 0x33e0;
    uint256 internal constant eval_ID_2_loc = 0x3400;
    uint256 internal constant eval_ID_3_loc = 0x3420;
    uint256 internal constant eval_ID_4_loc = 0x3440;
    uint256 internal constant eval_TABLE_1_loc = 0x3460;
    uint256 internal constant eval_TABLE_2_loc = 0x3480;
    uint256 internal constant eval_TABLE_3_loc = 0x34a0;
    uint256 internal constant eval_TABLE_4_loc = 0x34c0;
    uint256 internal constant eval_LAGRANGE_FIRST_loc = 0x34e0;
    uint256 internal constant eval_LAGRANGE_LAST_loc = 0x3500;
    uint256 internal constant eval_W_L_loc = 0x3520;
    uint256 internal constant eval_W_R_loc = 0x3540;
    uint256 internal constant eval_W_O_loc = 0x3560;
    uint256 internal constant eval_W_4_loc = 0x3580;
    uint256 internal constant eval_Z_PERM_loc = 0x35a0;
    uint256 internal constant eval_LOOKUP_INVERSES_loc = 0x35c0;
    uint256 internal constant eval_LOOKUP_READ_COUNTS_loc = 0x35e0;
    uint256 internal constant eval_LOOKUP_READ_TAGS_loc = 0x3600;
    uint256 internal constant eval_TABLE_1_SHIFT_loc = 0x3620;
    uint256 internal constant eval_TABLE_2_SHIFT_loc = 0x3640;
    uint256 internal constant eval_TABLE_3_SHIFT_loc = 0x3660;
    uint256 internal constant eval_TABLE_4_SHIFT_loc = 0x3680;
    uint256 internal constant eval_W_L_SHIFT_loc = 0x36a0;
    uint256 internal constant eval_W_R_SHIFT_loc = 0x36c0;
    uint256 internal constant eval_W_O_SHIFT_loc = 0x36e0;
    uint256 internal constant eval_W_4_SHIFT_loc = 0x3700;
    uint256 internal constant eval_Z_PERM_SHIFT_loc = 0x3720;

    // Zermorph items
    uint256 internal constant zm_cqs_0_x0_loc = 0x3740;
    uint256 internal constant zm_cqs_0_x1_loc = 0x3760;
    uint256 internal constant zm_cqs_0_y0_loc = 0x3780;
    uint256 internal constant zm_cqs_0_y1_loc = 0x37a0;
    uint256 internal constant zm_cqs_1_x0_loc = 0x37c0;
    uint256 internal constant zm_cqs_1_x1_loc = 0x37e0;
    uint256 internal constant zm_cqs_1_y0_loc = 0x3800;
    uint256 internal constant zm_cqs_1_y1_loc = 0x3820;
    uint256 internal constant zm_cqs_2_x0_loc = 0x3840;
    uint256 internal constant zm_cqs_2_x1_loc = 0x3860;
    uint256 internal constant zm_cqs_2_y0_loc = 0x3880;
    uint256 internal constant zm_cqs_2_y1_loc = 0x38a0;
    uint256 internal constant zm_cqs_3_x0_loc = 0x38c0;
    uint256 internal constant zm_cqs_3_x1_loc = 0x38e0;
    uint256 internal constant zm_cqs_3_y0_loc = 0x3900;
    uint256 internal constant zm_cqs_3_y1_loc = 0x3920;
    uint256 internal constant zm_cqs_4_x0_loc = 0x3940;
    uint256 internal constant zm_cqs_4_x1_loc = 0x3960;
    uint256 internal constant zm_cqs_4_y0_loc = 0x3980;
    uint256 internal constant zm_cqs_4_y1_loc = 0x39a0;
    uint256 internal constant zm_cqs_5_x0_loc = 0x39c0;
    uint256 internal constant zm_cqs_5_x1_loc = 0x39e0;
    uint256 internal constant zm_cqs_5_y0_loc = 0x3a00;
    uint256 internal constant zm_cqs_5_y1_loc = 0x3a20;
    uint256 internal constant zm_cqs_6_x0_loc = 0x3a40;
    uint256 internal constant zm_cqs_6_x1_loc = 0x3a60;
    uint256 internal constant zm_cqs_6_y0_loc = 0x3a80;
    uint256 internal constant zm_cqs_6_y1_loc = 0x3aa0;
    uint256 internal constant zm_cqs_7_x0_loc = 0x3ac0;
    uint256 internal constant zm_cqs_7_x1_loc = 0x3ae0;
    uint256 internal constant zm_cqs_7_y0_loc = 0x3b00;
    uint256 internal constant zm_cqs_7_y1_loc = 0x3b20;
    uint256 internal constant zm_cqs_8_x0_loc = 0x3b40;
    uint256 internal constant zm_cqs_8_x1_loc = 0x3b60;
    uint256 internal constant zm_cqs_8_y0_loc = 0x3b80;
    uint256 internal constant zm_cqs_8_y1_loc = 0x3ba0;
    uint256 internal constant zm_cqs_9_x0_loc = 0x3bc0;
    uint256 internal constant zm_cqs_9_x1_loc = 0x3be0;
    uint256 internal constant zm_cqs_9_y0_loc = 0x3c00;
    uint256 internal constant zm_cqs_9_y1_loc = 0x3c20;
    uint256 internal constant zm_cqs_10_x0_loc = 0x3c40;
    uint256 internal constant zm_cqs_10_x1_loc = 0x3c60;
    uint256 internal constant zm_cqs_10_y0_loc = 0x3c80;
    uint256 internal constant zm_cqs_10_y1_loc = 0x3ca0;
    uint256 internal constant zm_cqs_11_x0_loc = 0x3cc0;
    uint256 internal constant zm_cqs_11_x1_loc = 0x3ce0;
    uint256 internal constant zm_cqs_11_y0_loc = 0x3d00;
    uint256 internal constant zm_cqs_11_y1_loc = 0x3d20;
    uint256 internal constant zm_cqs_12_x0_loc = 0x3d40;
    uint256 internal constant zm_cqs_12_x1_loc = 0x3d60;
    uint256 internal constant zm_cqs_12_y0_loc = 0x3d80;
    uint256 internal constant zm_cqs_12_y1_loc = 0x3da0;
    uint256 internal constant zm_cqs_13_x0_loc = 0x3dc0;
    uint256 internal constant zm_cqs_13_x1_loc = 0x3de0;
    uint256 internal constant zm_cqs_13_y0_loc = 0x3e00;
    uint256 internal constant zm_cqs_13_y1_loc = 0x3e20;
    uint256 internal constant zm_cqs_14_x0_loc = 0x3e40;
    uint256 internal constant zm_cqs_14_x1_loc = 0x3e60;
    uint256 internal constant zm_cqs_14_y0_loc = 0x3e80;
    uint256 internal constant zm_cqs_14_y1_loc = 0x3ea0;
    uint256 internal constant zm_cqs_15_x0_loc = 0x3ec0;
    uint256 internal constant zm_cqs_15_x1_loc = 0x3ee0;
    uint256 internal constant zm_cqs_15_y0_loc = 0x3f00;
    uint256 internal constant zm_cqs_15_y1_loc = 0x3f20;
    uint256 internal constant zm_cqs_16_x0_loc = 0x3f40;
    uint256 internal constant zm_cqs_16_x1_loc = 0x3f60;
    uint256 internal constant zm_cqs_16_y0_loc = 0x3f80;
    uint256 internal constant zm_cqs_16_y1_loc = 0x3fa0;
    uint256 internal constant zm_cqs_17_x0_loc = 0x3fc0;
    uint256 internal constant zm_cqs_17_x1_loc = 0x3fe0;
    uint256 internal constant zm_cqs_17_y0_loc = 0x4000;
    uint256 internal constant zm_cqs_17_y1_loc = 0x4020;
    uint256 internal constant zm_cqs_18_x0_loc = 0x4040;
    uint256 internal constant zm_cqs_18_x1_loc = 0x4060;
    uint256 internal constant zm_cqs_18_y0_loc = 0x4080;
    uint256 internal constant zm_cqs_18_y1_loc = 0x40a0;
    uint256 internal constant zm_cqs_19_x0_loc = 0x40c0;
    uint256 internal constant zm_cqs_19_x1_loc = 0x40e0;
    uint256 internal constant zm_cqs_19_y0_loc = 0x4100;
    uint256 internal constant zm_cqs_19_y1_loc = 0x4120;
    uint256 internal constant zm_cqs_20_x0_loc = 0x4140;
    uint256 internal constant zm_cqs_20_x1_loc = 0x4160;
    uint256 internal constant zm_cqs_20_y0_loc = 0x4180;
    uint256 internal constant zm_cqs_20_y1_loc = 0x41a0;
    uint256 internal constant zm_cqs_21_x0_loc = 0x41c0;
    uint256 internal constant zm_cqs_21_x1_loc = 0x41e0;
    uint256 internal constant zm_cqs_21_y0_loc = 0x4200;
    uint256 internal constant zm_cqs_21_y1_loc = 0x4220;
    uint256 internal constant zm_cqs_22_x0_loc = 0x4240;
    uint256 internal constant zm_cqs_22_x1_loc = 0x4260;
    uint256 internal constant zm_cqs_22_y0_loc = 0x4280;
    uint256 internal constant zm_cqs_22_y1_loc = 0x42a0;
    uint256 internal constant zm_cqs_23_x0_loc = 0x42c0;
    uint256 internal constant zm_cqs_23_x1_loc = 0x42e0;
    uint256 internal constant zm_cqs_23_y0_loc = 0x4300;
    uint256 internal constant zm_cqs_23_y1_loc = 0x4320;
    uint256 internal constant zm_cqs_24_x0_loc = 0x4340;
    uint256 internal constant zm_cqs_24_x1_loc = 0x4360;
    uint256 internal constant zm_cqs_24_y0_loc = 0x4380;
    uint256 internal constant zm_cqs_24_y1_loc = 0x43a0;
    uint256 internal constant zm_cqs_25_x0_loc = 0x43c0;
    uint256 internal constant zm_cqs_25_x1_loc = 0x43e0;
    uint256 internal constant zm_cqs_25_y0_loc = 0x4400;
    uint256 internal constant zm_cqs_25_y1_loc = 0x4420;
    uint256 internal constant zm_cqs_26_x0_loc = 0x4440;
    uint256 internal constant zm_cqs_26_x1_loc = 0x4460;
    uint256 internal constant zm_cqs_26_y0_loc = 0x4480;
    uint256 internal constant zm_cqs_26_y1_loc = 0x44a0;
    uint256 internal constant zm_cqs_27_x0_loc = 0x44c0;
    uint256 internal constant zm_cqs_27_x1_loc = 0x44e0;
    uint256 internal constant zm_cqs_27_y0_loc = 0x4500;
    uint256 internal constant zm_cqs_27_y1_loc = 0x4520;
    uint256 internal constant zm_cq_x0_loc = 0x4540;
    uint256 internal constant zm_cq_x1_loc = 0x4560;
    uint256 internal constant zm_cq_y0_loc = 0x4580;
    uint256 internal constant zm_cq_y1_loc = 0x45a0;
    uint256 internal constant zm_pi_x0_loc = 0x45c0;
    uint256 internal constant zm_pi_x1_loc = 0x45e0;
    uint256 internal constant zm_pi_y0_loc = 0x4600;
    uint256 internal constant zm_pi_y1_loc = 0x4620;

    // Challenges offsets
    uint256 internal constant eta_challenge_loc = 0x4640;
    uint256 internal constant eta_two_challenge_loc = 0x4660;
    uint256 internal constant eta_three_challenge_loc = 0x4680;
    uint256 internal constant beta_challenge_loc = 0x46a0;
    uint256 internal constant gamma_challenge_loc = 0x46c0;
    uint256 internal constant rho_challenge_loc = 0x46e0;
    uint256 internal constant zm_x_challenge_loc = 0x4700;
    uint256 internal constant zm_y_challenge_loc = 0x4720;
    uint256 internal constant zm_z_challenge_loc = 0x4740;
    uint256 internal constant zm_quotient_challenge_loc = 0x4760;
    uint256 internal constant public_inputs_delta_challenge_loc = 0x4780;
    uint256 internal constant alpha_challenge_0_loc = 0x47a0;
    uint256 internal constant alpha_challenge_1_loc = 0x47c0;
    uint256 internal constant alpha_challenge_2_loc = 0x47e0;
    uint256 internal constant alpha_challenge_3_loc = 0x4800;
    uint256 internal constant alpha_challenge_4_loc = 0x4820;
    uint256 internal constant alpha_challenge_5_loc = 0x4840;
    uint256 internal constant alpha_challenge_6_loc = 0x4860;
    uint256 internal constant alpha_challenge_7_loc = 0x4880;
    uint256 internal constant alpha_challenge_8_loc = 0x48a0;
    uint256 internal constant alpha_challenge_9_loc = 0x48c0;
    uint256 internal constant alpha_challenge_10_loc = 0x48e0;
    uint256 internal constant alpha_challenge_11_loc = 0x4900;
    uint256 internal constant alpha_challenge_12_loc = 0x4920;
    uint256 internal constant alpha_challenge_13_loc = 0x4940;
    uint256 internal constant alpha_challenge_14_loc = 0x4960;
    uint256 internal constant alpha_challenge_15_loc = 0x4980;
    uint256 internal constant alpha_challenge_16_loc = 0x49a0;
    uint256 internal constant alpha_challenge_17_loc = 0x49c0;
    uint256 internal constant alpha_challenge_18_loc = 0x49e0;
    uint256 internal constant alpha_challenge_19_loc = 0x4a00;
    uint256 internal constant alpha_challenge_20_loc = 0x4a20;
    uint256 internal constant alpha_challenge_21_loc = 0x4a40;
    uint256 internal constant alpha_challenge_22_loc = 0x4a60;
    uint256 internal constant alpha_challenge_23_loc = 0x4a80;
    uint256 internal constant alpha_challenge_24_loc = 0x4aa0;
    uint256 internal constant gate_challenge_0_loc = 0x4ac0;
    uint256 internal constant gate_challenge_1_loc = 0x4ae0;
    uint256 internal constant gate_challenge_2_loc = 0x4b00;
    uint256 internal constant gate_challenge_3_loc = 0x4b20;
    uint256 internal constant gate_challenge_4_loc = 0x4b40;
    uint256 internal constant gate_challenge_5_loc = 0x4b60;
    uint256 internal constant gate_challenge_6_loc = 0x4b80;
    uint256 internal constant gate_challenge_7_loc = 0x4ba0;
    uint256 internal constant gate_challenge_8_loc = 0x4bc0;
    uint256 internal constant gate_challenge_9_loc = 0x4be0;
    uint256 internal constant gate_challenge_10_loc = 0x4c00;
    uint256 internal constant gate_challenge_11_loc = 0x4c20;
    uint256 internal constant gate_challenge_12_loc = 0x4c40;
    uint256 internal constant gate_challenge_13_loc = 0x4c60;
    uint256 internal constant gate_challenge_14_loc = 0x4c80;
    uint256 internal constant gate_challenge_15_loc = 0x4ca0;
    uint256 internal constant gate_challenge_16_loc = 0x4cc0;
    uint256 internal constant gate_challenge_17_loc = 0x4ce0;
    uint256 internal constant gate_challenge_18_loc = 0x4d00;
    uint256 internal constant gate_challenge_19_loc = 0x4d20;
    uint256 internal constant gate_challenge_20_loc = 0x4d40;
    uint256 internal constant gate_challenge_21_loc = 0x4d60;
    uint256 internal constant gate_challenge_22_loc = 0x4d80;
    uint256 internal constant gate_challenge_23_loc = 0x4da0;
    uint256 internal constant gate_challenge_24_loc = 0x4dc0;
    uint256 internal constant gate_challenge_25_loc = 0x4de0;
    uint256 internal constant gate_challenge_26_loc = 0x4e00;
    uint256 internal constant gate_challenge_27_loc = 0x4e20;
    uint256 internal constant sum_u_challenge_0_loc = 0x4e40;
    uint256 internal constant sum_u_challenge_1_loc = 0x4e60;
    uint256 internal constant sum_u_challenge_2_loc = 0x4e80;
    uint256 internal constant sum_u_challenge_3_loc = 0x4ea0;
    uint256 internal constant sum_u_challenge_4_loc = 0x4ec0;
    uint256 internal constant sum_u_challenge_5_loc = 0x4ee0;
    uint256 internal constant sum_u_challenge_6_loc = 0x4f00;
    uint256 internal constant sum_u_challenge_7_loc = 0x4f20;
    uint256 internal constant sum_u_challenge_8_loc = 0x4f40;
    uint256 internal constant sum_u_challenge_9_loc = 0x4f60;
    uint256 internal constant sum_u_challenge_10_loc = 0x4f80;
    uint256 internal constant sum_u_challenge_11_loc = 0x4fa0;
    uint256 internal constant sum_u_challenge_12_loc = 0x4fc0;
    uint256 internal constant sum_u_challenge_13_loc = 0x4fe0;
    uint256 internal constant sum_u_challenge_14_loc = 0x5000;
    uint256 internal constant sum_u_challenge_15_loc = 0x5020;
    uint256 internal constant sum_u_challenge_16_loc = 0x5040;
    uint256 internal constant sum_u_challenge_17_loc = 0x5060;
    uint256 internal constant sum_u_challenge_18_loc = 0x5080;
    uint256 internal constant sum_u_challenge_19_loc = 0x50a0;
    uint256 internal constant sum_u_challenge_20_loc = 0x50c0;
    uint256 internal constant sum_u_challenge_21_loc = 0x50e0;
    uint256 internal constant sum_u_challenge_22_loc = 0x5100;
    uint256 internal constant sum_u_challenge_23_loc = 0x5120;
    uint256 internal constant sum_u_challenge_24_loc = 0x5140;
    uint256 internal constant sum_u_challenge_25_loc = 0x5160;
    uint256 internal constant sum_u_challenge_26_loc = 0x5180;
    uint256 internal constant sum_u_challenge_27_loc = 0x51a0;


    uint256 internal constant prev_challenge_loc = 0x51c0;

    uint256 internal constant PUBLIC_INPUTS_DELTA_NUMERATOR_LOC = 0x51e0;
    uint256 internal constant PUBLIC_INPUTS_DELTA_DENOMINATOR_LOC = 0x5200;

    // The number of barycentric domain values is dependant on the highest degree relation
    // Number of barycentric domain values is 8
    // We write slab memory addresses manually as i dont trust the compiler
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_LOC = 0x5220;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_1_LOC = 0x5240;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_2_LOC = 0x5260;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_3_LOC = 0x5280;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_4_LOC = 0x52a0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_5_LOC = 0x52c0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_6_LOC = 0x52e0;
    uint256 internal constant BARYCENTRIC_LAGRANGE_DENOMINATORS_7_LOC = 0x5300;

    // = BARYCENTRIC_LAGRANGE_DENOMINATORS_LOC + 8 * 0x20
    uint256 internal constant BARYCENTRIC_DOMAIN_LOC = 0x5320;
    uint256 internal constant BARYCENTRIC_DOMAIN_1_LOC = 0x5340;
    uint256 internal constant BARYCENTRIC_DOMAIN_2_LOC = 0x5360;
    uint256 internal constant BARYCENTRIC_DOMAIN_3_LOC = 0x5380;
    uint256 internal constant BARYCENTRIC_DOMAIN_4_LOC = 0x53a0;
    uint256 internal constant BARYCENTRIC_DOMAIN_5_LOC = 0x53c0;
    uint256 internal constant BARYCENTRIC_DOMAIN_6_LOC = 0x53e0;
    uint256 internal constant BARYCENTRIC_DOMAIN_7_LOC = 0x5400;

    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_LOC = 0x5420;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_1_LOC = 0x5440;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_2_LOC = 0x5460;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_3_LOC = 0x5480;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_4_LOC = 0x54a0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_5_LOC = 0x54c0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_6_LOC = 0x54e0;
    uint256 internal constant BARYCENTRIC_DENOMINATOR_INVERSES_7_LOC = 0x5500;

    uint256 internal constant NEXT_FREE_LOC = 0x5520;

    constructor() {
        // TODO: verify the points are on the curve in the constructor
    }

    // Inline the verification key code here for the meantime
    // will be in it's own library
    // Note the split committments here will make a difference to costs in the end
    function loadVk() internal view {
        assembly {
            // TODO: in the vk swap the location of l and m
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
            mstore(q_aux_x_loc, 0x1c6fc8e14453adf64e6d9643ef9f1fb55e3a307ac1ec84f86cd736fc866e05ab)
            mstore(q_aux_y_loc, 0x1bf8619b1704b99ab8820ed94dd760da2945e8e1c771c0bdeadbe40aa5700cdd)
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
            mstore(table_3_y_loc, 0x211a0833bb3c6f9ae6c94519b6878ed6157c4a080df786a053d9a19796b9a7f8)
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
    }

    uint256 internal constant LOWER_128_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) public override returns (bool) {

        // Load the verification key into memory
        loadVk();

        // Load the proof from calldata in one large chunk
        assembly {

            function splitChallenge(challenge) -> first, second {
                first := and(challenge, LOWER_128_MASK)
                second := shr(128, challenge)
            }

            let q := 21888242871839275222246405745257275088696311157297823662689037894645226208583 // EC group order
            let p := 21888242871839275222246405745257275088548364400416034343698204186575808495617 // Prime field order

            // Add the skip offset to the given pointer

            // TODO(md): potential further optimisations
            // Rather than mcpying the entire sections to be hashed, we would get away with copying the previous hash
            // into the value before ( by caching the value we are swapping it with in scratch space ) and then
            // copying the value back when we are done hashing
            // rather than copying the entire section over to the lower registers
            {
                let proof_ptr := add(calldataload(0x04), 0x24)

                // As all of our proof points are written in contiguous parts of memory, we call use a single
                // calldatacopy to place all of our proof into the correct memory regions

                // Load the proof into memory
                // TODO: make sure this is evaluated as const
                // The last item in the proof, and the first item in the proof
                let proof_size := sub(zm_pi_y1_loc , proof_circuit_size_loc)
                calldatacopy(proof_circuit_size_loc, proof_ptr, proof_size)


                // TODO(md): IMPORTANT: Mod all of the base field items by q, and all prime field items by p
                // for the sake of testing we are assuming that these are correct

                // Generate challenges

                // TODO: nice section headers ASCII
                /** Generate Eta Challenges */

                // The use of mcpy will be a life saver here
                // TODO: make sure that we have enough of a scratch space to work with here
                // TODO: use an mcpy alternative once off plane - is it available in yul yet?
                let number_of_public_inputs := mload(proof_num_public_inputs_loc)

                // Note: can be mcpyed from proof
                // TODO: work what memory can be used here - if we use 0 solidity at all we can get
                // away with ignoring free memory practices entirely

                // TODO(md): This section could be an mcpy
                mstore(0x00, mload(proof_circuit_size_loc))
                mstore(0x20, number_of_public_inputs)
                mstore(0x40, mload(proof_pub_inputs_offset_loc))

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

                mstore(eta_challenge_loc, eta)
                mstore(eta_two_challenge_loc, etaTwo)

                prev_challenge := mod(keccak256(0x00, 0x20), p)

                // TODO: update memory pointer
                mstore(0x00, prev_challenge)
                let eta_three := and(prev_challenge, LOWER_128_MASK)

                mstore(eta_three_challenge_loc, eta_three)

                // Generate Beta and Gamma Chalenges
                mcopy(0x20, lookup_read_counts_x0_loc, 0x180)

                prev_challenge := mod(keccak256(0x00, 0x1a0), p)
                mstore(0x00, prev_challenge)
                let beta, gamma := splitChallenge(prev_challenge)

                log2(0x00, 0x00, beta, gamma)

                mstore(beta_challenge_loc, beta)
                mstore(gamma_challenge_loc, gamma)

                // Generate Alpha challenges - non-linearise the gate contributions
                mcopy(0x20, lookup_inverses_x0_loc, 0x100)

                prev_challenge := mod(keccak256(0x00, 0x120), p)
                mstore(0x00, prev_challenge)
                let alphas_0, alphas_1 := splitChallenge(prev_challenge)

                let i := 1
                // TODO: if we can afford bytecode size - unroll this
                // For number of alphas / 2 ( 25 /2 )
                for {} lt(i, 12) {i := add(i, 1)} {
                    prev_challenge := mod(keccak256(0x00, 0x20), p)
                    mstore(0x00, prev_challenge)

                    let alpha_even, alpha_odd := splitChallenge(prev_challenge)

                    let alpha_off_set := add(alpha_challenge_0_loc, mul(i, 0x40))
                    mstore(alpha_off_set, alpha_even)
                    mstore(add(alpha_off_set, 0x20), alpha_odd)
                }
                // The final alpha challenge
                prev_challenge := mod(keccak256(0x00, 0x20), p)
                mstore(0x00, prev_challenge)

                let alpha_24 := and(prev_challenge, LOWER_128_MASK)
                mstore(alpha_challenge_24_loc, alpha_24)



                // GENERATE GATE Challenges
                i := 0
                for {} lt(i, CONST_PROOF_SIZE_LOG_N) {} {
                    prev_challenge := mod(keccak256(0x00, 0x20), p)
                    mstore(0x00, prev_challenge)
                    let gate_off := add(gate_challenge_0_loc, mul(0x20, i))
                    let gate_challenge := and(prev_challenge, LOWER_128_MASK)

                    mstore(gate_off, gate_challenge)

                    i := add(i, 1)
                }

                // TODO: I think that the order of the values taken from the univariates is wrong
                // it should be [proof_size, batched length]
                // rather than as written above [batched_size]{proof_size}
                // Total nuber of iterations is 28 , with 8 for each univariate
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

                    let write_off := add(sum_u_challenge_0_loc, mul(i, 0x20))
                    mstore(write_off, sumcheck_u_challenge)

                    i := add(i, 1)
                }

                // Generate Rho Challenge
                // Hash all of the sumcheck evaluations
                // Number of bytes to copy = 0x20 * NUMBER_OF_ENTITIES (44) = 0x580
                mcopy(0x20, eval_Q_M_loc, 0x580)
                prev_challenge := mod(keccak256(0x00, 0x5a0), p)
                mstore(0x00, prev_challenge)

                let rho := and(prev_challenge, LOWER_128_MASK)

                mstore(rho_challenge_loc, rho)


                // Generate ZMY Challenge
                // This is a hash of all of the zm cq's
                // Each cq is a proof g1 point (0x80 bytes) for log n of circuit size
                // 0x80 * 28 = 0xe00
                mcopy(0x20, zm_cqs_0_x0_loc, 0xe00)

                prev_challenge := mod(keccak256(0x00, 0xe20), p)
                mstore(0x00, prev_challenge)

                let zmY := and(prev_challenge, LOWER_128_MASK)

                mstore(zm_y_challenge_loc, zmY)

                // Generate zmX, zmZ Challenges
                mcopy(0x20, zm_cq_x0_loc, 0x80)
                prev_challenge := mod(keccak256(0x00, 0xa0), p)

                let zmX, zmZ := splitChallenge(prev_challenge)
                mstore(zm_x_challenge_loc, zmX)
                mstore(zm_z_challenge_loc, zmZ)

                // All challenges have been generated
            }

            // Generate public inputa delta
            // TODO: think about how to optimize this further
            {

                let beta := mload(beta_challenge_loc)
                let gamma := mload(gamma_challenge_loc)
                let domain_size := mload(proof_circuit_size_loc)
                // NOTE(md): compiler broken when offset is used in a variable name?
                let pub_off := mload(proof_pub_inputs_offset_loc)

                log4(0x00, 0x00, beta, gamma, domain_size, pub_off)

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
                let endpoint_ptr := add(public_inputs_ptr, mul(mload(proof_num_public_inputs_loc ), 0x20))

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
                    // TODO: custom errors
                    // mstore(0x00, PUBLIC_INPUT_GE_P_SELECTOR)
                    revert(0x00, 0x0)
                }

                mstore(PUBLIC_INPUTS_DELTA_NUMERATOR_LOC, numerator_value)
                mstore(PUBLIC_INPUTS_DELTA_DENOMINATOR_LOC , denominator_value)
            }


            // Sumcheck
            {
                // We write the barycentric domain values into memory
                // These are written once per program execution, and reused across all
                // sumcheck rounds
                // TODO: Optimisation: If we can write these into the program bytecode then
                // we could use a codecopy to load them into memory as a single slab, rather than
                // writing a series of individual values
                function writeBarycentricTables() {
                    // We write into hardcoded memory regions
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_LOC, 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_1_LOC, 0x00000000000000000000000000000000000000000000000000000000000002d0)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_2_LOC, 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff11)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_3_LOC, 0x0000000000000000000000000000000000000000000000000000000000000090)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_4_LOC, 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff71)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_5_LOC, 0x00000000000000000000000000000000000000000000000000000000000000f0)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_6_LOC, 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31)
                    mstore(BARYCENTRIC_LAGRANGE_DENOMINATORS_7_LOC, 0x00000000000000000000000000000000000000000000000000000000000013b0)

                    mstore(BARYCENTRIC_DOMAIN_LOC, 0x00)
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
                    let accumulator := mload(BARYCENTRIC_DENOMINATOR_INVERSES_LOC)

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
                            // TODO: custom error
                            mstore(0x0, 0x69696969)
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
                    mstore(BARYCENTRIC_DENOMINATOR_INVERSES_LOC, accumulator)
                }

                // Note: pass around p to keep it on the stack
                function computeNextTargetSum(round_univariates_ptr /*: uint256[] */, round_challenge /*: uint256 */, p_clone /*: uint256 */, /* TEMP */ round) -> next_target /*: uint256 */  {
                    // Next target sum, Barycentric evaluation at the given challenge point

                    // Compute B(x)
                    let i := 0
                    let numerator_value := 1
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        numerator_value := mulmod(numerator_value, addmod(round_challenge, sub(p_clone, i), p_clone), p_clone)
                        i := add(i, 1)
                    }
                    // NOTE: Correct

                    // Calculate domainInverses for barycentric evaluation
                    // TODO_OPT(md): could be unrolled
                    i := 0
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        let inv := mload(add(BARYCENTRIC_LAGRANGE_DENOMINATORS_LOC, mul(i, 0x20)))
                        let rc_minus_domain := addmod(round_challenge, sub(p_clone, mload(add(BARYCENTRIC_DOMAIN_LOC, mul(i, 0x20)))), p_clone)

                        inv := mulmod(inv, rc_minus_domain, p_clone)
                        mstore(add(BARYCENTRIC_DENOMINATOR_INVERSES_LOC, mul(i, 0x20)), inv)
                        i := add(i, 1)
                    }

                    batchInvertInplace(p_clone)

                    // Compute the next round target
                    // TODO( ): that means we are messing up in here
                    i := 0
                    for {} lt(i, BATCHED_RELATION_PARTIAL_LENGTH) {} {
                        let off := mul(i, 0x20)
                        let term := mload(add(round_univariates_ptr, off))
                        let inverse := mload(add(BARYCENTRIC_DENOMINATOR_INVERSES_LOC, off))

                        term := mulmod(term, inverse, p_clone)
                        next_target := addmod(next_target, term, p_clone)
                        i := add(i, 1)
                    }

                    next_target := mulmod(next_target, numerator_value, p_clone)
                }

                function partiallyEvaluatePOW(round_challenge /*: uint256 */, current_evaluation /*: uint256 */, round /*: uint256 */, p_clone /*: uint256 */) -> next_evaluation /*: uint256 */ {
                    let gate_challenge := mload(add(gate_challenge_0_loc, mul(round, 0x20)))
                    let gate_challenge_minus_one := sub(gate_challenge, 1)

                    let univariate_evaluation := addmod(1, mulmod(round_challenge, gate_challenge_minus_one, p_clone), p_clone)

                    next_evaluation := mulmod(current_evaluation, univariate_evaluation, p_clone)
                }

                writeBarycentricTables()

                let round := 0
                let valid := true
                let round_target := 0
                let pow_partial_evaluation := 1

                // TODO(md): update, but set at 2 for now
                for {} lt(round, 15) {} {
                    let round_univariates_off := add(sumcheck_univariate_0_0, mul(round, 0x100))
                    let challenge_off := add(sum_u_challenge_0_loc, mul(round, 0x20))

                    let round_challenge := mload(challenge_off)

                    // Total sum = u[0] + u[1]
                    let total_sum := addmod(mload(round_univariates_off), mload(add(round_univariates_off, 0x20)), p)
                    valid := and(valid, eq(total_sum, round_target))

                    round_target := computeNextTargetSum(round_univariates_off, round_challenge, p, round)
                    pow_partial_evaluation := partiallyEvaluatePOW(round_challenge, pow_partial_evaluation, round, p)

                    round := add(round, 1)
                }

                if iszero(valid) {
                    // TODO: custom error
                    revert(0x00, 0x00)
                }
            }


            mstore(0x00, 0x01)
            return(0x00, 0x20)
        }
    }
}

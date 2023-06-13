#pragma once
#include "barretenberg/common/throw_or_abort.hpp"

#include "types.hpp"
#include "sha256.hpp"
#include "aes128.hpp"
#include "sparse.hpp"
#include "pedersen.hpp"
#include "uint.hpp"
#include "non_native_group_generator.hpp"
#include "blake2s.hpp"
#include "keccak/keccak_chi.hpp"
#include "keccak/keccak_input.hpp"
#include "keccak/keccak_output.hpp"
#include "keccak/keccak_rho.hpp"
#include "keccak/keccak_theta.hpp"

namespace plookup {

const MultiTable& create_table(const MultiTableId id);

ReadData<barretenberg::fr> get_lookup_accumulators(const MultiTableId id,
                                                   const barretenberg::fr& key_a,
                                                   const barretenberg::fr& key_b = 0,
                                                   const bool is_2_to_1_map = false);

inline BasicTable create_basic_table(const BasicTableId id, const size_t index)
{
    switch (id) {
    case AES_SPARSE_MAP: {
        return sparse_tables::generate_sparse_table_with_rotation<9, 8, 0>(AES_SPARSE_MAP, index);
    }
    case AES_SBOX_MAP: {
        return aes128_tables::generate_aes_sbox_table(AES_SBOX_MAP, index);
    }
    case AES_SPARSE_NORMALIZE: {
        return aes128_tables::generate_aes_sparse_normalization_table(AES_SPARSE_NORMALIZE, index);
    }
    case SHA256_WITNESS_NORMALIZE: {
        return sha256_tables::generate_witness_extension_normalization_table(SHA256_WITNESS_NORMALIZE, index);
    }
    case SHA256_WITNESS_SLICE_3: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 3, 0>(SHA256_WITNESS_SLICE_3, index);
    }
    case SHA256_WITNESS_SLICE_7_ROTATE_4: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 7, 4>(SHA256_WITNESS_SLICE_7_ROTATE_4, index);
    }
    case SHA256_WITNESS_SLICE_8_ROTATE_7: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 8, 7>(SHA256_WITNESS_SLICE_8_ROTATE_7, index);
    }
    case SHA256_WITNESS_SLICE_14_ROTATE_1: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 14, 1>(SHA256_WITNESS_SLICE_14_ROTATE_1, index);
    }
    case SHA256_CH_NORMALIZE: {
        return sha256_tables::generate_choose_normalization_table(SHA256_CH_NORMALIZE, index);
    }
    case SHA256_MAJ_NORMALIZE: {
        return sha256_tables::generate_majority_normalization_table(SHA256_MAJ_NORMALIZE, index);
    }
    case SHA256_BASE28: {
        return sparse_tables::generate_sparse_table_with_rotation<28, 11, 0>(SHA256_BASE28, index);
    }
    case SHA256_BASE28_ROTATE6: {
        return sparse_tables::generate_sparse_table_with_rotation<28, 11, 6>(SHA256_BASE28_ROTATE6, index);
    }
    case SHA256_BASE28_ROTATE3: {
        return sparse_tables::generate_sparse_table_with_rotation<28, 11, 3>(SHA256_BASE28_ROTATE3, index);
    }
    case SHA256_BASE16: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 11, 0>(SHA256_BASE16, index);
    }
    case SHA256_BASE16_ROTATE2: {
        return sparse_tables::generate_sparse_table_with_rotation<16, 11, 2>(SHA256_BASE16_ROTATE2, index);
    }
    case UINT_XOR_ROTATE0: {
        return uint_tables::generate_xor_rotate_table<6, 0>(UINT_XOR_ROTATE0, index);
    }
    case UINT_AND_ROTATE0: {
        return uint_tables::generate_and_rotate_table<6, 0>(UINT_AND_ROTATE0, index);
    }
    case BN254_XLO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xlo_table(BN254_XLO_BASIC, index);
    }
    case BN254_XHI_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xhi_table(BN254_XHI_BASIC, index);
    }
    case BN254_YLO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_ylo_table(BN254_YLO_BASIC, index);
    }
    case BN254_YHI_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_yhi_table(BN254_YHI_BASIC, index);
    }
    case BN254_XYPRIME_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xyprime_table(BN254_XYPRIME_BASIC,
                                                                                                   index);
    }
    case BN254_XLO_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xlo_endo_table(
            BN254_XLO_ENDO_BASIC, index);
    }
    case BN254_XHI_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xhi_endo_table(
            BN254_XHI_ENDO_BASIC, index);
    }
    case BN254_XYPRIME_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<barretenberg::g1>::generate_xyprime_endo_table(
            BN254_XYPRIME_ENDO_BASIC, index);
    }
    case SECP256K1_XLO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xlo_table(SECP256K1_XLO_BASIC, index);
    }
    case SECP256K1_XHI_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xhi_table(SECP256K1_XHI_BASIC, index);
    }
    case SECP256K1_YLO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_ylo_table(SECP256K1_YLO_BASIC, index);
    }
    case SECP256K1_YHI_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_yhi_table(SECP256K1_YHI_BASIC, index);
    }
    case SECP256K1_XYPRIME_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xyprime_table(SECP256K1_XYPRIME_BASIC,
                                                                                                index);
    }
    case SECP256K1_XLO_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xlo_endo_table(
            SECP256K1_XLO_ENDO_BASIC, index);
    }
    case SECP256K1_XHI_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xhi_endo_table(
            SECP256K1_XHI_ENDO_BASIC, index);
    }
    case SECP256K1_XYPRIME_ENDO_BASIC: {
        return ecc_generator_tables::ecc_generator_table<secp256k1::g1>::generate_xyprime_endo_table(
            SECP256K1_XYPRIME_ENDO_BASIC, index);
    }
    case BLAKE_XOR_ROTATE0: {
        return blake2s_tables::generate_xor_rotate_table<6, 0>(BLAKE_XOR_ROTATE0, index);
    }
    case BLAKE_XOR_ROTATE0_SLICE5_MOD4: {
        return blake2s_tables::generate_xor_rotate_table<5, 0, true>(BLAKE_XOR_ROTATE0_SLICE5_MOD4, index);
    }
    case BLAKE_XOR_ROTATE2: {
        return blake2s_tables::generate_xor_rotate_table<6, 2>(BLAKE_XOR_ROTATE2, index);
    }
    case BLAKE_XOR_ROTATE1: {
        return blake2s_tables::generate_xor_rotate_table<6, 1>(BLAKE_XOR_ROTATE1, index);
    }
    case BLAKE_XOR_ROTATE4: {
        return blake2s_tables::generate_xor_rotate_table<6, 4>(BLAKE_XOR_ROTATE4, index);
    }
    case PEDERSEN_0: {
        return pedersen_tables::basic::generate_basic_pedersen_table<0>(PEDERSEN_0, index);
    }
    case PEDERSEN_1: {
        return pedersen_tables::basic::generate_basic_pedersen_table<1>(PEDERSEN_1, index);
    }
    case PEDERSEN_2: {
        return pedersen_tables::basic::generate_basic_pedersen_table<2>(PEDERSEN_2, index);
    }
    case PEDERSEN_3: {
        return pedersen_tables::basic::generate_basic_pedersen_table<3>(PEDERSEN_3, index);
    }
    case PEDERSEN_4: {
        return pedersen_tables::basic::generate_basic_pedersen_table<4>(PEDERSEN_4, index);
    }
    case PEDERSEN_5: {
        return pedersen_tables::basic::generate_basic_pedersen_table<5>(PEDERSEN_5, index);
    }
    case PEDERSEN_6: {
        return pedersen_tables::basic::generate_basic_pedersen_table<6>(PEDERSEN_6, index);
    }
    case PEDERSEN_7: {
        return pedersen_tables::basic::generate_basic_pedersen_table<7>(PEDERSEN_7, index);
    }
    case PEDERSEN_8: {
        return pedersen_tables::basic::generate_basic_pedersen_table<8>(PEDERSEN_8, index);
    }
    case PEDERSEN_9: {
        return pedersen_tables::basic::generate_basic_pedersen_table<9>(PEDERSEN_9, index);
    }
    case PEDERSEN_10: {
        return pedersen_tables::basic::generate_basic_pedersen_table<10>(PEDERSEN_10, index);
    }
    case PEDERSEN_11: {
        return pedersen_tables::basic::generate_basic_pedersen_table<11>(PEDERSEN_11, index);
    }
    case PEDERSEN_12: {
        return pedersen_tables::basic::generate_basic_pedersen_table<12>(PEDERSEN_12, index);
    }
    case PEDERSEN_13: {
        return pedersen_tables::basic::generate_basic_pedersen_table<13>(PEDERSEN_13, index);
    }
    case PEDERSEN_14_SMALL: {
        return pedersen_tables::basic::generate_basic_pedersen_table<14, true>(PEDERSEN_14_SMALL, index);
    }
    case PEDERSEN_15: {
        return pedersen_tables::basic::generate_basic_pedersen_table<15>(PEDERSEN_15, index);
    }
    case PEDERSEN_16: {
        return pedersen_tables::basic::generate_basic_pedersen_table<16>(PEDERSEN_16, index);
    }
    case PEDERSEN_17: {
        return pedersen_tables::basic::generate_basic_pedersen_table<17>(PEDERSEN_17, index);
    }
    case PEDERSEN_18: {
        return pedersen_tables::basic::generate_basic_pedersen_table<18>(PEDERSEN_18, index);
    }
    case PEDERSEN_19: {
        return pedersen_tables::basic::generate_basic_pedersen_table<19>(PEDERSEN_19, index);
    }
    case PEDERSEN_20: {
        return pedersen_tables::basic::generate_basic_pedersen_table<20>(PEDERSEN_20, index);
    }
    case PEDERSEN_21: {
        return pedersen_tables::basic::generate_basic_pedersen_table<21>(PEDERSEN_21, index);
    }
    case PEDERSEN_22: {
        return pedersen_tables::basic::generate_basic_pedersen_table<22>(PEDERSEN_22, index);
    }
    case PEDERSEN_23: {
        return pedersen_tables::basic::generate_basic_pedersen_table<23>(PEDERSEN_23, index);
    }
    case PEDERSEN_24: {
        return pedersen_tables::basic::generate_basic_pedersen_table<24>(PEDERSEN_24, index);
    }
    case PEDERSEN_25: {
        return pedersen_tables::basic::generate_basic_pedersen_table<25>(PEDERSEN_25, index);
    }
    case PEDERSEN_26: {
        return pedersen_tables::basic::generate_basic_pedersen_table<26>(PEDERSEN_26, index);
    }
    case PEDERSEN_27: {
        return pedersen_tables::basic::generate_basic_pedersen_table<27>(PEDERSEN_27, index);
    }
    case PEDERSEN_28: {
        return pedersen_tables::basic::generate_basic_pedersen_table<28>(PEDERSEN_28, index);
    }
    case PEDERSEN_29_SMALL: {
        return pedersen_tables::basic::generate_basic_pedersen_table<29, true>(PEDERSEN_29_SMALL, index);
    }
    case PEDERSEN_IV_BASE: {
        return pedersen_tables::basic::generate_pedersen_iv_table(PEDERSEN_IV_BASE);
    }
    case KECCAK_INPUT: {
        return keccak_tables::KeccakInput::generate_keccak_input_table(KECCAK_INPUT, index);
    }
    case KECCAK_THETA: {
        return keccak_tables::Theta::generate_theta_renormalization_table(KECCAK_THETA, index);
    }
    case KECCAK_CHI: {
        return keccak_tables::Chi::generate_chi_renormalization_table(KECCAK_CHI, index);
    }
    case KECCAK_OUTPUT: {
        return keccak_tables::KeccakOutput::generate_keccak_output_table(KECCAK_OUTPUT, index);
    }
    case KECCAK_RHO_1: {
        return keccak_tables::Rho<1>::generate_rho_renormalization_table(KECCAK_RHO_1, index);
    }
    case KECCAK_RHO_2: {
        return keccak_tables::Rho<2>::generate_rho_renormalization_table(KECCAK_RHO_2, index);
    }
    case KECCAK_RHO_3: {
        return keccak_tables::Rho<3>::generate_rho_renormalization_table(KECCAK_RHO_3, index);
    }
    case KECCAK_RHO_4: {
        return keccak_tables::Rho<4>::generate_rho_renormalization_table(KECCAK_RHO_4, index);
    }
    case KECCAK_RHO_5: {
        return keccak_tables::Rho<5>::generate_rho_renormalization_table(KECCAK_RHO_5, index);
    }
    case KECCAK_RHO_6: {
        return keccak_tables::Rho<6>::generate_rho_renormalization_table(KECCAK_RHO_6, index);
    }
    case KECCAK_RHO_7: {
        return keccak_tables::Rho<7>::generate_rho_renormalization_table(KECCAK_RHO_7, index);
    }
    case KECCAK_RHO_8: {
        return keccak_tables::Rho<8>::generate_rho_renormalization_table(KECCAK_RHO_8, index);
    }
    default: {
        throw_or_abort("table id does not exist");
        return sparse_tables::generate_sparse_table_with_rotation<9, 8, 0>(AES_SPARSE_MAP, index);
    }
    }
}
} // namespace plookup

// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <cstdint>
#include <iomanip>
#include <ostream>

#include "../../fields/field.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)

namespace bb {

/**
 * @brief Parameters defining the scalar field of the BN254 curve.
 *
 * @details When split into 4 64-bit words, the parameters are represented in little-endian, i.e. the least significant
 * bit comes first. For example, to recover the modulus from the 64-bit words we concatenate its limbs to obtain:
 *           0x30644E72E131A029B85045B68181585D2833E84879B9709143E1F593F0000001
 *
 * @note These parameters can be extracted by running the script parameter_helper.py in ecc/fields
 */
class Bn254FrParams {
  public:
    // A little-endian representation of the modulus split into 4 64-bit words
    static constexpr uint64_t modulus_0 = 0x43E1F593F0000001UL;
    static constexpr uint64_t modulus_1 = 0x2833E84879B97091UL;
    static constexpr uint64_t modulus_2 = 0xB85045B68181585DUL;
    static constexpr uint64_t modulus_3 = 0x30644E72E131A029UL;

    // A little-endian representation of R^2 modulo the modulus (R=2^256 mod modulus) split into 4 64-bit words
    static constexpr uint64_t r_squared_0 = 0x1BB8E645AE216DA7UL;
    static constexpr uint64_t r_squared_1 = 0x53FE3AB1E35C59E3UL;
    static constexpr uint64_t r_squared_2 = 0x8C49833D53BB8085UL;
    static constexpr uint64_t r_squared_3 = 0x216D0B17F4E44A5UL;

    // -(Modulus^-1) mod 2^64
    // This constant is used during multiplication: given an 8-limb representation of the multiplication of two field
    // elements, for each of the lowest four limbs we compute: k_i = r_inv * limb_i and we add 2^{64 * i} * k_i * p to
    // the result of the multiplication. In this way we zero out the lowest four limbs of the multiplication and we can
    // divide by 2^256 by taking the highest four limbs. See field_docs.hpp for more details.
    static constexpr uint64_t r_inv = 0xc2e1f593efffffffUL;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x2d3e8053e396ee4dUL;
    static constexpr uint64_t r_inv_1 = 0xca478dbeab3c92cdUL;
    static constexpr uint64_t r_inv_2 = 0xb2d8f06f77f52a93UL;
    static constexpr uint64_t r_inv_3 = 0x24d6ba07f7aa8f04UL;

    // A little-endian representation of the cubic root of 1 in Fr in Montgomery form split into 4 64-bit words
    static constexpr uint64_t cube_root_0 = 0x93e7cede4a0329b3UL;
    static constexpr uint64_t cube_root_1 = 0x7d4fdca77a96c167UL;
    static constexpr uint64_t cube_root_2 = 0x8be4ba08b19a750aUL;
    static constexpr uint64_t cube_root_3 = 0x1cbd5653a5661c25UL;

    // A little-endian representation of the primitive root of 1 in Fr split into 4 64-bit words in Montgomery form
    // (R=2^256 mod modulus). This is a root of unity in a large power of 2 (order 28) subgroup of Fr.
    static constexpr uint64_t primitive_root_0 = 0x636e735580d13d9cUL;
    static constexpr uint64_t primitive_root_1 = 0xa22bf3742445ffd6UL;
    static constexpr uint64_t primitive_root_2 = 0x56452ac01eb203d8UL;
    static constexpr uint64_t primitive_root_3 = 0x1860ef942963f9e7UL;

    // Coset generators in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generator_0 = 0x5eef048d8fffffe7ULL;
    static constexpr uint64_t coset_generator_1 = 0x12ee50ec1ce401d0ULL;
    static constexpr uint64_t coset_generator_2 = 0x29312d5a5e5ee7ULL;
    static constexpr uint64_t coset_generator_3 = 0x463456c802275bedULL;

    // A little-endian representation of the modulus split into 9 29-bit limbs
    // This is used in wasm because we can only do multiplication with 64-bit result instead of 128-bit like in x86_64
    static constexpr uint64_t modulus_wasm_0 = 0x10000001;
    static constexpr uint64_t modulus_wasm_1 = 0x1f0fac9f;
    static constexpr uint64_t modulus_wasm_2 = 0xe5c2450;
    static constexpr uint64_t modulus_wasm_3 = 0x7d090f3;
    static constexpr uint64_t modulus_wasm_4 = 0x1585d283;
    static constexpr uint64_t modulus_wasm_5 = 0x2db40c0;
    static constexpr uint64_t modulus_wasm_6 = 0xa6e141;
    static constexpr uint64_t modulus_wasm_7 = 0xe5c2634;
    static constexpr uint64_t modulus_wasm_8 = 0x30644e;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 10 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_wasm_0 = 0x18f05361;
    static constexpr uint64_t r_inv_wasm_1 = 0x12bb1fe;
    static constexpr uint64_t r_inv_wasm_2 = 0xf5d8135;
    static constexpr uint64_t r_inv_wasm_3 = 0x1e6275f6;
    static constexpr uint64_t r_inv_wasm_4 = 0x7e7a880;
    static constexpr uint64_t r_inv_wasm_5 = 0x10c6bf1f;
    static constexpr uint64_t r_inv_wasm_6 = 0x11f74a6c;
    static constexpr uint64_t r_inv_wasm_7 = 0x6fdaecb;
    static constexpr uint64_t r_inv_wasm_8 = 0x183227;

    // Parameters used for quickly splitting a scalar into two endomorphism scalars for faster scalar multiplication
    // For specifics on how these have been derived, see ecc/fields/endomorphim_scalars.py
    static constexpr uint64_t endo_g1_lo = 0x7a7bd9d4391eb18dUL;
    static constexpr uint64_t endo_g1_mid = 0x4ccef014a773d2cfUL;
    static constexpr uint64_t endo_g1_hi = 0x0000000000000002UL;
    static constexpr uint64_t endo_g2_lo = 0xd91d232ec7e0b3d7UL;
    static constexpr uint64_t endo_g2_mid = 0x0000000000000002UL;
    static constexpr uint64_t endo_minus_b1_lo = 0x8211bbeb7d4f1128UL;
    static constexpr uint64_t endo_minus_b1_mid = 0x6f4d8248eeb859fcUL;
    static constexpr uint64_t endo_b2_lo = 0x89d3256894d213e3UL;
    static constexpr uint64_t endo_b2_mid = 0UL;

    // used in msgpack schema serialization
    static constexpr char schema_name[] = "fr";
    static constexpr bool has_high_2adicity = true;

    // This is a BN254 scalar, so it represents one BN254 scalar
    static constexpr size_t NUM_BN254_SCALARS = 1;
    static constexpr size_t MAX_BITS_PER_ENDOMORPHISM_SCALAR = 128;

    // A point in Fr is represented with 1 public input
    static constexpr size_t PUBLIC_INPUTS_SIZE = FR_PUBLIC_INPUTS_SIZE;
};

using fr = field<Bn254FrParams>;

template <> template <> inline fr fr::reconstruct_from_public(const std::span<const fr, PUBLIC_INPUTS_SIZE>& limbs)
{
    return fr(limbs[0]);
}

} // namespace bb

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)

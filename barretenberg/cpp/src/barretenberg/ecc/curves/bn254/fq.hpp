// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <cstdint>
#include <iomanip>

#include "../../fields/field.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)
namespace bb {

/**
 * @brief Parameters defining the base field of the BN254 curve.
 *
 * @details When split into 4 64-bit words, the parameters are represented in little-endian, i.e. the least significant
 * bit comes first. For example, to recover the modulus from the 64-bit words we concatenate its limbs to obtain:
 *           0x30644e72e131a029b85045b68181585d97816a916871ca8d3C208C16D87CFD47
 *
 * @note These parameters can be extracted by running the script parameter_helper.py in ecc/fields
 */
class Bn254FqParams {
  public:
    // A little-endian representation of the modulus split into 4 64-bit words
    static constexpr uint64_t modulus_0 = 0x3C208C16D87CFD47UL;
    static constexpr uint64_t modulus_1 = 0x97816a916871ca8dUL;
    static constexpr uint64_t modulus_2 = 0xb85045b68181585dUL;
    static constexpr uint64_t modulus_3 = 0x30644e72e131a029UL;

    // A little-endian representation of R^2 modulo the modulus (R=2^256 mod modulus) split into 4 64-bit words
    // This parameter is used to convert an element of Fq in standard form to Montgomery form
    static constexpr uint64_t r_squared_0 = 0xF32CFC5B538AFA89UL;
    static constexpr uint64_t r_squared_1 = 0xB5E71911D44501FBUL;
    static constexpr uint64_t r_squared_2 = 0x47AB1EFF0A417FF6UL;
    static constexpr uint64_t r_squared_3 = 0x06D89F71CAB8351FUL;

    // -(Modulus^-1) mod 2^64
    // This constant is used during multiplication: given an 8-limb representation of the multiplication of two field
    // elements, for each of the lowest four limbs we compute: k_i = r_inv * limb_i and we add 2^{64 * i} * k_i * p to
    // the result of the multiplication. In this way we zero out the lowest four limbs of the multiplication and we can
    // divide by 2^256 by taking the highest four limbs. See field_docs.hpp for more details.
    static constexpr uint64_t r_inv = 0x87d20782e4866389UL;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x327d7c1b18f7bd41UL;
    static constexpr uint64_t r_inv_1 = 0xdb8ed52f824ed32fUL;
    static constexpr uint64_t r_inv_2 = 0x29b67b05eb29a6a1UL;
    static constexpr uint64_t r_inv_3 = 0x19ac99126b459ddaUL;

    // A little-endian representation of the cube root of 1 in Fq in Montgomery form split into 4 64-bit words
    static constexpr uint64_t cube_root_0 = 0x71930c11d782e155UL;
    static constexpr uint64_t cube_root_1 = 0xa6bb947cffbe3323UL;
    static constexpr uint64_t cube_root_2 = 0xaa303344d4741444UL;
    static constexpr uint64_t cube_root_3 = 0x2c3b3f0d26594943UL;

    // Not used for Fq, but required for all field types
    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;

    // Coset generators in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generator_0 = 0x7a17caa950ad28d7ULL;
    static constexpr uint64_t coset_generator_1 = 0x1f6ac17ae15521b9ULL;
    static constexpr uint64_t coset_generator_2 = 0x334bea4e696bd284ULL;
    static constexpr uint64_t coset_generator_3 = 0x2a1f6744ce179d8eULL;

    // A little-endian representation of the modulus split into 9 29-bit limbs
    // This is used in wasm because we can only do multiplication with 64-bit result instead of 128-bit like in x86_64
    static constexpr uint64_t modulus_wasm_0 = 0x187cfd47;
    static constexpr uint64_t modulus_wasm_1 = 0x10460b6;
    static constexpr uint64_t modulus_wasm_2 = 0x1c72a34f;
    static constexpr uint64_t modulus_wasm_3 = 0x2d522d0;
    static constexpr uint64_t modulus_wasm_4 = 0x1585d978;
    static constexpr uint64_t modulus_wasm_5 = 0x2db40c0;
    static constexpr uint64_t modulus_wasm_6 = 0xa6e141;
    static constexpr uint64_t modulus_wasm_7 = 0xe5c2634;
    static constexpr uint64_t modulus_wasm_8 = 0x30644e;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 10 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_wasm_0 = 0x17789a9f;
    static constexpr uint64_t r_inv_wasm_1 = 0x5ffc3dc;
    static constexpr uint64_t r_inv_wasm_2 = 0xd6bde42;
    static constexpr uint64_t r_inv_wasm_3 = 0x1cf152e3;
    static constexpr uint64_t r_inv_wasm_4 = 0x18eb055f;
    static constexpr uint64_t r_inv_wasm_5 = 0xed815e2;
    static constexpr uint64_t r_inv_wasm_6 = 0x16626d2;
    static constexpr uint64_t r_inv_wasm_7 = 0xb8bab0f;
    static constexpr uint64_t r_inv_wasm_8 = 0x6d7c4;

    // Parameters used for quickly splitting a scalar into two endomorphism scalars for faster scalar multiplication
    // For specifics on how these have been derived, see ecc/fields/endomorphim_scalars.py
    static constexpr uint64_t endo_g1_lo = 0x7a7bd9d4391eb18d;
    static constexpr uint64_t endo_g1_mid = 0x4ccef014a773d2cfUL;
    static constexpr uint64_t endo_g1_hi = 0x0000000000000002UL;
    static constexpr uint64_t endo_g2_lo = 0xd91d232ec7e0b3d2UL;
    static constexpr uint64_t endo_g2_mid = 0x0000000000000002UL;
    static constexpr uint64_t endo_minus_b1_lo = 0x8211bbeb7d4f1129UL;
    static constexpr uint64_t endo_minus_b1_mid = 0x6f4d8248eeb859fcUL;
    static constexpr uint64_t endo_b2_lo = 0x89d3256894d213e2UL;
    static constexpr uint64_t endo_b2_mid = 0UL;

    // used in msgpack schema serialization
    static constexpr char schema_name[] = "fq";
    static constexpr bool has_high_2adicity = false;

    // The modulus is larger than BN254 scalar field modulus, so it maps to two BN254 scalars
    static constexpr size_t NUM_BN254_SCALARS = 2;
    static constexpr size_t MAX_BITS_PER_ENDOMORPHISM_SCALAR = 128;

    // A point in Fq is represented using 2 field elements in the public inputs (matching Codec)
    static constexpr size_t PUBLIC_INPUTS_SIZE = BIGFIELD_PUBLIC_INPUTS_SIZE;
};

using fq = field<Bn254FqParams>;

} // namespace bb

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)

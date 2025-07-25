// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <cstdint>
#include <iomanip>

#include "../../fields/field.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)
namespace bb {

// A point in Fq is represented with 4 public inputs
static constexpr size_t FQ_PUBLIC_INPUT_SIZE = 4;

class Bn254FqParams {
    // There is a helper script in ecc/fields/parameter_helper.py that can be used to extract these parameters from the
    // source code
  public:
    // A little-endian representation of the modulus split into 4 64-bit words
    static constexpr uint64_t modulus_0 = 0x3C208C16D87CFD47UL;
    static constexpr uint64_t modulus_1 = 0x97816a916871ca8dUL;
    static constexpr uint64_t modulus_2 = 0xb85045b68181585dUL;
    static constexpr uint64_t modulus_3 = 0x30644e72e131a029UL;

    // A little-endian representation of R^2 modulo the modulus (R=2^256 mod modulus) split into 4 64-bit words
    // This paremeter is used to convert an element of Fq in standard from to Montgomery form
    static constexpr uint64_t r_squared_0 = 0xF32CFC5B538AFA89UL;
    static constexpr uint64_t r_squared_1 = 0xB5E71911D44501FBUL;
    static constexpr uint64_t r_squared_2 = 0x47AB1EFF0A417FF6UL;
    static constexpr uint64_t r_squared_3 = 0x06D89F71CAB8351FUL;

    // A little-endian representation of the cube root of 1 in Fq in Montgomery form split into 4 64-bit words
    static constexpr uint64_t cube_root_0 = 0x71930c11d782e155UL;
    static constexpr uint64_t cube_root_1 = 0xa6bb947cffbe3323UL;
    static constexpr uint64_t cube_root_2 = 0xaa303344d4741444UL;
    static constexpr uint64_t cube_root_3 = 0x2c3b3f0d26594943UL;

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

    // A little-endian representation of R^2 modulo the modulus (R=2^261 mod modulus) split into 4 64-bit words
    // We use 2^261 in wasm, because 261=29*9, the 9 29-bit limbs used for arithmetic in
    static constexpr uint64_t r_squared_wasm_0 = 0xe1a2a074659bac10UL;
    static constexpr uint64_t r_squared_wasm_1 = 0x639855865406005aUL;
    static constexpr uint64_t r_squared_wasm_2 = 0xff54c5802d3e2632UL;
    static constexpr uint64_t r_squared_wasm_3 = 0x2a11a68c34ea65a6UL;

    // A little-endian representation of the cube root of 1 in Fq in Montgomery form for wasm (R=2^261 mod modulus)
    // split into 4 64-bit words
    static constexpr uint64_t cube_root_wasm_0 = 0x62b1a3a46a337995UL;
    static constexpr uint64_t cube_root_wasm_1 = 0xadc97d2722e2726eUL;
    static constexpr uint64_t cube_root_wasm_2 = 0x64ee82ede2db85faUL;
    static constexpr uint64_t cube_root_wasm_3 = 0x0c0afea1488a03bbUL;

    // Not used for Fq, but required for all field types
    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;

    // Not used for Fq, but required for all field types
    static constexpr uint64_t primitive_root_wasm_0 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_1 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_2 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_3 = 0x0000000000000000UL;

    // Parameters used for quickly splitting a scalar into two endomorphism scalars for faster scalar multiplication
    // For specifics on how these have been derived, ask @zac-williamson
    static constexpr uint64_t endo_g1_lo = 0x7a7bd9d4391eb18d;
    static constexpr uint64_t endo_g1_mid = 0x4ccef014a773d2cfUL;
    static constexpr uint64_t endo_g1_hi = 0x0000000000000002UL;
    static constexpr uint64_t endo_g2_lo = 0xd91d232ec7e0b3d2UL;
    static constexpr uint64_t endo_g2_mid = 0x0000000000000002UL;
    static constexpr uint64_t endo_minus_b1_lo = 0x8211bbeb7d4f1129UL;
    static constexpr uint64_t endo_minus_b1_mid = 0x6f4d8248eeb859fcUL;
    static constexpr uint64_t endo_b2_lo = 0x89d3256894d213e2UL;
    static constexpr uint64_t endo_b2_mid = 0UL;

    // -(Modulus^-1) mod 2^64
    // This is used to compute k = r_inv * lower_limb(scalar), such that scalar + k*modulus in integers would have 0 in
    // the lowest limb By performing this sequentially for 4 limbs, we get an 8-limb representation of the scalar, where
    // the lowest 4 limbs are zeros. Then we can immediately divide by 2^256 by simply getting rid of the lowest 4 limbs
    static constexpr uint64_t r_inv = 0x87d20782e4866389UL;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism from https://hackmd.io/@Ingonyama/Barret-Montgomery
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x327d7c1b18f7bd41UL;
    static constexpr uint64_t r_inv_1 = 0xdb8ed52f824ed32fUL;
    static constexpr uint64_t r_inv_2 = 0x29b67b05eb29a6a1UL;
    static constexpr uint64_t r_inv_3 = 0x19ac99126b459ddaUL;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism from https://hackmd.io/@Ingonyama/Barret-Montgomery
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

    // Coset generators in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generators_0[8]{
        0x7a17caa950ad28d7ULL, 0x4d750e37163c3674ULL, 0x20d251c4dbcb4411ULL, 0xf42f9552a15a51aeULL,
        0x4f4bc0b2b5ef64bdULL, 0x22a904407b7e725aULL, 0xf60647ce410d7ff7ULL, 0xc9638b5c069c8d94ULL,
    };
    static constexpr uint64_t coset_generators_1[8]{
        0x1f6ac17ae15521b9ULL, 0x29e3aca3d71c2cf7ULL, 0x345c97cccce33835ULL, 0x3ed582f5c2aa4372ULL,
        0x1a4b98fbe78db996ULL, 0x24c48424dd54c4d4ULL, 0x2f3d6f4dd31bd011ULL, 0x39b65a76c8e2db4fULL,
    };
    static constexpr uint64_t coset_generators_2[8]{
        0x334bea4e696bd284ULL, 0x99ba8dbde1e518b0ULL, 0x29312d5a5e5edcULL,   0x6697d49cd2d7a508ULL,
        0x5c65ec9f484e3a79ULL, 0xc2d4900ec0c780a5ULL, 0x2943337e3940c6d1ULL, 0x8fb1d6edb1ba0cfdULL,
    };
    static constexpr uint64_t coset_generators_3[8]{
        0x2a1f6744ce179d8eULL, 0x3829df06681f7cbdULL, 0x463456c802275bedULL, 0x543ece899c2f3b1cULL,
        0x180a96573d3d9f8ULL,  0xf8b21270ddbb927ULL,  0x1d9598e8a7e39857ULL, 0x2ba010aa41eb7786ULL,
    };

    // Coset generators in Montgomery form for R=2^261 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generators_wasm_0[8] = { 0xeb8a8ec140766463ULL, 0xfded87957d76333dULL,
                                                             0x4c710c8092f2ff5eULL, 0x9af4916ba86fcb7fULL,
                                                             0xe9781656bdec97a0ULL, 0xfbdb0f2afaec667aULL,
                                                             0x4a5e94161069329bULL, 0x98e2190125e5febcULL };
    static constexpr uint64_t coset_generators_wasm_1[8] = { 0xf2b1f20626a3da49ULL, 0x56c12d76cb13587fULL,
                                                             0x5251d378d7f4a143ULL, 0x4de2797ae4d5ea06ULL,
                                                             0x49731f7cf1b732c9ULL, 0xad825aed9626b0ffULL,
                                                             0xa91300efa307f9c3ULL, 0xa4a3a6f1afe94286ULL };
    static constexpr uint64_t coset_generators_wasm_2[8] = { 0xf905ef8d84d5fea4ULL, 0x93b7a45b84f1507eULL,
                                                             0xe6b99ee0068dfab5ULL, 0x39bb9964882aa4ecULL,
                                                             0x8cbd93e909c74f23ULL, 0x276f48b709e2a0fcULL,
                                                             0x7a71433b8b7f4b33ULL, 0xcd733dc00d1bf56aULL };
    static constexpr uint64_t coset_generators_wasm_3[8] = { 0x2958a27c02b7cd5fULL, 0x06bc8a3277c371abULL,
                                                             0x1484c05bce00b620ULL, 0x224cf685243dfa96ULL,
                                                             0x30152cae7a7b3f0bULL, 0x0d791464ef86e357ULL,
                                                             0x1b414a8e45c427ccULL, 0x290980b79c016c41ULL };

    // used in msgpack schema serialization
    static constexpr char schema_name[] = "fq";
    static constexpr bool has_high_2adicity = false;

    // The modulus is larger than BN254 scalar field modulus, so it maps to two BN254 scalars
    static constexpr size_t NUM_BN254_SCALARS = 2;
    static constexpr size_t MAX_BITS_PER_ENDOMORPHISM_SCALAR = 128;
};

using fq = field<Bn254FqParams>;

template <> template <> inline fq fq::reconstruct_from_public(const std::span<const bb::fr>& limbs)
{
    // A point in Fq is represented with 4 public inputs
    BB_ASSERT_EQ(limbs.size(), FQ_PUBLIC_INPUT_SIZE, "Incorrect number of limbs");

    const uint256_t limb = static_cast<uint256_t>(limbs[0]) +
                           (static_cast<uint256_t>(limbs[1]) << bb::stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION) +
                           (static_cast<uint256_t>(limbs[2]) << (bb::stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 2)) +
                           (static_cast<uint256_t>(limbs[3]) << (bb::stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 3));

    return fq(limb);
}

} // namespace bb

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)

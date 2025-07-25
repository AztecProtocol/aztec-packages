// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <cstdint>
#include <iomanip>
#include <ostream>

#include "../../fields/field.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)

namespace bb {

// A point in Fr is represented with 1 public input
static constexpr size_t FR_PUBLIC_INPUTS_SIZE = 1;

class Bn254FrParams {
    // There is a helper script in ecc/fields/parameter_helper.py that can be used to extract these parameters from the
  public:
    // Note: limbs here are combined as concat(_3, _2, _1, _0)
    // E.g. this modulus forms the value:
    // 0x30644E72E131A029B85045B68181585D2833E84879B9709143E1F593F0000001
    // = 21888242871839275222246405745257275088548364400416034343698204186575808495617
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

    // A little-endian representation of the cubic root of 1 in Fr in Montgomery form split into 4 64-bit words
    static constexpr uint64_t cube_root_0 = 0x93e7cede4a0329b3UL;
    static constexpr uint64_t cube_root_1 = 0x7d4fdca77a96c167UL;
    static constexpr uint64_t cube_root_2 = 0x8be4ba08b19a750aUL;
    static constexpr uint64_t cube_root_3 = 0x1cbd5653a5661c25UL;

    // A little-endian representation of the primitive root of 1 Fr split into 4 64-bit words in Montgomery form
    // (R=2^256 mod modulus) This is a root of unity in a large power of 2 subgroup of Fr
    static constexpr uint64_t primitive_root_0 = 0x636e735580d13d9cUL;
    static constexpr uint64_t primitive_root_1 = 0xa22bf3742445ffd6UL;
    static constexpr uint64_t primitive_root_2 = 0x56452ac01eb203d8UL;
    static constexpr uint64_t primitive_root_3 = 0x1860ef942963f9e7UL;

    // Parameters used for quickly splitting a scalar into two endomorphism scalars for faster scalar multiplication
    // For specifics on how these have been derived, ask @zac-williamson
    static constexpr uint64_t endo_g1_lo = 0x7a7bd9d4391eb18dUL;
    static constexpr uint64_t endo_g1_mid = 0x4ccef014a773d2cfUL;
    static constexpr uint64_t endo_g1_hi = 0x0000000000000002UL;
    static constexpr uint64_t endo_g2_lo = 0xd91d232ec7e0b3d7UL;
    static constexpr uint64_t endo_g2_mid = 0x0000000000000002UL;
    static constexpr uint64_t endo_minus_b1_lo = 0x8211bbeb7d4f1128UL;
    static constexpr uint64_t endo_minus_b1_mid = 0x6f4d8248eeb859fcUL;
    static constexpr uint64_t endo_b2_lo = 0x89d3256894d213e3UL;
    static constexpr uint64_t endo_b2_mid = 0UL;

    // -(Modulus^-1) mod 2^64
    // This is used to compute k = r_inv * lower_limb(scalar), such that scalar + k*modulus in integers would have 0 in
    // the lowest limb By performing this sequentially for 4 limbs, we get an 8-limb representation of the scalar, where
    // the lowest 4 limbs are zeros. Then we can immediately divide by 2^256 by simply getting rid of the lowest 4 limbs
    static constexpr uint64_t r_inv = 0xc2e1f593efffffffUL;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism from https://hackmd.io/@Ingonyama/Barret-Montgomery
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x2d3e8053e396ee4dUL;
    static constexpr uint64_t r_inv_1 = 0xca478dbeab3c92cdUL;
    static constexpr uint64_t r_inv_2 = 0xb2d8f06f77f52a93UL;
    static constexpr uint64_t r_inv_3 = 0x24d6ba07f7aa8f04UL;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism from https://hackmd.io/@Ingonyama/Barret-Montgomery
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

    // Coset generators in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generators_0[8]{
        0x5eef048d8fffffe7ULL, 0xb8538a9dfffffe2ULL,  0x3057819e4fffffdbULL, 0xdcedb5ba9fffffd6ULL,
        0x8983e9d6efffffd1ULL, 0x361a1df33fffffccULL, 0xe2b0520f8fffffc7ULL, 0x8f46862bdfffffc2ULL,
    };
    static constexpr uint64_t coset_generators_1[8]{
        0x12ee50ec1ce401d0ULL, 0x49eac781bc44cefaULL, 0x307f6d866832bb01ULL, 0x677be41c0793882aULL,
        0x9e785ab1a6f45554ULL, 0xd574d1474655227eULL, 0xc7147dce5b5efa7ULL,  0x436dbe728516bcd1ULL,
    };
    static constexpr uint64_t coset_generators_2[8]{
        0x29312d5a5e5ee7ULL,   0x6697d49cd2d7a515ULL, 0x5c65ec9f484e3a89ULL, 0xc2d4900ec0c780b7ULL,
        0x2943337e3940c6e5ULL, 0x8fb1d6edb1ba0d13ULL, 0xf6207a5d2a335342ULL, 0x5c8f1dcca2ac9970ULL,
    };
    static constexpr uint64_t coset_generators_3[8]{
        0x463456c802275bedULL, 0x543ece899c2f3b1cULL, 0x180a96573d3d9f8ULL,  0xf8b21270ddbb927ULL,
        0x1d9598e8a7e39857ULL, 0x2ba010aa41eb7786ULL, 0x39aa886bdbf356b5ULL, 0x47b5002d75fb35e5ULL,
    };

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

    // A little-endian representation of R^2 modulo the modulus (R=2^261 mod modulus) split into 4 64-bit words
    // We use 2^261 in wasm, because 261=29*9, the 9 29-bit limbs used for arithmetic in
    static constexpr uint64_t r_squared_wasm_0 = 0x38c2e14b45b69bd4UL;
    static constexpr uint64_t r_squared_wasm_1 = 0x0ffedb1885883377UL;
    static constexpr uint64_t r_squared_wasm_2 = 0x7840f9f0abc6e54dUL;
    static constexpr uint64_t r_squared_wasm_3 = 0x0a054a3e848b0f05UL;

    // A little-endian representation of the cubic root of 1 in Fr in Montgomery form for wasm (R=2^261 mod modulus)
    // split into 4 64-bit words
    static constexpr uint64_t cube_root_wasm_0 = 0x7334a1ce7065364dUL;
    static constexpr uint64_t cube_root_wasm_1 = 0xae21578e4a14d22aUL;
    static constexpr uint64_t cube_root_wasm_2 = 0xcea2148a96b51265UL;
    static constexpr uint64_t cube_root_wasm_3 = 0x0038f7edf614a198UL;

    // A little-endian representation of the primitive root of 1 Fr in Montgomery form for wasm (R=2^261 mod modulus)
    // split into 4 64-bit words
    static constexpr uint64_t primitive_root_wasm_0 = 0x2faf11711a27b370UL;
    static constexpr uint64_t primitive_root_wasm_1 = 0xc23fe9fced28f1b8UL;
    static constexpr uint64_t primitive_root_wasm_2 = 0x43a0fc9bbe2af541UL;
    static constexpr uint64_t primitive_root_wasm_3 = 0x05d90b5719653a4fUL;

    // Coset generators in Montgomery form for R=2^261 mod Modulus. Used in FFT-based proving systems
    static constexpr uint64_t coset_generators_wasm_0[8] = { 0xab46711cdffffcb2ULL, 0xdb1b52736ffffc09ULL,
                                                             0x0af033c9fffffb60ULL, 0xf6e31f8c9ffffab6ULL,
                                                             0x26b800e32ffffa0dULL, 0x568ce239bffff964ULL,
                                                             0x427fcdfc5ffff8baULL, 0x7254af52effff811ULL };
    static constexpr uint64_t coset_generators_wasm_1[8] = { 0x2476607dbd2dfff1ULL, 0x9a3208a561c2b00bULL,
                                                             0x0fedb0cd06576026ULL, 0x5d7570ac31329faeULL,
                                                             0xd33118d3d5c74fc9ULL, 0x48ecc0fb7a5bffe3ULL,
                                                             0x967480daa5373f6cULL, 0x0c30290249cbef86ULL };
    static constexpr uint64_t coset_generators_wasm_2[8] = { 0xe6b99ee0068dfc25ULL, 0x39bb9964882aa6a5ULL,
                                                             0x8cbd93e909c75126ULL, 0x276f48b709e2a349ULL,
                                                             0x7a71433b8b7f4dc9ULL, 0xcd733dc00d1bf84aULL,
                                                             0x6824f28e0d374a6dULL, 0xbb26ed128ed3f4eeULL };
    static constexpr uint64_t coset_generators_wasm_3[8] = { 0x1484c05bce00b620ULL, 0x224cf685243dfa96ULL,
                                                             0x30152cae7a7b3f0bULL, 0x0d791464ef86e357ULL,
                                                             0x1b414a8e45c427ccULL, 0x290980b79c016c41ULL,
                                                             0x066d686e110d108dULL, 0x14359e97674a5502ULL };

    // used in msgpack schema serialization
    static constexpr char schema_name[] = "fr";
    static constexpr bool has_high_2adicity = true;

    // This is a BN254 scalar, so it represents one BN254 scalar
    static constexpr size_t NUM_BN254_SCALARS = 1;
    static constexpr size_t MAX_BITS_PER_ENDOMORPHISM_SCALAR = 128;
};

using fr = field<Bn254FrParams>;

template <> template <> inline fr fr::reconstruct_from_public(const std::span<const fr>& limbs)
{

    BB_ASSERT_EQ(limbs.size(), FR_PUBLIC_INPUTS_SIZE, "Incorrect number of limbs");

    return fr(limbs[0]);
}

} // namespace bb

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)

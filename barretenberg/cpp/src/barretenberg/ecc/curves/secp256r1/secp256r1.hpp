// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../../fields/field.hpp"
#include "../../groups/group.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)
namespace bb::secp256r1 {

/**
 * @brief Parameters defining the base field of the secp256r1 curve.
 *
 * @details When split into 4 64-bit words, the parameters are represented in little-endian, i.e. the least significant
 * bit comes first. For example, to recover the modulus from the 64-bit words we concatenate its limbs to obtain:
 *           0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
 *
 * @note These parameters can be extracted by running the script parameter_helper.py in ecc/fields
 */
struct FqParams {
    static constexpr const char* schema_name = "secp256r1_fq";

    // A little-endian representation of the modulus split into 4 64-bit words
    static constexpr uint64_t modulus_0 = 0xFFFFFFFFFFFFFFFFULL;
    static constexpr uint64_t modulus_1 = 0x00000000FFFFFFFFULL;
    static constexpr uint64_t modulus_2 = 0x0000000000000000ULL;
    static constexpr uint64_t modulus_3 = 0xFFFFFFFF00000001ULL;

    // A little-endian representation of R^2 modulo the modulus (R=2^256 mod modulus) split into 4 64-bit words
    static constexpr uint64_t r_squared_0 = 3ULL;
    static constexpr uint64_t r_squared_1 = 18446744056529682431ULL;
    static constexpr uint64_t r_squared_2 = 18446744073709551614ULL;
    static constexpr uint64_t r_squared_3 = 21474836477ULL;

    // -(Modulus^-1) mod 2^64
    // This constant is used during multiplication: given an 8-limb representation of the multiplication of two field
    // elements, for each of the lowest four limbs we compute: k_i = r_inv * limb_i and we add 2^{64 * i} * k_i * p to
    // the result of the multiplication. In this way we zero out the lowest four limbs of the multiplication and we can
    // divide by 2^256 by taking the highest four limbs. See field_docs.hpp for more details.
    static constexpr uint64_t r_inv = 1;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x100000000UL;
    static constexpr uint64_t r_inv_1 = 0x0UL;
    static constexpr uint64_t r_inv_2 = 0xffffffff00000001UL;
    static constexpr uint64_t r_inv_3 = 0x0UL;

    // Not used for secp256r1
    static constexpr uint64_t cube_root_0 = 0UL;
    static constexpr uint64_t cube_root_1 = 0UL;
    static constexpr uint64_t cube_root_2 = 0UL;
    static constexpr uint64_t cube_root_3 = 0UL;

    // Not used for secp256r1
    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;

    // Coset generators in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems, don't really need
    // them here
    static constexpr uint64_t coset_generator_0 = 0x3ULL;
    static constexpr uint64_t coset_generator_1 = 0xfffffffd00000000ULL;
    static constexpr uint64_t coset_generator_2 = 0xffffffffffffffffULL;
    static constexpr uint64_t coset_generator_3 = 0x2fffffffcULL;

    // A little-endian representation of the modulus split into 9 29-bit limbs
    // This is used in wasm because we can only do multiplication with 64-bit result instead of 128-bit like in x86_64
    static constexpr uint64_t modulus_wasm_0 = 0x1fffffff;
    static constexpr uint64_t modulus_wasm_1 = 0x1fffffff;
    static constexpr uint64_t modulus_wasm_2 = 0x1fffffff;
    static constexpr uint64_t modulus_wasm_3 = 0x1ff;
    static constexpr uint64_t modulus_wasm_4 = 0x0;
    static constexpr uint64_t modulus_wasm_5 = 0x0;
    static constexpr uint64_t modulus_wasm_6 = 0x40000;
    static constexpr uint64_t modulus_wasm_7 = 0x1fe00000;
    static constexpr uint64_t modulus_wasm_8 = 0xffffff;

    // A little-endian representation of R^2 modulo the modulus (R=2^261 mod modulus) split into 4 64-bit words
    // We use 2^261 in wasm, because 261=29*9, the 9 29-bit limbs used for arithmetic
    static constexpr uint64_t r_squared_wasm_0 = 0x0000000000000c00UL;
    static constexpr uint64_t r_squared_wasm_1 = 0xffffeffffffffc00UL;
    static constexpr uint64_t r_squared_wasm_2 = 0xfffffffffffffbffUL;
    static constexpr uint64_t r_squared_wasm_3 = 0x000013fffffff7ffUL;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 10 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_wasm_0 = 0x0;
    static constexpr uint64_t r_inv_wasm_1 = 0x0;
    static constexpr uint64_t r_inv_wasm_2 = 0x200;
    static constexpr uint64_t r_inv_wasm_3 = 0x0;
    static constexpr uint64_t r_inv_wasm_4 = 0x0;
    static constexpr uint64_t r_inv_wasm_5 = 0x40000;
    static constexpr uint64_t r_inv_wasm_6 = 0x1fe00000;
    static constexpr uint64_t r_inv_wasm_7 = 0xffffff;
    static constexpr uint64_t r_inv_wasm_8 = 0x0;

    // Not used for secp256r1
    static constexpr uint64_t cube_root_wasm_0 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_1 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_2 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_3 = 0x0000000000000000UL;

    // Not used for secp256r1
    static constexpr uint64_t primitive_root_wasm_0 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_1 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_2 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_3 = 0x0000000000000000UL;

    // Coset generators in Montgomery form for R=2^261 mod Modulus. Used in FFT-based proving systems, don't really need
    // them here
    static constexpr uint64_t coset_generator_wasm_0 = 0x0000000000000060ULL;
    static constexpr uint64_t coset_generator_wasm_1 = 0xffffffa000000000ULL;
    static constexpr uint64_t coset_generator_wasm_2 = 0xffffffffffffffffULL;
    static constexpr uint64_t coset_generator_wasm_3 = 0x0000005fffffff9fULL;

    // For consistency with bb::fq, if we ever represent an element of bb::secp256r1::fq in the public inputs, we do so
    // as a bigfield element, so with 4 public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = BIGFIELD_PUBLIC_INPUTS_SIZE;
};
using fq = field<FqParams>;

/**
 * @brief Parameters defining the scalar field of the secp256r1 curve.
 *
 * @details When split into 4 64-bit words, the parameters are represented in little-endian, i.e. the least significant
 * bit comes first. For example, to recover the modulus from the 64-bit words we concatenate its limbs to obtain:
 *           0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
 *
 * @note These parameters can be extracted by running the script parameter_helper.py in ecc/fields
 */
struct FrParams {
    static constexpr const char* schema_name = "secp256r1_fr";

    // A little-endian representation of the modulus split into 4 64-bit words
    static constexpr uint64_t modulus_0 = 0xF3B9CAC2FC632551ULL;
    static constexpr uint64_t modulus_1 = 0xBCE6FAADA7179E84ULL;
    static constexpr uint64_t modulus_2 = 0xFFFFFFFFFFFFFFFFULL;
    static constexpr uint64_t modulus_3 = 0xFFFFFFFF00000000ULL;

    // A little-endian representation of R^2 modulo the modulus (R=2^256 mod modulus) split into 4 64-bit words
    static constexpr uint64_t r_squared_0 = 9449762124159643298ULL;
    static constexpr uint64_t r_squared_1 = 5087230966250696614ULL;
    static constexpr uint64_t r_squared_2 = 2901921493521525849ULL;
    static constexpr uint64_t r_squared_3 = 7413256579398063648ULL;

    // -(Modulus^-1) mod 2^64
    // This is used to compute k = r_inv * lower_limb(scalar), such that scalar + k*modulus in integers would have 0 in
    // the lowest limb By performing this sequentially for 4 limbs, we get an 8-limb representation of the scalar, where
    // the lowest 4 limbs are zeros. Then we can immediately divide by 2^256 by simply getting rid of the lowest 4 limbs
    static constexpr uint64_t r_inv = 14758798090332847183ULL;

    // 2^(-64) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_0 = 0x230102a06d6251dcUL;
    static constexpr uint64_t r_inv_1 = 0xca5113bcafc4ea28UL;
    static constexpr uint64_t r_inv_2 = 0xded10c5bee00bc4eUL;
    static constexpr uint64_t r_inv_3 = 0xccd1c8aa212ef3a4UL;

    // Not used for secp256r1
    static constexpr uint64_t cube_root_0 = 0UL;
    static constexpr uint64_t cube_root_1 = 0UL;
    static constexpr uint64_t cube_root_2 = 0UL;
    static constexpr uint64_t cube_root_3 = 0UL;

    // Not used for secp256r1
    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;

    // Coset generator in Montgomery form for R=2^256 mod Modulus. Used in FFT-based proving systems, don't really need
    // them here
    static constexpr uint64_t coset_generator_0 = 0x55eb74ab1949fac9ULL;
    static constexpr uint64_t coset_generator_1 = 0xd5af25406e5aaa5dULL;
    static constexpr uint64_t coset_generator_2 = 0x1ULL;
    static constexpr uint64_t coset_generator_3 = 0x6fffffff9ULL;

    // A little-endian representation of the modulus split into 9 29-bit limbs
    // This is used in wasm because we can only do multiplication with 64-bit result instead of 128-bit like in x86_64
    static constexpr uint64_t modulus_wasm_0 = 0x1c632551;
    static constexpr uint64_t modulus_wasm_1 = 0x1dce5617;
    static constexpr uint64_t modulus_wasm_2 = 0x5e7a13c;
    static constexpr uint64_t modulus_wasm_3 = 0xdf55b4e;
    static constexpr uint64_t modulus_wasm_4 = 0x1ffffbce;
    static constexpr uint64_t modulus_wasm_5 = 0x1fffffff;
    static constexpr uint64_t modulus_wasm_6 = 0x3ffff;
    static constexpr uint64_t modulus_wasm_7 = 0x1fe00000;
    static constexpr uint64_t modulus_wasm_8 = 0xffffff;

    // A little-endian representation of R^2 modulo the modulus (R=2^261 mod modulus) split into 4 64-bit words
    // We use 2^261 in wasm, because 261=29*9, the 9 29-bit limbs used for arithmetic
    static constexpr uint64_t r_squared_wasm_0 = 0x45e9cfeeb48d9ef5UL;
    static constexpr uint64_t r_squared_wasm_1 = 0x1f11fc5bb2d31a99UL;
    static constexpr uint64_t r_squared_wasm_2 = 0x16c8e4adafb16586UL;
    static constexpr uint64_t r_squared_wasm_3 = 0x84b6556a65587f06UL;

    // 2^(-29) mod Modulus
    // Used in the reduction mechanism, see field_docs.md
    // Instead of computing k, we multiply the lowest limb by this value and then add to the following 5 limbs.
    // This saves us from having to compute k
    static constexpr uint64_t r_inv_wasm_0 = 0x8517c79;
    static constexpr uint64_t r_inv_wasm_1 = 0x1edc694;
    static constexpr uint64_t r_inv_wasm_2 = 0x459ee5c;
    static constexpr uint64_t r_inv_wasm_3 = 0x705a6a8;
    static constexpr uint64_t r_inv_wasm_4 = 0x1ffffe2a;
    static constexpr uint64_t r_inv_wasm_5 = 0x113bffff;
    static constexpr uint64_t r_inv_wasm_6 = 0x1621c017;
    static constexpr uint64_t r_inv_wasm_7 = 0xef1ff43;
    static constexpr uint64_t r_inv_wasm_8 = 0x7005e2;

    // Not used for secp256r1
    static constexpr uint64_t cube_root_wasm_0 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_1 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_2 = 0x0000000000000000UL;
    static constexpr uint64_t cube_root_wasm_3 = 0x0000000000000000UL;

    // Not used for secp256r1
    static constexpr uint64_t primitive_root_wasm_0 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_1 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_2 = 0x0000000000000000UL;
    static constexpr uint64_t primitive_root_wasm_3 = 0x0000000000000000UL;

    // Coset generators in Montgomery form for R=2^261 mod Modulus. Used in FFT-based proving systems, don't really need
    // them here
    static constexpr uint64_t coset_generator_wasm_0 = 0xbd6e9563293f5920ULL;
    static constexpr uint64_t coset_generator_wasm_1 = 0xb5e4a80dcb554baaULL;
    static constexpr uint64_t coset_generator_wasm_2 = 0x000000000000003aULL;
    static constexpr uint64_t coset_generator_wasm_3 = 0x000000dfffffff20ULL;

    // For consistency with bb::fq, if we ever represent an element of bb::secp256r1::fq in the public inputs, we do so
    // as a bigfield element, so with 4 public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = BIGFIELD_PUBLIC_INPUTS_SIZE;
};
using fr = field<FrParams>;

struct G1Params {
    static constexpr bool USE_ENDOMORPHISM = false;
    static constexpr bool can_hash_to_curve = true;
    static constexpr bool has_a = true;

    static constexpr fq b =
        fq(0x3BCE3C3E27D2604B, 0x651D06B0CC53B0F6, 0xB3EBBD55769886BC, 0x5AC635D8AA3A93E7).to_montgomery_form();
    static constexpr fq a =
        fq(0xFFFFFFFFFFFFFFFC, 0x00000000FFFFFFFF, 0x0000000000000000, 0xFFFFFFFF00000001).to_montgomery_form();

    static constexpr fq one_x =
        fq(0xF4A13945D898C296, 0x77037D812DEB33A0, 0xF8BCE6E563A440F2, 0x6B17D1F2E12C4247).to_montgomery_form();
    static constexpr fq one_y =
        fq(0xCBB6406837BF51F5, 0x2BCE33576B315ECE, 0x8EE7EB4A7C0F9E16, 0x4FE342E2FE1A7F9B).to_montgomery_form();
};
using g1 = group<fq, fr, G1Params>;

// specialize the name in msgpack schema generation
// consumed by the typescript schema compiler, helps disambiguate templates
inline std::string msgpack_schema_name(g1::affine_element const& /*unused*/)
{
    return "Secp256r1Point";
}

} // namespace bb::secp256r1

namespace bb::curve {
class SECP256R1 {
  public:
    using ScalarField = secp256r1::fr;
    using BaseField = secp256r1::fq;
    using Group = secp256r1::g1;
    using Element = typename Group::element;
    using AffineElement = typename Group::affine_element;
};
} // namespace bb::curve

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)

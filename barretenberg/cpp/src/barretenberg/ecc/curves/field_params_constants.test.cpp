/**
 * @brief Typed test fixture verifying field parameter constants for all supported curves.
 *
 * Each field is described by a Config struct that bundles:
 *   - Params:                    the field params struct (e.g. Bn254FqParams)
 *   - Field:                     the instantiated field type (e.g. bb::fq = field<Bn254FqParams>)
 *   - expected_modulus_decimal:  the expected modulus as a decimal string (ground truth reference)
 *   - has_cube_root:             whether a meaningful cube root of unity exists in this field
 *   - has_primitive_root:        whether a high-2-adicity primitive root of unity is used
 *
 * Tests cover native (64-bit limb) and WASM (29-bit limb) representations of all constants.
 *
 * Fields tested:
 *   - BN254:     Fq (base field), Fr (scalar field)
 *   - secp256k1: Fq (base field), Fr (scalar field)
 *   - secp256r1: Fq (base field), Fr (scalar field)
 *
 * Note: Grumpkin reuses BN254's fq/fr (swapped), so no separate config is needed.
 */

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <array>
#include <gtest/gtest.h>
#include <string>

using namespace bb;

namespace {

// Helper to convert a decimal string to uint256_t.
uint256_t from_decimal(const std::string& dec_str)
{
    uint256_t result = 0;
    for (char c : dec_str) {
        result = result * 10 + static_cast<uint64_t>(c - '0');
    }
    return result;
}

// ============================================================
// Config structs — one per field, providing expected constants
// and feature flags that control which tests are exercised.
// ============================================================

struct Bn254FqTestConfig {
    using Params = Bn254FqParams;
    using Field = bb::fq;
    // BN254 base field prime q
    // References: https://eips.ethereum.org/EIPS/eip-196, https://hackmd.io/@jpw/bn254
    static constexpr const char* expected_modulus_decimal =
        "21888242871839275222246405745257275088696311157297823662689037894645226208583";
    static constexpr bool has_cube_root = true;
    static constexpr bool has_primitive_root = false;
};

struct Bn254FrTestConfig {
    using Params = Bn254FrParams;
    using Field = bb::fr;
    // BN254 scalar field prime r (also Baby Jubjub base field)
    // References: https://eips.ethereum.org/EIPS/eip-196, https://hackmd.io/@jpw/bn254
    static constexpr const char* expected_modulus_decimal =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";
    static constexpr bool has_cube_root = true;
    static constexpr bool has_primitive_root = true;
};

struct Secp256k1FqTestConfig {
    using Params = secp256k1::FqParams;
    using Field = secp256k1::fq;
    // secp256k1 base field prime p = 2^256 - 2^32 - 977
    // Reference: https://www.secg.org/sec2-v2.pdf
    static constexpr const char* expected_modulus_decimal =
        "115792089237316195423570985008687907853269984665640564039457584007908834671663";
    static constexpr bool has_cube_root = true;
    static constexpr bool has_primitive_root = false;
};

struct Secp256k1FrTestConfig {
    using Params = secp256k1::FrParams;
    using Field = secp256k1::fr;
    // secp256k1 scalar field order
    // Reference: https://www.secg.org/sec2-v2.pdf
    static constexpr const char* expected_modulus_decimal =
        "115792089237316195423570985008687907852837564279074904382605163141518161494337";
    static constexpr bool has_cube_root = true;
    static constexpr bool has_primitive_root = false;
};

struct Secp256r1FqTestConfig {
    using Params = secp256r1::FqParams;
    using Field = secp256r1::fq;
    // secp256r1 (P-256) base field prime p = 2^256 - 2^224 + 2^192 + 2^96 - 1
    // Reference: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf
    static constexpr const char* expected_modulus_decimal =
        "115792089210356248762697446949407573530086143415290314195533631308867097853951";
    static constexpr bool has_cube_root = false;
    static constexpr bool has_primitive_root = false;
};

struct Secp256r1FrTestConfig {
    using Params = secp256r1::FrParams;
    using Field = secp256r1::fr;
    // secp256r1 (P-256) scalar field order
    // Reference: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf
    static constexpr const char* expected_modulus_decimal =
        "115792089210356248762697446949407573529996955224135760342422259061068512044369";
    static constexpr bool has_cube_root = false;
    static constexpr bool has_primitive_root = false;
};

} // namespace

// ============================================================
// Typed test fixture
// ============================================================

template <typename Config> class FieldConstantsTest : public testing::Test {};

TYPED_TEST_SUITE_P(FieldConstantsTest);

// Verify that the 4 x 64-bit limbs reconstruct to the expected modulus.
TYPED_TEST_P(FieldConstantsTest, Modulus)
{
    using Params = typename TypeParam::Params;
    uint256_t expected = from_decimal(TypeParam::expected_modulus_decimal);
    uint256_t actual{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    EXPECT_EQ(expected, actual);
}

// Verify R^2 mod p, where R = 2^256, stored in r_squared_{0-3}.
TYPED_TEST_P(FieldConstantsTest, RSquared)
{
    using Params = typename TypeParam::Params;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    uint512_t R = (uint512_t(1) << 256) % mod;
    uint512_t expected = (R * R) % mod;
    uint256_t actual{ Params::r_squared_0, Params::r_squared_1, Params::r_squared_2, Params::r_squared_3 };
    EXPECT_EQ(expected.lo, actual);
}

// Verify r_inv = -(modulus^{-1}) mod 2^64, used for Montgomery reduction.
TYPED_TEST_P(FieldConstantsTest, RInv)
{
    using Params = typename TypeParam::Params;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    uint512_t two_64 = uint512_t(1) << 64;
    uint512_t neg_mod{ -mod, 0 };
    uint64_t expected = neg_mod.invmod(two_64).lo.data[0];
    EXPECT_EQ(Params::r_inv, expected);
}

// Verify r_inv_{0-3} = 2^{-64} mod p, used in the Barrett-Montgomery reduction.
TYPED_TEST_P(FieldConstantsTest, PowMinus64)
{
    using Params = typename TypeParam::Params;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    uint512_t two_64 = uint512_t(1) << 64;
    uint256_t expected = two_64.invmod(mod).lo;
    EXPECT_EQ(expected.data[0], Params::r_inv_0);
    EXPECT_EQ(expected.data[1], Params::r_inv_1);
    EXPECT_EQ(expected.data[2], Params::r_inv_2);
    EXPECT_EQ(expected.data[3], Params::r_inv_3);
}

// Verify that beta = cube_root_of_unity() satisfies beta^3 = 1 and beta != 1.
TYPED_TEST_P(FieldConstantsTest, CubeRootOfUnity)
{
    if constexpr (!TypeParam::has_cube_root) {
        GTEST_SKIP() << "Cube root of unity is not defined for this field";
    } else {
        using Field = typename TypeParam::Field;
        Field beta = Field::cube_root_of_unity();
        EXPECT_EQ(beta * beta * beta, Field::one());
        EXPECT_NE(beta, Field::one());
    }
}

// Verify that get_root_of_unity(order) is a primitive 2^order root of unity.
TYPED_TEST_P(FieldConstantsTest, PrimitiveRootOfUnity)
{
    if constexpr (!TypeParam::has_primitive_root) {
        GTEST_SKIP() << "Primitive root of unity is not used for this field";
    } else {
        using Field = typename TypeParam::Field;
        size_t order = Field::primitive_root_log_size();
        Field root = Field::get_root_of_unity(order);
        // root^{2^i} != 1 for all 0 <= i < order
        for (size_t i = 0; i < order; i++) {
            EXPECT_NE(root, Field::one());
            root = root.sqr();
        }
        // root^{2^order} = 1
        EXPECT_EQ(root, Field::one());
    }
}

// Verify that coset_generator() is not a quadratic residue mod p, i.e. coset_gen^{(p-1)/2} != 1.
TYPED_TEST_P(FieldConstantsTest, CosetGenerator)
{
    using Params = typename TypeParam::Params;
    using Field = typename TypeParam::Field;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    Field coset_gen = Field::coset_generator();
    EXPECT_NE(coset_gen.pow((mod - 1) / 2), Field::one());
}

// ============================================================
// WASM consistency tests (9 x 29-bit limb representation)
// ============================================================

// Verify that the 9 x 29-bit WASM limbs reconstruct to the same modulus as the 4 x 64-bit limbs,
// and that each limb fits in 29 bits.
TYPED_TEST_P(FieldConstantsTest, WasmModulusConsistency)
{
    using Params = typename TypeParam::Params;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    constexpr std::array<uint64_t, 9> wasm_limbs = { Params::modulus_wasm_0, Params::modulus_wasm_1,
                                                     Params::modulus_wasm_2, Params::modulus_wasm_3,
                                                     Params::modulus_wasm_4, Params::modulus_wasm_5,
                                                     Params::modulus_wasm_6, Params::modulus_wasm_7,
                                                     Params::modulus_wasm_8 };
    uint512_t wasm_modulus = 0;
    for (size_t i = 0; i < 9; i++) {
        wasm_modulus += uint512_t(wasm_limbs[i]) << (29UL * i);
        EXPECT_LT(wasm_limbs[i], uint64_t(1) << 29);
    }
    EXPECT_EQ(wasm_modulus.lo, mod);
    EXPECT_EQ(wasm_modulus.hi, uint256_t(0));
}

// Verify r_inv_wasm_{0-8} = 2^{-29} mod p, stored as 9 x 29-bit limbs.
// Also verify each limb fits in 29 bits, and that it is smaller than the modulus
TYPED_TEST_P(FieldConstantsTest, WasmPowMinus29)
{
    using Params = typename TypeParam::Params;
    uint256_t mod{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    constexpr std::array<uint64_t, 9> r_inv_wasm_limbs = {
        Params::r_inv_wasm_0, Params::r_inv_wasm_1, Params::r_inv_wasm_2, Params::r_inv_wasm_3, Params::r_inv_wasm_4,
        Params::r_inv_wasm_5, Params::r_inv_wasm_6, Params::r_inv_wasm_7, Params::r_inv_wasm_8
    };
    uint512_t r_inv_wasm = 0;
    for (size_t i = 0; i < 9; i++) {
        r_inv_wasm += uint512_t(r_inv_wasm_limbs[i]) << (29UL * i);
        EXPECT_LT(r_inv_wasm_limbs[i], uint64_t(1) << 29);
    }
    uint512_t two_29 = uint512_t(1) << 29;
    uint512_t expected = two_29.invmod(mod);
    EXPECT_EQ(r_inv_wasm, expected);
    EXPECT_LT(r_inv_wasm, uint512_t(mod));
}

REGISTER_TYPED_TEST_SUITE_P(FieldConstantsTest,
                            Modulus,
                            RSquared,
                            RInv,
                            PowMinus64,
                            CubeRootOfUnity,
                            PrimitiveRootOfUnity,
                            CosetGenerator,
                            WasmModulusConsistency,
                            WasmPowMinus29);

using FieldTestTypes = ::testing::Types<Bn254FqTestConfig,
                                        Bn254FrTestConfig,
                                        Secp256k1FqTestConfig,
                                        Secp256k1FrTestConfig,
                                        Secp256r1FqTestConfig,
                                        Secp256r1FrTestConfig>;

INSTANTIATE_TYPED_TEST_SUITE_P(AllFields, FieldConstantsTest, FieldTestTypes);

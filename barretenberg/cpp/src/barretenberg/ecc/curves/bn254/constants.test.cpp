/**
 * @brief Tests that verify the correctness of BN-254 field constants (both Fq and Fr).
 *
 */
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include "fq.hpp"
#include "fr.hpp"
#include <array>
#include <gtest/gtest.h>

using namespace bb;
namespace {
uint256_t native_q{
    Bn254FqParams::modulus_0, Bn254FqParams::modulus_1, Bn254FqParams::modulus_2, Bn254FqParams::modulus_3
};
uint256_t native_r{
    Bn254FrParams::modulus_0, Bn254FrParams::modulus_1, Bn254FrParams::modulus_2, Bn254FrParams::modulus_3
};

// Helper to convert a decimal string to uint256_t
uint256_t from_decimal(const std::string& dec_str)
{
    uint256_t result = 0;
    for (char c : dec_str) {
        result = result * 10 + static_cast<uint64_t>(c - '0');
    }
    return result;
}
} // namespace

TEST(FqConstants, Modulus)
{
    // BN254 base field prime: q = 21888242871839275222246405745257275088696311157297823662689037894645226208583
    // References:
    // [eip-196](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-196.md)
    // [ark-works](https://docs.rs/ark-bn254/latest/ark_bn254/)
    // [BN-254 for the rest of us](https://hackmd.io/@jpw/bn254)
    uint256_t expected_q =
        from_decimal("21888242871839275222246405745257275088696311157297823662689037894645226208583");
    EXPECT_EQ(expected_q, native_q);
}

TEST(FqConstants, RSquared)
{
    // R^2 = (2^256)^2 mod q.
    uint512_t R = (uint512_t(1) << 256) % native_q;
    uint512_t expected_r_sqr_mod_q = (R * R) % native_q;
    uint256_t actual_r_sqr_mod_q{
        Bn254FqParams::r_squared_0, Bn254FqParams::r_squared_1, Bn254FqParams::r_squared_2, Bn254FqParams::r_squared_3
    };

    EXPECT_EQ(expected_r_sqr_mod_q.lo, actual_r_sqr_mod_q);
    EXPECT_EQ(expected_r_sqr_mod_q.hi, uint256_t(0));
}

TEST(FqConstants, RInv)
{
    // r_inv = -q^{-1} mod 2^64
    uint512_t r{ 0, 1 };
    uint512_t q{ -native_q, 0 };
    uint256_t q_inv = q.invmod(r).lo;
    uint64_t expected = q_inv.data[0];
    uint64_t result = Bn254FqParams::r_inv;

    EXPECT_EQ(result, expected);
}

TEST(FqConstants, CubeRootOfUnity)
{
    fq beta = fq::cube_root_of_unity();

    // Verify beta^3 = 1 and beta != 1
    EXPECT_EQ(beta * beta * beta, fq::one());
    EXPECT_NE(beta, fq::one());
}

// ================================
// WASM Consistency Tests
// ================================

TEST(FqConstants, WasmModulusConsistency)
{
    // WASM uses 9 x 29-bit limbs to represent the modulus
    // Verify that the 29-bit limb representation reconstructs to the same value as the 4 x 64-bit limb representation
    constexpr std::array<uint64_t, 9> wasm_limbs = { Bn254FqParams::modulus_wasm_0, Bn254FqParams::modulus_wasm_1,
                                                     Bn254FqParams::modulus_wasm_2, Bn254FqParams::modulus_wasm_3,
                                                     Bn254FqParams::modulus_wasm_4, Bn254FqParams::modulus_wasm_5,
                                                     Bn254FqParams::modulus_wasm_6, Bn254FqParams::modulus_wasm_7,
                                                     Bn254FqParams::modulus_wasm_8 };

    uint512_t wasm_modulus = 0;
    for (size_t i = 0; i < 9; i++) {
        wasm_modulus += uint512_t(wasm_limbs[i]) << (29UL * i);
        // Verify each limb fits in 29 bits
        EXPECT_LT(wasm_limbs[i], uint64_t(1) << 29);
    }

    EXPECT_EQ(wasm_modulus.lo, native_q);
    EXPECT_EQ(wasm_modulus.hi, uint256_t(0));
}

TEST(FqConstants, WasmRSquared)
{
    // WASM uses R = 2^261 (since 261 = 29 * 9)
    // r_squared_wasm should be (2^261)^2 mod q = 2^522 mod q
    uint512_t R_wasm = uint512_t(1) << 261;
    uint512_t R_wasm_mod_q = R_wasm % native_q;
    uint512_t expected_r_squared_wasm = (R_wasm_mod_q * R_wasm_mod_q) % native_q;

    uint256_t actual_r_squared_wasm{ Bn254FqParams::r_squared_wasm_0,
                                     Bn254FqParams::r_squared_wasm_1,
                                     Bn254FqParams::r_squared_wasm_2,
                                     Bn254FqParams::r_squared_wasm_3 };

    EXPECT_EQ(expected_r_squared_wasm.lo, actual_r_squared_wasm);
}

TEST(FqConstants, WasmCubeRootConsistency)
{
    // The cube root in WASM Montgomery form should represent the same field element
    // as the cube root in native Montgomery form.
    //
    // Native Montgomery form: cube_root_native = beta * R_native mod q, where R_native = 2^256
    // WASM Montgomery form:   cube_root_wasm = beta * R_wasm mod q, where R_wasm = 2^261
    //
    // Therefore: cube_root_wasm = cube_root_native * (R_wasm / R_native) mod q
    //                           = cube_root_native * 2^5 mod q

    uint256_t cube_root_native{
        Bn254FqParams::cube_root_0, Bn254FqParams::cube_root_1, Bn254FqParams::cube_root_2, Bn254FqParams::cube_root_3
    };

    uint256_t cube_root_wasm{ Bn254FqParams::cube_root_wasm_0,
                              Bn254FqParams::cube_root_wasm_1,
                              Bn254FqParams::cube_root_wasm_2,
                              Bn254FqParams::cube_root_wasm_3 };

    // R_wasm / R_native = 2^261 / 2^256 = 2^5 = 32
    uint512_t expected_cube_root_wasm = (uint512_t(cube_root_native) * 32) % native_q;

    EXPECT_EQ(expected_cube_root_wasm.lo, cube_root_wasm);
}
// r_inv_wasm represents 2^(-29) mod q in 9 x 29-bit limbs
// this tests checks that that r_inv_wasm < q/2 (and in particular less than q).
TEST(FqConstants, WasmRInvLessThanModulus)
{
    // Verify that when reconstructed as a uint512_t, it is less than the modulus q
    constexpr std::array<uint64_t, 9> r_inv_wasm_limbs = { Bn254FqParams::r_inv_wasm_0, Bn254FqParams::r_inv_wasm_1,
                                                           Bn254FqParams::r_inv_wasm_2, Bn254FqParams::r_inv_wasm_3,
                                                           Bn254FqParams::r_inv_wasm_4, Bn254FqParams::r_inv_wasm_5,
                                                           Bn254FqParams::r_inv_wasm_6, Bn254FqParams::r_inv_wasm_7,
                                                           Bn254FqParams::r_inv_wasm_8 };

    uint512_t r_inv_wasm = 0;
    for (size_t i = 0; i < 9; i++) {
        r_inv_wasm += uint512_t(r_inv_wasm_limbs[i]) << (29UL * i);
        // Verify each limb fits in 29 bits
        EXPECT_LT(r_inv_wasm_limbs[i], uint64_t(1) << 29);
    }

    // Verify r_inv_wasm < q/2
    EXPECT_LT(r_inv_wasm, uint512_t(native_q) / 2);
}

// ================================
// Fr Constants Tests
// ================================

TEST(FrConstants, Modulus)
{
    // BN254 scalar field prime (also the Baby Jubjub base field):
    // r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
    // References:
    // [eip-196](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-196.md)
    // [ark-works](https://docs.rs/ark-bn254/latest/ark_bn254/)
    // [BN-254 for the rest of us](https://hackmd.io/@jpw/bn254)
    uint256_t expected_r =
        from_decimal("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    EXPECT_EQ(expected_r, native_r);
}

TEST(FrConstants, RSquared)
{
    // R^2 = (2^256)^2 mod r.
    uint512_t R = (uint512_t(1) << 256) % native_r;
    uint512_t expected_r_sqr_mod_r = (R * R) % native_r;
    uint256_t actual_r_sqr_mod_r{
        Bn254FrParams::r_squared_0, Bn254FrParams::r_squared_1, Bn254FrParams::r_squared_2, Bn254FrParams::r_squared_3
    };

    EXPECT_EQ(expected_r_sqr_mod_r.lo, actual_r_sqr_mod_r);
    EXPECT_EQ(expected_r_sqr_mod_r.hi, uint256_t(0));
}

TEST(FrConstants, RInv)
{
    // r_inv = -r^{-1} mod 2^64
    uint512_t two_64 = uint512_t(1) << 64;
    uint512_t neg_r{ -native_r, 0 };
    uint256_t r_inv = neg_r.invmod(two_64).lo;
    uint64_t expected = r_inv.data[0];
    uint64_t result = Bn254FrParams::r_inv;

    EXPECT_EQ(result, expected);
}

TEST(FrConstants, PowMinus64)
{
    // Compute 2^(-64) mod r
    uint512_t two_64 = uint512_t(1) << 64;
    uint256_t expected = two_64.invmod(native_r).lo;

    // Note that the following test ensures r_inv (as reconstructed from its limbs) is smaller than r because it is
    // equal to 2^(-64) mod r
    EXPECT_EQ(expected.data[0], Bn254FrParams::r_inv_0);
    EXPECT_EQ(expected.data[1], Bn254FrParams::r_inv_1);
    EXPECT_EQ(expected.data[2], Bn254FrParams::r_inv_2);
    EXPECT_EQ(expected.data[3], Bn254FrParams::r_inv_3);
}

TEST(FrConstants, CubeRootOfUnity)
{
    fr beta = fr::cube_root_of_unity();

    // Verify beta^3 = 1 and beta != 1
    EXPECT_EQ(beta * beta * beta, fr::one());
    EXPECT_NE(beta, fr::one());
}

TEST(FrConstants, PrimitiveRootOfUnity)
{
    size_t order = fr::primitive_root_log_size();
    fr root = fr::get_root_of_unity(order);

    // Check that root^{2^i} != 1 for i < order
    for (size_t i = 0; i < order; i++) {
        EXPECT_NE(root, fr::one());
        root = root.sqr();
    }

    // Check that root^{2^order} = 1, this implies order(root) = 2^order because the order of root must divide 2^order
    // but all previous powers of 2 were not the order
    EXPECT_EQ(root, fr::one());
}

TEST(FrConstants, CosetGenerator)
{
    fr coset_generator = fr::coset_generator();

    // Verify that coset_generator is not a quadratic residue
    EXPECT_NE(coset_generator.pow((native_r - 1) / 2), fr::one());
}

// ================================
// Fr WASM Consistency Tests
// ================================

TEST(FrConstants, WasmModulusConsistency)
{
    // WASM uses 9 x 29-bit limbs to represent the modulus
    constexpr std::array<uint64_t, 9> wasm_limbs = { Bn254FrParams::modulus_wasm_0, Bn254FrParams::modulus_wasm_1,
                                                     Bn254FrParams::modulus_wasm_2, Bn254FrParams::modulus_wasm_3,
                                                     Bn254FrParams::modulus_wasm_4, Bn254FrParams::modulus_wasm_5,
                                                     Bn254FrParams::modulus_wasm_6, Bn254FrParams::modulus_wasm_7,
                                                     Bn254FrParams::modulus_wasm_8 };

    uint512_t wasm_modulus = 0;
    for (size_t i = 0; i < 9; i++) {
        wasm_modulus += uint512_t(wasm_limbs[i]) << (29UL * i);
        EXPECT_LT(wasm_limbs[i], uint64_t(1) << 29);
    }

    EXPECT_EQ(wasm_modulus.lo, native_r);
    EXPECT_EQ(wasm_modulus.hi, uint256_t(0));
}

TEST(FrConstants, WasmRSquared)
{
    // WASM uses R = 2^261 (since 261 = 29 * 9)
    uint512_t R_wasm = uint512_t(1) << 261;
    uint512_t R_wasm_mod_r = R_wasm % native_r;
    uint512_t expected_r_squared_wasm = (R_wasm_mod_r * R_wasm_mod_r) % native_r;

    uint256_t actual_r_squared_wasm{ Bn254FrParams::r_squared_wasm_0,
                                     Bn254FrParams::r_squared_wasm_1,
                                     Bn254FrParams::r_squared_wasm_2,
                                     Bn254FrParams::r_squared_wasm_3 };

    EXPECT_EQ(expected_r_squared_wasm.lo, actual_r_squared_wasm);
    EXPECT_EQ(expected_r_squared_wasm.hi, uint256_t(0));
}

TEST(FrConstants, WasmPowMinus29)
{
    // Verify that when reconstructed as a uint512_t, it is less than the modulus r
    constexpr std::array<uint64_t, 9> r_inv_wasm_limbs = { Bn254FrParams::r_inv_wasm_0, Bn254FrParams::r_inv_wasm_1,
                                                           Bn254FrParams::r_inv_wasm_2, Bn254FrParams::r_inv_wasm_3,
                                                           Bn254FrParams::r_inv_wasm_4, Bn254FrParams::r_inv_wasm_5,
                                                           Bn254FrParams::r_inv_wasm_6, Bn254FrParams::r_inv_wasm_7,
                                                           Bn254FrParams::r_inv_wasm_8 };

    uint512_t r_inv_wasm = 0;
    for (size_t i = 0; i < 9; i++) {
        r_inv_wasm += uint512_t(r_inv_wasm_limbs[i]) << (29UL * i);
        // Verify each limb fits in 29 bits
        EXPECT_LT(r_inv_wasm_limbs[i], uint64_t(1) << 29);
    }

    // r_inv_wasm actually is less than r / 2, so we test this
    EXPECT_LT(r_inv_wasm, uint512_t(native_r) / 2);

    // Verify that r_inv_wasm = 2^(-29) mod r
    uint512_t two_29 = uint512_t(1) << 29;
    uint512_t expected_r_inv_wasm = two_29.invmod(native_r);
    EXPECT_EQ(r_inv_wasm, expected_r_inv_wasm);
}

TEST(FrConstants, WasmCubeRootConsistency)
{
    // The cube root in WASM Montgomery form should represent the same field element
    // as the cube root in native Montgomery form.
    uint256_t cube_root_native{
        Bn254FrParams::cube_root_0, Bn254FrParams::cube_root_1, Bn254FrParams::cube_root_2, Bn254FrParams::cube_root_3
    };

    uint256_t cube_root_wasm{ Bn254FrParams::cube_root_wasm_0,
                              Bn254FrParams::cube_root_wasm_1,
                              Bn254FrParams::cube_root_wasm_2,
                              Bn254FrParams::cube_root_wasm_3 };

    // R_wasm / R_native = 2^261 / 2^256 = 2^5 = 32
    uint512_t expected_cube_root_wasm = (uint512_t(cube_root_native) * 32) % native_r;

    EXPECT_EQ(expected_cube_root_wasm.lo, cube_root_wasm);
}

TEST(FrConstants, WasmPrimitiveRootConsistency)
{
    // The primitive root in WASM Montgomery form should represent the same field element
    // as the primitive root in native Montgomery form.
    uint256_t primitive_root_native{ Bn254FrParams::primitive_root_0,
                                     Bn254FrParams::primitive_root_1,
                                     Bn254FrParams::primitive_root_2,
                                     Bn254FrParams::primitive_root_3 };

    uint256_t primitive_root_wasm{ Bn254FrParams::primitive_root_wasm_0,
                                   Bn254FrParams::primitive_root_wasm_1,
                                   Bn254FrParams::primitive_root_wasm_2,
                                   Bn254FrParams::primitive_root_wasm_3 };

    // R_wasm / R_native = 2^261 / 2^256 = 2^5 = 32
    uint512_t expected_primitive_root_wasm = (uint512_t(primitive_root_native) * 32) % native_r;

    EXPECT_EQ(expected_primitive_root_wasm.lo, primitive_root_wasm);
}

TEST(FrConstants, CosetGeneratorConsistency)
{
    uint256_t coset_generator_native{ Bn254FrParams::coset_generator_0,
                                      Bn254FrParams::coset_generator_1,
                                      Bn254FrParams::coset_generator_2,
                                      Bn254FrParams::coset_generator_3 };

    uint256_t coset_generator_wasm{ Bn254FrParams::coset_generator_wasm_0,
                                    Bn254FrParams::coset_generator_wasm_1,
                                    Bn254FrParams::coset_generator_wasm_2,
                                    Bn254FrParams::coset_generator_wasm_3 };

    uint512_t balanced_coset_generator_native = (static_cast<uint512_t>(coset_generator_native) * 32) % native_r;

    EXPECT_EQ(balanced_coset_generator_native, static_cast<uint512_t>(coset_generator_wasm));
}

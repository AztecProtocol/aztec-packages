#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <cstddef>
#include <gtest/gtest.h>

using namespace bb;

namespace bb {

static std::array<uint32_t, 2> helper_non_native_multiplication(UltraCircuitBuilder& builder,
                                                                const fq& a,
                                                                const fq& b,
                                                                const uint256_t& q,
                                                                const uint256_t& r,
                                                                const uint256_t& modulus)
{
    // Splits a 256-bit integer into 4 68-bit limbs
    const auto split_into_limbs = [&](const uint512_t& input) {
        constexpr size_t NUM_BITS = 68;
        std::array<fr, 4> limbs;
        limbs[0] = input.slice(0, NUM_BITS).lo;
        limbs[1] = input.slice(NUM_BITS * 1, NUM_BITS * 2).lo;
        limbs[2] = input.slice(NUM_BITS * 2, NUM_BITS * 3).lo;
        limbs[3] = input.slice(NUM_BITS * 3, NUM_BITS * 4).lo;
        return limbs;
    };

    // Adds the 4 limbs as circuit variables and returns their indices
    const auto get_limb_witness_indices = [&](const std::array<fr, 4>& limbs) {
        std::array<uint32_t, 4> limb_indices;
        limb_indices[0] = builder.add_variable(limbs[0]);
        limb_indices[1] = builder.add_variable(limbs[1]);
        limb_indices[2] = builder.add_variable(limbs[2]);
        limb_indices[3] = builder.add_variable(limbs[3]);
        return limb_indices;
    };

    // Compute negative modulus: (-p) := 2^T - p
    const uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (68 * 4);
    auto modulus_limbs = split_into_limbs(BINARY_BASIS_MODULUS - uint512_t(modulus));

    // Add a, b, q, r as circuit variables
    const auto a_indices = get_limb_witness_indices(split_into_limbs(uint256_t(a)));
    const auto b_indices = get_limb_witness_indices(split_into_limbs(uint256_t(b)));
    const auto q_indices = get_limb_witness_indices(split_into_limbs(uint256_t(q)));
    const auto r_indices = get_limb_witness_indices(split_into_limbs(uint256_t(r)));

    // Prepare inputs for non-native multiplication gadget
    non_native_multiplication_witnesses<fr> inputs{
        a_indices, b_indices, q_indices, r_indices, modulus_limbs,
    };
    const auto [lo_1_idx, hi_1_idx] = builder.evaluate_non_native_field_multiplication(inputs);

    return { lo_1_idx, hi_1_idx };
}

TEST(UltraCircuitBuilder, NonNativeFieldMultiplication)
{
    const size_t num_iterations = 50;
    for (size_t i = 0; i < num_iterations; i++) {
        UltraCircuitBuilder builder;

        fq a = fq::random_element();
        fq b = fq::random_element();
        uint256_t modulus = fq::modulus;

        uint1024_t a_big = uint512_t(uint256_t(a));
        uint1024_t b_big = uint512_t(uint256_t(b));
        uint1024_t p_big = uint512_t(uint256_t(modulus));

        uint1024_t q_big = (a_big * b_big) / p_big;
        uint1024_t r_big = (a_big * b_big) % p_big;

        uint256_t q(q_big.lo.lo);
        uint256_t r(r_big.lo.lo);

        const auto [lo_1_idx, hi_1_idx] = helper_non_native_multiplication(builder, a, b, q, r, modulus);

        // Range check the carry (output) lo and hi limbs
        const bool is_low_70_bits = uint256_t(builder.get_variable(lo_1_idx)).get_msb() < 70;
        const bool is_high_70_bits = uint256_t(builder.get_variable(hi_1_idx)).get_msb() < 70;
        if (is_low_70_bits && is_high_70_bits) {
            // Uses more efficient NNF range check if both limbs are < 2^70
            builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);
        } else {
            // Fallback to default range checks
            builder.decompose_into_default_range(lo_1_idx, 72);
            builder.decompose_into_default_range(hi_1_idx, 72);
        }

        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

TEST(UltraCircuitBuilder, NonNativeFieldMultiplicationRegression)
{
    UltraCircuitBuilder builder;

    // Edge case values
    uint256_t a_u256 = uint256_t("0x00ab1504deacff852326adf4a01099e9340f232e2a631042852fce3c4eb8a51b");
    uint256_t b_u256 = uint256_t("0x1be457323502cfcd85f8cfa54c8c4fea146b9db2a7d86b29d966d61b714ee249");
    uint256_t q_u256 = uint256_t("0x00629b9d576dfc6b5c28a4a254d5e8e3384124f6a898858e95265254a01414d5");
    uint256_t r_u256 = uint256_t("0x2c1590eb70a48dce72f7686bbf79b59bf7926c99bc16aba92e474c65a04ea2a0");
    uint256_t modulus = fq::modulus;

    // Check if native computation yeils same q and r
    uint1024_t a_big = uint512_t(a_u256);
    uint1024_t b_big = uint512_t(b_u256);
    uint1024_t p_big = uint512_t(uint256_t(modulus));

    uint1024_t q_big = (a_big * b_big) / p_big;
    uint1024_t r_big = (a_big * b_big) % p_big;
    uint256_t q_computed(q_big.lo.lo);
    uint256_t r_computed(r_big.lo.lo);

    EXPECT_EQ(q_computed, q_u256);
    EXPECT_EQ(r_computed, r_u256);

    // This edge case leads to the carry limb being > 2^70, so it used to fail when appying a 2^70 range check
    // (with range_constrain_two_limbs). Now it should work since we fallback to default range checks in such a case.
    const auto [lo_1_idx, hi_1_idx] =
        helper_non_native_multiplication(builder, a_u256, b_u256, q_u256, r_u256, modulus);

    // Range check the carry (output) lo and hi limbs
    const bool is_high_70_bits = uint256_t(builder.get_variable(hi_1_idx)).get_msb() < 70;
    BB_ASSERT(is_high_70_bits == false); // Regression should hit this case

    // Decompose into default range: these should work even if the limbs are > 2^70
    builder.decompose_into_default_range(lo_1_idx, 72);
    builder.decompose_into_default_range(hi_1_idx, 72);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Using NNF range check should fail here
    builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);
    EXPECT_FALSE(CircuitChecker::check(builder));
    EXPECT_EQ(builder.err(), "range_constrain_two_limbs: hi limb.");
}

/**
 * @brief Test that the nnf block only contains nnf gates.
 *
 */
TEST(UltraCircuitBuilder, NonNativeFieldMultiplicationSortCheck)
{
    UltraCircuitBuilder builder;

    fq a = fq::random_element();
    fq b = fq::random_element();
    uint256_t modulus = fq::modulus;

    uint1024_t a_big = uint512_t(uint256_t(a));
    uint1024_t b_big = uint512_t(uint256_t(b));
    uint1024_t p_big = uint512_t(uint256_t(modulus));

    uint1024_t q_big = (a_big * b_big) / p_big;
    uint1024_t r_big = (a_big * b_big) % p_big;

    uint256_t q(q_big.lo.lo);
    uint256_t r(r_big.lo.lo);

    const auto [lo_1_idx, hi_1_idx] = helper_non_native_multiplication(builder, a, b, q, r, modulus);

    // Range check the carry (output) lo and hi limbs
    const bool is_low_70_bits = uint256_t(builder.get_variable(lo_1_idx)).get_msb() < 70;
    const bool is_high_70_bits = uint256_t(builder.get_variable(hi_1_idx)).get_msb() < 70;
    if (is_low_70_bits && is_high_70_bits) {
        // Uses more efficient NNF range check if both limbs are < 2^70
        builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);
    } else {
        // Fallback to default range checks
        builder.decompose_into_default_range(lo_1_idx, 72);
        builder.decompose_into_default_range(hi_1_idx, 72);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Everything above was copied from the previous test.
    // Check that in the nnf blocks, the other selectors besides the nnf selector are zero
    for (size_t i = 0; i < builder.blocks.nnf.size(); ++i) {
        EXPECT_EQ(builder.blocks.nnf.q_arith()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_delta_range()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_elliptic()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_lookup_type()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_poseidon2_external()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_poseidon2_internal()[i], 0);
    }
}

} // namespace bb

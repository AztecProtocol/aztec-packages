#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test suite for UltraCircuitBuilder non-native field methods
 *
 * Methods under test:
 * ---------------------------
 * evaluate_non_native_field_multiplication    (full a*b = q*p + r computation)
 * evaluate_non_native_field_addition          (add two non-native field elements)
 * evaluate_non_native_field_subtraction       (subtract two non-native field elements)
 * range_constrain_two_limbs                   (tested indirectly via multiplication tests)
 *
 * TODO: Tests needed for remaining non-native field methods:
 * ---------------------------
 * queue_partial_non_native_field_multiplication  (partial multiplication for caching/deduplication)
 * process_non_native_field_multiplications       (finalization: process cached multiplications)
 */
class UltraCircuitBuilderNonNative : public ::testing::Test {
  protected:
    static constexpr size_t LIMB_BITS = UltraCircuitBuilder::DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;

    // Splits a 256-bit integer into 4 68-bit limbs
    static std::array<fr, 4> split_into_limbs(const uint512_t& input)
    {
        std::array<fr, 4> limbs;
        limbs[0] = input.slice(0, LIMB_BITS).lo;
        limbs[1] = input.slice(LIMB_BITS * 1, LIMB_BITS * 2).lo;
        limbs[2] = input.slice(LIMB_BITS * 2, LIMB_BITS * 3).lo;
        limbs[3] = input.slice(LIMB_BITS * 3, LIMB_BITS * 4).lo;
        return limbs;
    }

    // Adds 4 limbs as circuit variables and returns their indices
    static std::array<uint32_t, 4> get_limb_witness_indices(UltraCircuitBuilder& builder,
                                                            const std::array<fr, 4>& limbs)
    {
        std::array<uint32_t, 4> limb_indices;
        limb_indices[0] = builder.add_variable(limbs[0]);
        limb_indices[1] = builder.add_variable(limbs[1]);
        limb_indices[2] = builder.add_variable(limbs[2]);
        limb_indices[3] = builder.add_variable(limbs[3]);
        return limb_indices;
    }

    // Helper to set up and evaluate a non-native field multiplication
    static std::array<uint32_t, 2> create_non_native_multiplication(UltraCircuitBuilder& builder,
                                                                    const uint256_t& a,
                                                                    const uint256_t& b,
                                                                    const uint256_t& q,
                                                                    const uint256_t& r,
                                                                    const uint256_t& modulus)
    {
        // Compute negative modulus: (-p) := 2^T - p
        const uint512_t BINARY_BASIS_MODULUS = uint512_t(1) << (LIMB_BITS * 4);
        auto modulus_limbs = split_into_limbs(BINARY_BASIS_MODULUS - uint512_t(modulus));

        // Add a, b, q, r as circuit variables
        const auto a_indices = get_limb_witness_indices(builder, split_into_limbs(uint256_t(a)));
        const auto b_indices = get_limb_witness_indices(builder, split_into_limbs(uint256_t(b)));
        const auto q_indices = get_limb_witness_indices(builder, split_into_limbs(uint256_t(q)));
        const auto r_indices = get_limb_witness_indices(builder, split_into_limbs(uint256_t(r)));

        // Prepare inputs for non-native multiplication gadget
        non_native_multiplication_witnesses<fr> inputs{
            a_indices, b_indices, q_indices, r_indices, modulus_limbs,
        };
        const auto [lo_1_idx, hi_1_idx] = builder.evaluate_non_native_field_multiplication(inputs);

        return { lo_1_idx, hi_1_idx };
    }

    // Compute quotient and remainder for a * b mod p
    static std::pair<uint256_t, uint256_t> compute_quotient_remainder(const uint256_t& a,
                                                                      const uint256_t& b,
                                                                      const uint256_t& modulus)
    {
        uint1024_t a_big = uint512_t(a);
        uint1024_t b_big = uint512_t(b);
        uint1024_t p_big = uint512_t(modulus);

        uint1024_t q_big = (a_big * b_big) / p_big;
        uint1024_t r_big = (a_big * b_big) % p_big;

        return { uint256_t(q_big.lo.lo), uint256_t(r_big.lo.lo) };
    }

    // Type aliases matching builder API for addition/subtraction
    using scaled_witness = std::pair<uint32_t, fr>;
    using add_simple = std::tuple<scaled_witness, scaled_witness, fr>;

    // Data structure for addition/subtraction test inputs
    struct AddSubData {
        std::array<fr, 4> x_limbs;
        std::array<fr, 4> y_limbs;
        fr x_prime;
        fr y_prime;
        std::array<fr, 4> x_scales;
        std::array<fr, 4> y_scales;
        std::array<fr, 4> addconsts;
        fr addconstp;
    };

    // Create random limb values for testing
    static AddSubData create_random_add_sub_data()
    {
        return AddSubData{
            .x_limbs = { fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element() },
            .y_limbs = { fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element() },
            .x_prime = fr::random_element(),
            .y_prime = fr::random_element(),
            .x_scales = { fr(1), fr(1), fr(1), fr(1) },
            .y_scales = { fr(1), fr(1), fr(1), fr(1) },
            .addconsts = { fr(0), fr(0), fr(0), fr(0) },
            .addconstp = fr(0),
        };
    }

    // Create add_simple tuples from test data and witness indices
    static std::tuple<add_simple, add_simple, add_simple, add_simple, std::tuple<uint32_t, uint32_t, fr>>
    create_add_sub_inputs(UltraCircuitBuilder& builder, const AddSubData& data)
    {
        // Add witness variables
        std::array<uint32_t, 4> x_idx, y_idx;
        for (size_t i = 0; i < 4; i++) {
            x_idx[i] = builder.add_variable(data.x_limbs[i]);
            y_idx[i] = builder.add_variable(data.y_limbs[i]);
        }
        uint32_t x_p_idx = builder.add_variable(data.x_prime);
        uint32_t y_p_idx = builder.add_variable(data.y_prime);

        // Build add_simple tuples: ((x_idx, x_scale), (y_idx, y_scale), addconst)
        add_simple limb0 = { { x_idx[0], data.x_scales[0] }, { y_idx[0], data.y_scales[0] }, data.addconsts[0] };
        add_simple limb1 = { { x_idx[1], data.x_scales[1] }, { y_idx[1], data.y_scales[1] }, data.addconsts[1] };
        add_simple limb2 = { { x_idx[2], data.x_scales[2] }, { y_idx[2], data.y_scales[2] }, data.addconsts[2] };
        add_simple limb3 = { { x_idx[3], data.x_scales[3] }, { y_idx[3], data.y_scales[3] }, data.addconsts[3] };
        auto limbp = std::make_tuple(x_p_idx, y_p_idx, data.addconstp);

        return { limb0, limb1, limb2, limb3, limbp };
    }
};

// Verifies that valid non-native field multiplications pass the circuit checker
TEST_F(UltraCircuitBuilderNonNative, Multiplication)
{
    const size_t num_iterations = 50;
    for (size_t i = 0; i < num_iterations; i++) {
        UltraCircuitBuilder builder;

        uint256_t a = uint256_t(fq::random_element());
        uint256_t b = uint256_t(fq::random_element());
        uint256_t modulus = fq::modulus;

        auto [q, r] = compute_quotient_remainder(a, b, modulus);
        const auto [lo_1_idx, hi_1_idx] = create_non_native_multiplication(builder, a, b, q, r, modulus);

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

// Regression test: carry limb > 2^70 requires fallback to default range checks
TEST_F(UltraCircuitBuilderNonNative, MultiplicationLargeCarryRegression)
{
    UltraCircuitBuilder builder;

    // Edge case values that produce carry > 2^70
    uint256_t a = uint256_t("0x00ab1504deacff852326adf4a01099e9340f232e2a631042852fce3c4eb8a51b");
    uint256_t b = uint256_t("0x1be457323502cfcd85f8cfa54c8c4fea146b9db2a7d86b29d966d61b714ee249");
    uint256_t q_expected = uint256_t("0x00629b9d576dfc6b5c28a4a254d5e8e3384124f6a898858e95265254a01414d5");
    uint256_t r_expected = uint256_t("0x2c1590eb70a48dce72f7686bbf79b59bf7926c99bc16aba92e474c65a04ea2a0");
    uint256_t modulus = fq::modulus;

    // Verify that our expected q, r are correct
    auto [q_computed, r_computed] = compute_quotient_remainder(a, b, modulus);
    EXPECT_EQ(q_computed, q_expected);
    EXPECT_EQ(r_computed, r_expected);

    // This edge case leads to the carry limb being > 2^70, so it used to fail when applying a 2^70 range check
    // (with range_constrain_two_limbs). Now it should work since we fallback to default range checks in such a case.
    const auto [lo_1_idx, hi_1_idx] = create_non_native_multiplication(builder, a, b, q_expected, r_expected, modulus);

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

// Verifies that the NNF block only contains NNF gates (other selectors are zero)
TEST_F(UltraCircuitBuilderNonNative, BlockSelectorIsolation)
{
    UltraCircuitBuilder builder;

    uint256_t a = uint256_t(fq::random_element());
    uint256_t b = uint256_t(fq::random_element());
    uint256_t modulus = fq::modulus;

    auto [q, r] = compute_quotient_remainder(a, b, modulus);
    const auto [lo_1_idx, hi_1_idx] = create_non_native_multiplication(builder, a, b, q, r, modulus);

    // Range check the carry (output) lo and hi limbs
    const bool is_low_70_bits = uint256_t(builder.get_variable(lo_1_idx)).get_msb() < 70;
    const bool is_high_70_bits = uint256_t(builder.get_variable(hi_1_idx)).get_msb() < 70;
    if (is_low_70_bits && is_high_70_bits) {
        builder.range_constrain_two_limbs(lo_1_idx, hi_1_idx, 70, 70);
    } else {
        builder.decompose_into_default_range(lo_1_idx, 72);
        builder.decompose_into_default_range(hi_1_idx, 72);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Verify that in the NNF block, all non-NNF selectors are zero
    for (size_t i = 0; i < builder.blocks.nnf.size(); ++i) {
        EXPECT_EQ(builder.blocks.nnf.q_arith()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_delta_range()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_elliptic()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_lookup()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_poseidon2_external()[i], 0);
        EXPECT_EQ(builder.blocks.nnf.q_poseidon2_internal()[i], 0);
    }
}

// Verifies non-native field addition with various scaling factors
TEST_F(UltraCircuitBuilderNonNative, Addition)
{
    // Test with identity scaling (z = x + y)
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_addition(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Test with different scaling factors per limb and non-zero addconstp
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        data.x_scales = { fr(2), fr(3), fr(5), fr(7) };
        data.y_scales = { fr(11), fr(13), fr(17), fr(19) };
        data.addconsts = { fr(100), fr(200), fr(300), fr(400) };
        data.addconstp = fr(500);

        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_addition(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Test with negative and zero scaling factors
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        data.x_scales = { fr(-1), fr(0), fr(1), fr(-2) };
        data.y_scales = { fr(1), fr(-1), fr(0), fr(2) };
        data.addconsts = { fr(0), fr(-50), fr(50), fr(0) };
        data.addconstp = fr(-100);

        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_addition(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Edge case: all zeros
    {
        UltraCircuitBuilder builder;
        AddSubData data{
            .x_limbs = { fr(0), fr(0), fr(0), fr(0) },
            .y_limbs = { fr(0), fr(0), fr(0), fr(0) },
            .x_prime = fr(0),
            .y_prime = fr(0),
            .x_scales = { fr(1), fr(1), fr(1), fr(1) },
            .y_scales = { fr(1), fr(1), fr(1), fr(1) },
            .addconsts = { fr(0), fr(0), fr(0), fr(0) },
            .addconstp = fr(0),
        };
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_addition(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Edge case: x == y (doubling)
    {
        UltraCircuitBuilder builder;
        fr val0 = fr::random_element();
        fr val1 = fr::random_element();
        fr val2 = fr::random_element();
        fr val3 = fr::random_element();
        fr valp = fr::random_element();
        AddSubData data{
            .x_limbs = { val0, val1, val2, val3 },
            .y_limbs = { val0, val1, val2, val3 },
            .x_prime = valp,
            .y_prime = valp,
            .x_scales = { fr(1), fr(1), fr(1), fr(1) },
            .y_scales = { fr(1), fr(1), fr(1), fr(1) },
            .addconsts = { fr(0), fr(0), fr(0), fr(0) },
            .addconstp = fr(0),
        };
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_addition(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

// Verifies non-native field subtraction with various scaling factors
TEST_F(UltraCircuitBuilderNonNative, Subtraction)
{
    // Test with identity scaling (z = x - y)
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_subtraction(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Test with different scaling factors per limb and non-zero addconstp
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        data.x_scales = { fr(2), fr(3), fr(5), fr(7) };
        data.y_scales = { fr(11), fr(13), fr(17), fr(19) };
        data.addconsts = { fr(100), fr(200), fr(300), fr(400) };
        data.addconstp = fr(500);

        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_subtraction(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Test with negative and zero scaling factors
    {
        UltraCircuitBuilder builder;
        auto data = create_random_add_sub_data();
        data.x_scales = { fr(-1), fr(0), fr(1), fr(-2) };
        data.y_scales = { fr(1), fr(-1), fr(0), fr(2) };
        data.addconsts = { fr(0), fr(-50), fr(50), fr(0) };
        data.addconstp = fr(-100);

        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_subtraction(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Edge case: all zeros
    {
        UltraCircuitBuilder builder;
        AddSubData data{
            .x_limbs = { fr(0), fr(0), fr(0), fr(0) },
            .y_limbs = { fr(0), fr(0), fr(0), fr(0) },
            .x_prime = fr(0),
            .y_prime = fr(0),
            .x_scales = { fr(1), fr(1), fr(1), fr(1) },
            .y_scales = { fr(1), fr(1), fr(1), fr(1) },
            .addconsts = { fr(0), fr(0), fr(0), fr(0) },
            .addconstp = fr(0),
        };
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_subtraction(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    // Edge case: x == y (result is zero)
    {
        UltraCircuitBuilder builder;
        fr val0 = fr::random_element();
        fr val1 = fr::random_element();
        fr val2 = fr::random_element();
        fr val3 = fr::random_element();
        fr valp = fr::random_element();
        AddSubData data{
            .x_limbs = { val0, val1, val2, val3 },
            .y_limbs = { val0, val1, val2, val3 },
            .x_prime = valp,
            .y_prime = valp,
            .x_scales = { fr(1), fr(1), fr(1), fr(1) },
            .y_scales = { fr(1), fr(1), fr(1), fr(1) },
            .addconsts = { fr(0), fr(0), fr(0), fr(0) },
            .addconstp = fr(0),
        };
        auto [limb0, limb1, limb2, limb3, limbp] = create_add_sub_inputs(builder, data);
        builder.evaluate_non_native_field_subtraction(limb0, limb1, limb2, limb3, limbp);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
}

// Verifies that providing incorrect witnesses to multiplication causes failure
TEST_F(UltraCircuitBuilderNonNative, MultiplicationInvalidWitnessFailure)
{
    // Helper to test that providing incorrect quotient/remainder causes failure
    auto test_incorrect_qr = [](bool tamper_q, size_t limb_idx) {
        UltraCircuitBuilder builder;

        uint256_t a = uint256_t(fq::random_element());
        uint256_t b = uint256_t(fq::random_element());
        uint256_t modulus = fq::modulus;
        auto [q, r] = compute_quotient_remainder(a, b, modulus);

        // Tamper with quotient or remainder
        if (tamper_q) {
            // Add 1 to a specific limb of q
            auto q_limbs = split_into_limbs(uint256_t(q));
            q_limbs[limb_idx] += fr(1);
            q = uint256_t(q_limbs[0]) + (uint256_t(q_limbs[1]) << LIMB_BITS) +
                (uint256_t(q_limbs[2]) << (LIMB_BITS * 2)) + (uint256_t(q_limbs[3]) << (LIMB_BITS * 3));
        } else {
            // Add 1 to a specific limb of r
            auto r_limbs = split_into_limbs(uint256_t(r));
            r_limbs[limb_idx] += fr(1);
            r = uint256_t(r_limbs[0]) + (uint256_t(r_limbs[1]) << LIMB_BITS) +
                (uint256_t(r_limbs[2]) << (LIMB_BITS * 2)) + (uint256_t(r_limbs[3]) << (LIMB_BITS * 3));
        }

        // Now a*b != q*p + r (the multiplication identity is violated)
        const auto [lo_idx, hi_idx] = create_non_native_multiplication(builder, a, b, q, r, modulus);

        // Add range constraints
        builder.decompose_into_default_range(lo_idx, 72);
        builder.decompose_into_default_range(hi_idx, 72);

        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // Test tampering with each limb of q and r
    for (size_t limb = 0; limb < 4; limb++) {
        test_incorrect_qr(true, limb);  // tamper q
        test_incorrect_qr(false, limb); // tamper r
    }
}

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "failure_test_utils.hpp"
#include "ultra_honk.test.hpp"

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = testing::Types<UltraFlavor,
                                   UltraZKFlavor,
                                   UltraKeccakFlavor,
                                   UltraKeccakZKFlavor,
                                   UltraRollupFlavor,
                                   UltraStarknetFlavor,
                                   UltraStarknetZKFlavor>;
#else
using FlavorTypes =
    testing::Types<UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraRollupFlavor>;
#endif
template <typename T> using RangeTests = UltraHonkTests<T>;
TYPED_TEST_SUITE(RangeTests, FlavorTypes);

/***************************************************************************************************
 * enforce_small_deltas tests
 * These test the low-level delta constraint: consecutive values must differ by at most 3.
 ***************************************************************************************************/

// Basic test: sorted sequence [1,2,3,4] has deltas of 1, which is valid
TYPED_TEST(RangeTests, EnforceSmallDeltasBasic)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4 });
    builder.enforce_small_deltas(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Sequence with max delta of 3 and duplicates: all deltas in {0,1,2,3}
TYPED_TEST(RangeTests, EnforceSmallDeltasWithDuplicatesAndMaxDelta)
{
    auto builder = UltraCircuitBuilder();
    // Deltas: 2, 1, 3, 0, 1, 3, 3, 1, 0, 3, 1, 2, 0, 3, 1, 1, 1, 3, 2
    auto idx = TestFixture::add_variables(builder,
                                          { 1, 3, 4, 7, 7, 8, 11, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 });
    builder.enforce_small_deltas(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// FAILURE: delta of 5 (from 3 to 8) exceeds maximum of 3
TYPED_TEST(RangeTests, EnforceSmallDeltasFailsDeltaTooLarge)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 8 }); // delta from 3 to 8 is 5
    builder.enforce_small_deltas(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

// FAILURE: sequence not sorted (16 comes before 14)
TYPED_TEST(RangeTests, EnforceSmallDeltasFailsNotSorted)
{
    auto builder = UltraCircuitBuilder();
    // 16 appears before 14, causing a negative delta (wraps to large positive in field)
    auto idx = TestFixture::add_variables(builder,
                                          { 1, 3, 4, 7, 7, 8, 16, 14, 15, 15, 18, 19, 21, 21, 24, 25, 26, 27, 30, 32 });
    builder.enforce_small_deltas(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

/***************************************************************************************************
 * create_sort_constraint_with_edges tests
 * These test delta constraints with explicit start and end boundary checks.
 ***************************************************************************************************/

// Basic test: sequence [1..8] with start=1, end=8
TYPED_TEST(RangeTests, SortConstraintWithEdgesBasic)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    builder.create_sort_constraint_with_edges(idx, /*start=*/1, /*end=*/8);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Complex sequence with duplicates and varying deltas, all within bounds
TYPED_TEST(RangeTests, SortConstraintWithEdgesComplex)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1,  2,  5,  6,  7,  10, 11, 13, 16, 17, 20, 22, 22, 25,
                                                     26, 29, 29, 32, 32, 33, 35, 38, 39, 39, 42, 42, 43, 45 });
    builder.create_sort_constraint_with_edges(idx, /*start=*/1, /*end=*/45);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// FAILURE: end constraint not satisfied (actual end is 8, but we claim end=7)
TYPED_TEST(RangeTests, SortConstraintWithEdgesFailsWrongEnd)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    builder.create_sort_constraint_with_edges(idx, /*start=*/1, /*end=*/7); // actual end is 8

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

// FAILURE: start constraint not satisfied (actual start is 1, but we claim start=2)
TYPED_TEST(RangeTests, SortConstraintWithEdgesFailsWrongStart)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    builder.create_sort_constraint_with_edges(idx, /*start=*/2, /*end=*/8); // actual start is 1

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

// FAILURE: delta too large (15 appears where small delta expected)
TYPED_TEST(RangeTests, SortConstraintWithEdgesFailsDeltaTooLarge)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 15, 3, 4, 5, 6, 7, 8 }); // 1 to 15 is delta of 14
    builder.create_sort_constraint_with_edges(idx, /*start=*/2, /*end=*/8);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

/***************************************************************************************************
 * create_small_range_constraint tests
 * Range is [0, target_range] (inclusive).
 ***************************************************************************************************/

// Basic test: values [1..8] all in range [0, 8]
TYPED_TEST(RangeTests, SmallRangeConstraintBasic)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/8);
    }
    builder.create_unconstrained_gates(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Single value at exact boundary: 3 in range [0, 3]
TYPED_TEST(RangeTests, SmallRangeConstraintAtBoundary)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 3 });
    builder.create_small_range_constraint(idx[0], /*target_range=*/3);
    builder.create_unconstrained_gates(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Multiple values with various ranges, all valid
TYPED_TEST(RangeTests, SmallRangeConstraintMultipleValues)
{
    auto builder = UltraCircuitBuilder();
    auto idx =
        TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/128);
    }
    builder.create_unconstrained_gates(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// FAILURE: value 25 exceeds range [0, 8]
TYPED_TEST(RangeTests, SmallRangeConstraintFailsValueTooLarge)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 8, 25 }); // 25 > 8
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/8);
    }
    builder.enforce_small_deltas(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

// FAILURE: value 80 exceeds range [0, 79]
TYPED_TEST(RangeTests, SmallRangeConstraintFailsValueJustOverBoundary)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(
        builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 }); // 80 > 79
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/79);
    }
    builder.create_unconstrained_gates(idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

// FAILURE: orphan variable (not in any gate) causes GPA failure. This is a quirk of `create_small_range_constraint`.
TYPED_TEST(RangeTests, SmallRangeConstraintFailsOrphanVariable)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/8);
    }
    // NOT calling create_unconstrained_gates - variables are orphans
    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/false);
}

/***************************************************************************************************
 * Range constraints combined with arithmetic gates
 ***************************************************************************************************/

// Range constraints work alongside arithmetic gates
TYPED_TEST(RangeTests, RangeConstraintWithArithmeticGates)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/8);
    }

    // Add arithmetic constraints: 1+2=3, 3+4=7, 5+6=11, 7+8=15
    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Non-power-of-two range works correctly
TYPED_TEST(RangeTests, RangeConstraintNonPowerOfTwo)
{
    auto builder = UltraCircuitBuilder();
    auto idx = TestFixture::add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (auto i : idx) {
        builder.create_small_range_constraint(i, /*target_range=*/12); // not a power of 2
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/**
 * @brief Test that multiple range constraints on the same small witness all pass.
 */
TYPED_TEST(RangeTests, MultipleRangeConstraintsOnSmallWitness)
{
    auto builder = UltraCircuitBuilder();

    uint32_t witness_idx = builder.add_variable(fr(5));

    // Apply multiple range constraints with different target ranges
    builder.create_small_range_constraint(witness_idx, /*target_range=*/8);
    builder.create_small_range_constraint(witness_idx, /*target_range=*/6);
    builder.create_small_range_constraint(witness_idx, /*target_range=*/10);
    builder.create_small_range_constraint(witness_idx, /*target_range=*/100);

    // Add unconstrained gate to prevent orphan variable failure
    builder.create_unconstrained_gates({ witness_idx });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}
/***************************************************************************************************
 * create_limbed_range_constraint tests
 * For large ranges (> 14 bits), decompose into smaller limbs.
 ***************************************************************************************************/

// Boundary case: exactly 14 bits (single limb, at DEFAULT_PLOOKUP_RANGE_BITNUM)
TYPED_TEST(RangeTests, LimbedRangeConstraint14Bits)
{
    auto builder = UltraCircuitBuilder();

    // Create a value that fits in exactly 14 bits (max value = 16383 = 2^14 - 1)
    auto value = fr(16383);

    auto idx = builder.add_variable(value);
    // NOTE: we do not need to create an auxiliary arithmetic gate; the `create_limbed_range_constraint` functionality
    // prevents `idx` from being orphaned.
    builder.create_limbed_range_constraint(idx, /*num_bits=*/14);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Large range constraint using limb decomposition (133 bits)
TYPED_TEST(RangeTests, LimbedRangeConstraint133Bits)
{
    auto builder = UltraCircuitBuilder();

    // Create a random value that fits in 133 bits
    auto random_field = fr::random_element();
    auto truncated = uint256_t(random_field).slice(0, 133);
    auto value = fr(truncated);

    auto idx = builder.add_variable(value);
    builder.create_add_gate({ idx, builder.zero_idx(), builder.zero_idx(), 1, 0, 0, -value });
    builder.create_limbed_range_constraint(idx, /*num_bits=*/133);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

// Edge-case range constraint using limb decomposition. Here, `253 == MAX_NUM_BITS_RANGE_CONSTRAINT`.
TYPED_TEST(RangeTests, LimbedRangeConstraint253Bits)
{
    auto builder = UltraCircuitBuilder();

    // Create a random value that fits in 253 bits
    auto random_field = fr::random_element();
    auto truncated = uint256_t(random_field).slice(0, 253);
    auto value = fr(truncated);

    auto idx = builder.add_variable(value);
    builder.create_limbed_range_constraint(idx, /*num_bits=*/253);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/***************************************************************************************************
 * create_dyadic_range_constraint tests
 * Main entry point that handles orphan variables by adding dummy arithmetic gates.
 ***************************************************************************************************/

/**
 * @brief Test that a range constraint on an "orphan" variable (not used in any other gate) works.
 * @details The `create_dyadic_range_constraint` function adds a dummy arithmetic gate to ensure the
 * variable appears in a wire, which is required for the generalized permutation argument to work.
 */
TYPED_TEST(RangeTests, DyadicRangeConstraintOnOrphanVariable)
{
    auto builder = UltraCircuitBuilder();

    // Create a variable that will ONLY be range-constrained, not used in any other gate
    auto orphan_idx = builder.add_variable(fr(100));
    builder.create_dyadic_range_constraint(orphan_idx, /*num_bits=*/8, "orphan range constraint");

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/***************************************************************************************************
 * Copy constraint interaction tests
 * Tests that (multiple) range constraints work correctly copy constraints.
 ***************************************************************************************************/

/**
 * @brief Test range constraints on variables linked by assert_equal.
 * @details Multiple variables with the same value are linked via assert_equal, then each is
 * given a different range constraint. The tightest constraint (999) should apply to all.
 */
TYPED_TEST(RangeTests, RangeConstraintsOnDuplicateVariables)
{
    auto builder = UltraCircuitBuilder();

    uint32_t a = builder.add_variable(fr(100));
    uint32_t b = builder.add_variable(fr(100));
    uint32_t c = builder.add_variable(fr(100));
    uint32_t d = builder.add_variable(fr(100));

    // Link all variables together via copy constraints
    builder.assert_equal(a, b);
    builder.assert_equal(a, c);
    builder.assert_equal(a, d);

    // Apply different range constraints to each (tightest is 999)
    builder.create_small_range_constraint(a, /*target_range=*/1000);
    builder.create_small_range_constraint(b, /*target_range=*/1001);
    builder.create_small_range_constraint(c, /*target_range=*/999);
    builder.create_small_range_constraint(d, /*target_range=*/1000);

    builder.create_unconstrained_gates({ a, b, c, d });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

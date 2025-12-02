#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/relation_checker.hpp"
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
template <typename T> using PermutationTests = UltraHonkTests<T>;
TYPED_TEST_SUITE(PermutationTests, FlavorTypes);
using NonZKFlavorTypes = testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor>;
template <typename T> using PermutationNonZKTests = UltraHonkTests<T>;
TYPED_TEST_SUITE(PermutationNonZKTests, NonZKFlavorTypes);

/**
 * @brief Test that multiset-equality checks work.
 *
 * @details Tags provide a mechanism to enforce multiset-equality checks. In our codebase, this is mediated by a
 * "permutation on tags", tau, which is, for our examples, always of order 2, i.e., the product of disjoint
 * transpositions.  This test creates two tags, linked via a tau transposition, then assigns:
 *   - first_tag to variables with values {x, y}
 *   - second_tag to variables with values {y, x}
 *
 * The tag permutation check verifies that the multiset of values with first_tag equals
 * the multiset of values with second_tag (after applying tau). Here both multisets are {x, y},
 * so the check passes.
 */
TYPED_TEST(PermutationTests, NonTrivialTagPermutation)
{
    auto builder = UltraCircuitBuilder();

    // Create two distinct values
    fr x = fr::random_element();
    fr y = -x;

    // first multiset {x, y}
    auto x1_idx = builder.add_variable(x);
    auto y1_idx = builder.add_variable(y);

    // second multiset {y, x}
    auto y2_idx = builder.add_variable(y);
    auto x2_idx = builder.add_variable(x);

    // Dummy gates to include variables in the trace
    builder.create_add_gate({ x1_idx, y1_idx, builder.zero_idx(), 1, 1, 0, 0 });
    builder.create_add_gate({ y2_idx, x2_idx, builder.zero_idx(), 1, 1, 0, 0 });

    // Set up tag transposition: first_tag <-> second_tag
    auto first_tag = builder.get_new_tag();
    auto second_tag = builder.get_new_tag();
    builder.set_tau_transposition(first_tag, second_tag);

    // Assign tags: first_tag -> {x, y}, second_tag -> {y, x}
    builder.assign_tag(x1_idx, first_tag);
    builder.assign_tag(y1_idx, first_tag);
    builder.assign_tag(y2_idx, second_tag);
    builder.assign_tag(x2_idx, second_tag);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/**
 * @brief Test that generalized permutation argument works, i.e., copy constraints + multiset-equality checks.
 *
 * @details The generalized permutation argument is a way to test both copy constraints and multiset-equality checks.
 * This test checks that these two features work compatibly, by setting up
 *   1. copy constraints via assert_equal(); and
 *   2. multiset-equality checks via tags.
 *
 * The test verifies that both mechanisms can coexist: the grand product argument must account for
 * both the wire permutation cycles AND the tag-based multiset equality check.
 */
TYPED_TEST(PermutationTests, NonTrivialGeneralizedPerm)
{
    auto builder = UltraCircuitBuilder();

    fr x = fr::random_element();
    fr y = -x;

    // Helper to create a pair of equal variables (linked by copy constraint)
    auto add_equal_pair = [&](fr value) {
        auto idx1 = builder.add_variable(value);
        auto idx2 = builder.add_variable(value);
        builder.assert_equal(idx1, idx2);
        return std::make_pair(idx1, idx2);
    };

    // Create pairs of equal variables
    auto [x1_idx, x1_copy_idx] = add_equal_pair(x);
    auto [y1_idx, y1_copy_idx] = add_equal_pair(y);
    auto [x2_idx, x2_copy_idx] = add_equal_pair(x);
    auto [y2_idx, y2_copy_idx] = add_equal_pair(y);

    // Set up tag transposition for multiset-equality check
    auto first_tag = builder.get_new_tag();
    auto second_tag = builder.get_new_tag();
    builder.set_tau_transposition(first_tag, second_tag);

    // first_tag -> {x, y}, second_tag -> {x, y} (same multisets)
    builder.assign_tag(x1_idx, first_tag);
    builder.assign_tag(y1_idx, first_tag);
    builder.assign_tag(x2_idx, second_tag);
    builder.assign_tag(y2_idx, second_tag);

    // Dummy gates using copy variables (z1 - z2 = 0)
    builder.create_add_gate({ x1_copy_idx, x1_idx, builder.zero_idx(), 1, -1, 0, 0 });
    builder.create_add_gate({ y1_idx, y2_idx, builder.zero_idx(), 1, -1, 0, 0 });
    builder.create_add_gate({ x2_idx, x2_copy_idx, builder.zero_idx(), 1, -1, 0, 0 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
    TestFixture::prove_and_verify(builder, /*expected_result=*/true);
}

/**
 * @brief Multiset-equality failure test
 *
 * @details This test verifies that multiset-equality check fails when the multisets are not equal.
 * It creates a circuit where the multisets are:
 *   - {x, y}
 *   - {y, x+1}
 *
 * The second sub-test creates the same circuit WITHOUT tags to confirm that the circuit's
 * arithmetic constraints are satisfied, proving the failure above is due to multiset-equality mismatch.
 */
TYPED_TEST(PermutationTests, BadTagPermutation)
{
    // With tags: multisets {x, y} vs {y, x+1} are NOT equal, so verification should FAIL
    {
        auto builder = UltraCircuitBuilder();

        fr x = fr::random_element();
        fr y = -x;

        // multiset: {x, y}
        auto x1_idx = builder.add_variable(x);
        auto y1_idx = builder.add_variable(y);

        // multiset: {y, x+1}
        auto y2_idx = builder.add_variable(y);
        auto x_plus_1_idx = builder.add_variable(x + 1);

        // Dummy gates: x + y = 0, y + (x+1) = 1
        builder.create_add_gate({ x1_idx, y1_idx, builder.zero_idx(), 1, 1, 0, 0 });
        builder.create_add_gate({ y2_idx, x_plus_1_idx, builder.zero_idx(), 1, 1, 0, -1 });

        auto first_tag = builder.get_new_tag();
        auto second_tag = builder.get_new_tag();
        builder.set_tau_transposition(first_tag, second_tag);

        builder.assign_tag(x1_idx, first_tag);
        builder.assign_tag(y1_idx, first_tag);
        builder.assign_tag(y2_idx, second_tag);
        builder.assign_tag(x_plus_1_idx, second_tag);

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
        TestFixture::prove_and_verify(builder, /*expected_result=*/false);
    }
    // Without tags: same circuit passes, confirming failure above is due to tag mismatch
    {
        auto builder = UltraCircuitBuilder();

        fr x = fr::random_element();
        fr y = -x;

        auto x1_idx = builder.add_variable(x);
        auto y1_idx = builder.add_variable(y);
        auto y2_idx = builder.add_variable(y);
        auto x_plus_1_idx = builder.add_variable(x + 1);

        builder.create_add_gate({ x1_idx, y1_idx, builder.zero_idx(), 1, 1, 0, 0 });
        builder.create_add_gate({ y2_idx, x_plus_1_idx, builder.zero_idx(), 1, 1, 0, -1 });

        TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);
        TestFixture::prove_and_verify(builder, /*expected_result=*/true);
    }
}

/**
 * @brief Test that zeroing out the z_perm grand product polynomial causes relation check failure.
 *
 * @details The z_perm polynomial is the grand product accumulator for the permutation argument.
 * It must satisfy specific recurrence relations at each row. This test:
 *   1. Builds a valid circuit with a copy constraint (a_idx == a_copy_idx)
 *   2. Verifies the permutation relation initially holds
 *   3. Tampers with z_perm by setting all values to zero
 *   4. Verifies the permutation relation now fails
 *
 * This confirms that z_perm cannot be arbitrarily modified without detection.
 *
 * @note This test excludes ZK flavors because we manually tamper with z_perm, which would
 * conflict with the ZK masking applied to witness polynomials.
 * @note This test does not use `prove_and_verify`. Indeed, there is no straightforward way to tamper with z_perm,
 * created after finalization, using `prove_and_verify`.
 */
TYPED_TEST(PermutationNonZKTests, ZPermZeroedOutFailure)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;

    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    using Prover = TestFixture::Prover;

    Builder builder;

    auto a = fr::random_element();
    auto b = fr::random_element();
    auto c = a + b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t a_copy_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.create_add_gate({ a_copy_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.assert_equal(a_copy_idx, a_idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();
    auto& z_perm = prover_instance->polynomials.z_perm;

    // First verify that the Permutation relation holds.
    auto permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials, prover_instance->relation_parameters, "UltraPermutation - Before Tampering");
    EXPECT_TRUE(permutation_relation_failures.empty());

    // Tamper: zero-out z_perm
    for (size_t i = z_perm.start_index(); i < z_perm.end_index(); ++i) {
        z_perm.at(i) = fr(0);
    }
    prover_instance->polynomials.set_shifted();
    auto tampered_permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials,
        prover_instance->relation_parameters,
        "UltraPermutation - After zeroing out z_perm");
    // Verify that the Permutation relation now fails
    EXPECT_FALSE(tampered_permutation_relation_failures.empty());
}

/**
 * @brief Test that z_perm_shift must be zero at the last row (where lagrange_last = 1).
 *
 * @details The permutation argument includes a boundary constraint: z_perm_shift * lagrange_last = 0.
 *
 * This test:
 *   1. Builds a valid circuit and verifies the permutation relation holds
 *   2. Expands z_perm and z_perm_shift to full polynomials (to access the boundary)
 *   3. Tampers with z_perm_shift at the lagrange_last position, making it non-zero
 *   4. Verifies the permutation relation now fails at that row
 *
 * @note This test excludes ZK flavors because we manually tamper with z_perm, which would
 * conflict with the ZK masking applied to witness polynomials.
 */
TYPED_TEST(PermutationNonZKTests, ZPermShiftNotZeroAtLagrangeLastFailure)
{
    using Flavor = TypeParam;
    using Builder = typename Flavor::CircuitBuilder;

    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    using Prover = TestFixture::Prover;

    Builder builder;

    auto a = fr::random_element();
    auto b = fr::random_element();
    auto c = a + b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t a_copy_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.create_add_gate({ a_copy_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.assert_equal(a_copy_idx, a_idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    // first verify that the Permutation relation holds.
    auto permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials, prover_instance->relation_parameters, "UltraPermutation - Before Tampering");
    EXPECT_TRUE(permutation_relation_failures.empty());
    // we make z_perm and z_perm_shift full polynomials to tamper with values that are outside the usual allocated
    // range. This allows us to failure test for the subrelation `z_perm_shift * lagrange_last == 0`.
    auto& z_perm = prover_instance->polynomials.z_perm;
    auto last_valid_index = z_perm.end_index();
    auto& z_perm_shift = prover_instance->polynomials.z_perm_shift;
    // make the polynomial full to tamper with a last value.
    prover_instance->polynomials.z_perm = z_perm.full();
    prover_instance->polynomials.z_perm_shift = z_perm_shift.full();

    ASSERT_EQ(prover_instance->polynomials.lagrange_last.at(last_valid_index - 1), fr(1));
    ASSERT_EQ(prover_instance->polynomials.z_perm.at(last_valid_index), fr(0));
    ASSERT_EQ(prover_instance->polynomials.z_perm_shift.at(last_valid_index - 1), fr(0));
    // Tamper: change `z_perm_shift` to something non-zero when `lagrange_last == 1`.
    prover_instance->polynomials.z_perm_shift.at(last_valid_index - 1) += fr(1);
    // Note that `z_perm_shift` and `z_perm` are no longer inextricably linked because we have replaced them by their
    // full incarnations. Therefore, we still `z_perm.at(last_valid_index) == 0`. This does not effect the test we
    // wish to check.

    // Verify that the Permutation relation now fails.
    auto tampered_permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials,
        prover_instance->relation_parameters,
        "UltraPermutation - After incrementing z_perm_shift where lagrange_last is 1");
    EXPECT_FALSE(tampered_permutation_relation_failures.empty());
    // the first subrelation first fails at `row_idx == last_valid_index - 1`.
    ASSERT_EQ(tampered_permutation_relation_failures[1], last_valid_index - 1);
}

/**
 * @brief Test that tampering with a sigma polynomial breaks the permutation argument boundary check.
 *
 * @details The sigma polynomials encode copy cycles. In this test, we tamper with sigma in a place implicated by the
 * copy-constriant and ensure that the relevant subrelation fails, both when we don't update `z_perm` and when we do.
 *
 *
 * @note There are no tags/multiset-equality checks in this test.
 * @note We exclude ZK flavors because we manually tamper with precomputed polynomials.
 */
TYPED_TEST(PermutationNonZKTests, SigmaCorruptionFailure)
{
    using Flavor = TypeParam;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = typename TestFixture::Prover;

    auto builder = UltraCircuitBuilder();

    // Create variables with a copy constraint
    auto a = fr::random_element();
    auto b = fr::random_element();
    auto c = a + b;

    uint32_t a_idx = builder.add_variable(a);
    uint32_t a_copy_idx = builder.add_variable(a);
    uint32_t b_idx = builder.add_variable(b);
    uint32_t c_idx = builder.add_variable(c);

    // Gates using a_idx and a_copy_idx (which should be equal)
    builder.create_add_gate({ a_idx, b_idx, c_idx, 1, 1, -1, 0 });
    builder.create_add_gate({ a_copy_idx, b_idx, c_idx, 1, 1, -1, 0 });
    // copy cycle we'll break
    builder.assert_equal(a_copy_idx, a_idx);

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    // Construct proof to compute z_perm
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    // The Permutation relation holds before tampering
    auto permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials, prover_instance->relation_parameters, "Permutation Relation - Before Tampering");
    ASSERT_TRUE(permutation_relation_failures.empty());

    // TAMPER: Corrupt sigma_1 at a row that's part of the copy cycle.

    auto& sigma_1 = prover_instance->polynomials.sigma_1;
    auto& id_1 = prover_instance->polynomials.id_1;

    // Find the first row that's part of a non-trivial cycle (sigma != id)
    size_t row_to_corrupt = 0;
    for (size_t row = 1; row < sigma_1.size(); ++row) {
        if (sigma_1.at(row) != id_1.at(row)) {
            row_to_corrupt = row;
            vinfo("Found copy cycle at row ", row, "; will corrupt this one");
            break;
        }
    }
    ASSERT_NE(row_to_corrupt, 0) << "No copy cycle found in sigma_1!";

    fr original_value = sigma_1.at(row_to_corrupt);
    sigma_1.at(row_to_corrupt) = original_value + fr(1); // Break the cycle by pointing elsewhere
    // We perform two distinct tests.
    //
    // Failure test 1: make sure that the subrelation fails when when we change sigma_1 without updating z_perm.
    {
        auto failures_of_tampered_instance = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
            prover_instance->polynomials,
            prover_instance->relation_parameters,
            "Permutation Relation - After corrupting sigma_1");

        ASSERT_TRUE(failures_of_tampered_instance.at(0));
    }
    // Failure test 2: make sure the subrelation fails when we DO update z_perm
    {
        // Sanity check: if we are recompute z_perm, the first different value will be at `row_to_corrupt + 1`. Store
        // this to ensure that this value indeed changes.
        auto& z_perm = prover_instance->polynomials.z_perm;
        auto z_perm_before = z_perm.at(row_to_corrupt + 1);

        // Recompute z_perm with the corrupted sigma.
        size_t real_circuit_size = prover_instance->get_final_active_wire_idx() + 1;
        compute_grand_product<Flavor, UltraPermutationRelation<fr>>(
            prover_instance->polynomials, prover_instance->relation_parameters, real_circuit_size);
        prover_instance->polynomials.set_shifted(); // Refresh z_perm_shift

        // Verify z_perm actually changed after recomputation with corrupted sigma
        auto z_perm_after = z_perm.at(row_to_corrupt + 1);
        ASSERT_NE(z_perm_before, z_perm_after) << "z_perm should change after recomputing with corrupted sigma";

        // After recomputing z_perm, we expect a failure at the very last active wire.
        auto failures_of_tampered_instance = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
            prover_instance->polynomials,
            prover_instance->relation_parameters,
            "Permutation Relation - After corrupting sigma_1 and recomputing z_perm");

        ASSERT_EQ(failures_of_tampered_instance.at(0), real_circuit_size - 1)
            << "Expected failure at row " << (real_circuit_size - 1) << " (the recomputation boundary)";
    }
}

/**
 * @brief Test that tampering with public_input_delta causes the permutation relation to fail.
 *
 * @details The permutation argument intentionally "breaks" cycles for public inputs by setting
 * σ⁰(i) = -(i+1) instead of the normal cycle mapping, where i is the index of a public input. The public_input_delta
 * compensates for this:
 *
 *        δ_pub = ∏ (γ + xᵢ + β(n+i)) / ∏ (γ + xᵢ - β(1+i))
 *
 * The prover's z_perm grand product is computed using the actual wire values at public input positions.
 * If public_input_delta is recomputed with different public input values, it won't match what z_perm
 * expects, causing the permutation relation to fail.
 *
 * @note We exclude ZK flavors because we manually tamper with relation parameters.
 */
TYPED_TEST(PermutationNonZKTests, PublicInputDeltaMismatch)
{
    using Flavor = TypeParam;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = typename TestFixture::Prover;

    auto builder = UltraCircuitBuilder();

    // Add a public input
    fr public_value = fr(314159);
    auto pub_var = builder.add_public_variable(public_value);

    // Use the public input in a simple constraint so it appears in the trace
    auto private_val = fr::random_element();
    auto private_var = builder.add_variable(private_val);
    auto result_var = builder.add_variable(public_value + private_val);
    builder.create_add_gate({ pub_var, private_var, result_var, 1, 1, -1, 0 });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

    // Construct proof to compute z_perm (with correct public_input_delta)
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    // Verify the permutation relation holds before tampering
    auto permutation_relation_failures = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials, prover_instance->relation_parameters, "Permutation Relation - Before Tampering");
    ASSERT_TRUE(permutation_relation_failures.empty());

    // Store the original public_input_delta
    fr original_delta = prover_instance->relation_parameters.public_input_delta;

    // TAMPER: Recompute public_input_delta with a different public input value
    // The wire polynomials still contain the original value (314159), but we compute delta as if it were 99999
    fr tampered_public_val = fr(99999);
    std::vector<fr> tampered_public_inputs = { tampered_public_val };
    fr tampered_delta = compute_public_input_delta<Flavor>(tampered_public_inputs,
                                                           prover_instance->relation_parameters.beta,
                                                           prover_instance->relation_parameters.gamma,
                                                           prover_instance->pub_inputs_offset());

    // Sanity check: the tampered delta should differ from the original
    ASSERT_NE(original_delta, tampered_delta) << "Tampered delta should differ from original";

    // Apply the tampered delta
    prover_instance->relation_parameters.public_input_delta = tampered_delta;

    // Verify the permutation relation now fails
    auto failures_of_tampered_instance = RelationChecker<Flavor>::template check<UltraPermutationRelation<fr>>(
        prover_instance->polynomials,
        prover_instance->relation_parameters,
        "Permutation Relation - After tampering with public_input_delta");
    // The failure should be in subrelation 0 (the recurrence relation) since z_perm was computed with
    // a different public_input_delta than what we're now using in the relation check
    ASSERT_TRUE(failures_of_tampered_instance.contains(0)) << "Expected subrelation 0 to fail";
    size_t final_active_wire_idx = prover_instance->get_final_active_wire_idx();
    ASSERT_TRUE(failures_of_tampered_instance.at(0) == final_active_wire_idx);
}

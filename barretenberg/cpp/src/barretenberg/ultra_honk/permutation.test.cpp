#include "barretenberg/circuit_checker/circuit_checker.hpp"
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
 * @brief Test that tampering with declared public inputs causes verification failure via public_input_delta mismatch.
 *
 * @details The permutation argument intentionally "breaks" cycles for public inputs by setting
 * σ⁰(i) = -(i+1) instead of the normal cycle mapping. The verifier recomputes δ_pub from the
 * public inputs in the proof:
 *
 *        δ_pub = ∏ (γ + xᵢ + β(n+i)) / ∏ (γ + xᵢ - β(1+i))
 *
 * The prover's z_perm grand product is computed using the actual wire values at public input positions.
 * If a malicious prover sends different public input values in the proof than what's in the wires,
 * the verifier's δ_pub won't match what z_perm expects, causing verification to fail.
 *
 * This test creates a valid circuit, then corrupts the declared public_inputs in the prover instance
 * (simulating a prover lying about public inputs). The z_perm was computed with the real wire values,
 * but the proof claims different public input values, so the verifier computes the wrong δ_pub.
 */
TYPED_TEST(PermutationTests, PermutationPublicInputDeltaMismatch)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;
    using ProverInstance = ProverInstance_<Flavor>;

    auto builder = UltraCircuitBuilder();

    // Add a public input
    FF public_value = FF(12345);
    auto pub_var = builder.add_public_variable(public_value);

    // Use the public input in a simple constraint so it appears in the trace
    auto private_var = builder.add_variable(FF(100));
    auto result_var = builder.add_variable(public_value + FF(100));
    builder.create_add_gate({ pub_var, private_var, result_var, FF(1), FF(1), FF(-1), FF(0) });

    TestFixture::set_default_pairing_points_and_ipa_claim_and_proof(builder);

    // Good instance should pass
    auto good_instance = std::make_shared<ProverInstance>(builder);
    TestFixture::prove_and_verify(good_instance, /*expected_result=*/true);

    // Bad instance: corrupt the declared public_inputs (what goes into the proof)
    // The wire polynomials still have the original value, but we claim a different public input
    auto bad_instance = std::make_shared<ProverInstance>(builder);

    // The prover's z_perm was computed with wire values = 12345
    // But we lie and claim the public input is 99999
    // Verifier will compute δ_pub using 99999, which won't match z_perm
    FF malicious_value = FF(99999);
    bad_instance->public_inputs[0] = malicious_value;

    TestFixture::prove_and_verify(bad_instance, /*expected_result=*/false);
}

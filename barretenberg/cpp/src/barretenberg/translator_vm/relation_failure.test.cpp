/**
 * @file relation_failure.test.cpp
 * @brief Failure/negative tests for Translator scattered masking layout.
 *
 * Each test builds a fully valid TranslatorProvingKey (via build_valid_translator_state()), asserts that
 * the target relation passes on clean data, then corrupts a specific witness value and verifies detection.
 * All corruptions are witness-level only.
 *
 * Permutation relation (TranslatorPermutationRelation) — 5 tests:
 *   PermutationFailsOnConcatenatedCorruption          — numerator (concatenated poly, block interior)
 *   PermutationFailsOnZPermCorruption                 — running product (z_perm mid-circuit)
 *   PermutationFailsOnOrderedCorruption               — denominator (ordered poly, interior)
 *   PermutationFailsOnExtraNumeratorCorruption         — 5th numerator factor (extra range numerator)
 *   PermutationFailsOnConcatenatedBlockBoundaryCorruption — block boundary (position j*MINI, zero gap)
 *
 * Delta range relation (TranslatorDeltaRangeConstraintRelation) — 6 tests:
 *   DeltaRangeFailsOnMaxValueCorruption               — real_last position != 2^14-1 (subrelations 5-9)
 *   DeltaRangeFailsOnOrderedMaskingBoundary           — last enforced row before masking region
 *   DeltaRangeFailsOnNegativeDelta                    — descending pair (D < 0 in field)
 *   DeltaRangeFailsOnDeltaFour                        — smallest forbidden step (D = 4)
 *   DeltaRangeFailsOnFirstSortedValueTooLarge         — position 0->1 transition (virtual zero start)
 *   DeltaRangeFailsOnFifthOrderedPolyCorruption       — 5th ordered poly (different build path)
 *
 * Shiftable first coeff zero relation (TranslatorShiftableFirstCoeffZeroRelation) — 1 test:
 *   ShiftableFirstCoeffZeroFailsOnOrderedNonZero      — nonzero ordered_i at lagrange_first row (subrelations 0-4)
 *
 * Accumulator transfer relation (TranslatorAccumulatorTransferRelation) — 6 tests:
 *   AccumulatorTransferFailsOnOddRowCorruption        — interior odd row (transfer chain)
 *   AccumulatorTransferFailsOnZeroInitCorruption      — last minicircuit row (zero-init)
 *   AccumulatorTransferFailsOnResultMismatch          — result row vs expected (subrelations 8-11)
 *   AccumulatorTransferPassesWithMaskingRegionValues   — masking regions excluded by selectors
 *   AccumulatorTransferFailsAtFirstTransferRow        — row 9 (left boundary of transfer chain)
 *   AccumulatorTransferFailsAtLastTransferRow         — row 8185 (right boundary before zero-init)
 *
 * Non-native field relation (TranslatorNonNativeFieldRelation) — 1 test:
 *   NonNativeFieldRejectsAccumulatorAlias              — #2492 regression: acc += q, quot -= 1 caught
 *                                                       by higher carry check (subrelation 1)
 *
 * Opcode constraint relation (TranslatorOpcodeConstraintRelation) — 1 test:
 *   OpcodeConstraintFailsOnGenuineOpcodeAtOddRow       — genuine opcode on an odd row must be rejected
 *                                                       (subrelation 0: lagrange_odd * op == 0)
 *
 * Pipeline correctness — 1 test:
 *   InRangeValueInMaskingFlowsToOrderedTail           — trace FF(42) from wire masking through
 *                                                       concatenation into ordered poly tail
 */
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {

using Flavor = TranslatorFlavor;
using FF = typename Flavor::FF;
using ProverPolynomials = typename Flavor::ProverPolynomials;

/**
 * @brief Result of building a valid translator state: the proving key and relation parameters.
 */
struct ValidTranslatorState {
    TranslatorProvingKey key;
    RelationParameters<FF> params;
};

/**
 * @brief Construct a fully-valid TranslatorProvingKey with random 14-bit wire values, random masking values,
 * all lagrange polynomials, concatenated/ordered polynomials, and the grand product z_perm.
 *
 * @details Mirrors the setup from ZeroKnowledgePermutation correctness test. Each failure test calls this,
 * verifies the baseline passes, then corrupts a specific witness value.
 */
ValidTranslatorState build_valid_translator_state()
{
    const size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;
    auto& engine = numeric::get_debug_randomness();

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& pp = key.proving_key->polynomials;

    // Fill group wire polynomials with random 14-bit values in circuit region, random FF in masking rows
    for (const auto& group : pp.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            if (poly.is_empty()) {
                continue;
            }
            for (size_t i = poly.start_index(); i < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i++) {
                poly.at(i) = engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1);
            }
            for (size_t i = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i < poly.end_index(); i++) {
                poly.at(i) = FF::random_element();
            }
        }
    }

    // Reallocate lagrange polynomials to full circuit size and compute them
    pp.lagrange_first = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_last = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_real_last = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_masking = typename Flavor::Polynomial(full_circuit_size);

    key.compute_lagrange_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_concatenated_polynomials();
    key.compute_translator_range_constraint_ordered_polynomials();

    // Compute grand product
    RelationParameters<FF> params{ .beta = FF::random_element(), .gamma = FF::random_element() };
    compute_grand_product<Flavor, TranslatorPermutationRelation<FF>>(pp, params);

    return { std::move(key), params };
}

/**
 * @brief Construct a valid state from a real TranslatorCircuitBuilder, giving a proper accumulator chain.
 *
 * @details Builds an ECCOpQueue with mixed operations, constructs a TranslatorCircuitBuilder and
 * TranslatorProvingKey from it (which populates all wires including accumulators_binary_limbs_0..3
 * with real Horner-scheme accumulator values), then reads accumulated_result from the witness.
 * The resulting state satisfies the AccumulatorTransferRelation with non-trivial values.
 */
ValidTranslatorState build_valid_accumulator_transfer_state()
{
    using BF = typename Flavor::BF;
    using GroupElement = typename Flavor::GroupElement;

    auto& engine = numeric::get_debug_randomness();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->construct_zk_columns();

    // Add mixed ops, merge, more mixed ops, random end ops, final merge
    for (size_t i = 0; i < 50; i++) {
        op_queue->add_accumulate(GroupElement::random_element(&engine));
        op_queue->mul_accumulate(GroupElement::random_element(&engine), FF::random_element(&engine));
    }
    op_queue->eq_and_reset();
    op_queue->merge();
    for (size_t i = 0; i < 50; i++) {
        op_queue->add_accumulate(GroupElement::random_element(&engine));
        op_queue->mul_accumulate(GroupElement::random_element(&engine), FF::random_element(&engine));
    }
    op_queue->eq_and_reset();
    for (size_t i = 0; i < Flavor::CircuitBuilder::NUM_RANDOM_OPS_END; i++) {
        op_queue->random_op_ultra_only();
    }
    op_queue->merge_fixed_append(op_queue->get_append_offset_for_prover());

    const auto batching_challenge_v = BF::random_element(&engine);
    const auto evaluation_input_x = BF::random_element(&engine);

    auto circuit_builder = Flavor::CircuitBuilder(batching_challenge_v, evaluation_input_x, op_queue);
    TranslatorProvingKey key(circuit_builder);

    // Read accumulated_result from the witness (same as the prover does)
    auto& pp = key.proving_key->polynomials;
    RelationParameters<FF> params;
    params.accumulated_result = { pp.accumulators_binary_limbs_0[Flavor::RESULT_ROW],
                                  pp.accumulators_binary_limbs_1[Flavor::RESULT_ROW],
                                  pp.accumulators_binary_limbs_2[Flavor::RESULT_ROW],
                                  pp.accumulators_binary_limbs_3[Flavor::RESULT_ROW] };

    // Populate evaluation_input_x and batching_challenge_v limbs + native values
    // (needed by TranslatorNonNativeFieldRelation; harmless for other relations)
    static constexpr size_t NUM_LIMB_BITS = Flavor::CircuitBuilder::NUM_LIMB_BITS;
    auto uint_input_x = uint256_t(evaluation_input_x);
    params.evaluation_input_x = { uint_input_x.slice(0, NUM_LIMB_BITS),
                                  uint_input_x.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  uint_input_x.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  uint_input_x.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                  uint_input_x };
    auto v_power = BF::one();
    for (size_t i = 0; i < 4; i++) {
        v_power *= batching_challenge_v;
        auto uint_v_power = uint256_t(v_power);
        params.batching_challenge_v.at(i) = { uint_v_power.slice(0, NUM_LIMB_BITS),
                                              uint_v_power.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                              uint_v_power.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                              uint_v_power.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                              uint_v_power };
    }

    return { std::move(key), params };
}

} // anonymous namespace

class TranslatorRelationFailureTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Corrupt a non-masking value in concatenated_range_constraints_0, creating a multiset mismatch
 * (numerator changes but ordered/denominator is not updated).
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnConcatenatedCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Corrupt a non-masking position in block 1 of concatenated_range_constraints_0
    // Block 1 starts at MINI_CIRCUIT_SIZE, position 1 within it is non-masking (start_index=1)
    const size_t corrupt_pos = Flavor::MINI_CIRCUIT_SIZE + 1;
    pp.concatenated_range_constraints_0.at(corrupt_pos) = FF::random_element();

    // Re-compute grand product with corrupted data
    compute_grand_product<Flavor, TranslatorPermutationRelation<FF>>(pp, params);

    auto failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after concatenated corruption";
}

/**
 * @brief Corrupt the value at lagrange_real_last position (circuit_size - MAX_RANDOM - 1) in an ordered poly.
 * Subrelations 5-9 check that ordered[real_last] == 2^14 - 1; this is the only position they are active.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnMaxValueCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    const size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // The real_last position must hold exactly 2^14 - 1. Corrupt it to something else.
    const size_t real_last_pos = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1;
    pp.ordered_range_constraints_0.at(real_last_pos) = FF(42);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail when real_last position != 2^14 - 1";
}

/**
 * @brief Corrupt z_perm at a mid position, breaking the running product consistency.
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnZPermCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Corrupt z_perm at a position in the middle of the circuit
    const size_t corrupt_pos = (Flavor::MINI_CIRCUIT_SIZE * 2) + 500;
    pp.z_perm.at(corrupt_pos) = FF::random_element();
    // Must also update the shifted view
    pp.set_shifted();

    auto failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after z_perm corruption";
}

/**
 * @brief Test that z_perm must be zero at the lagrange_first row.
 *
 * @details The permutation grand product relies on z_perm[0] = 0 so that (z_perm + lagrange_first)
 * evaluates to 1 at the first row. Sub-relation 2 (lagrange_first * z_perm = 0) enforces this.
 *
 * We cross-check the lagrange_first position two ways:
 *   1. Structurally: z_perm.start_index() - 1 (the zero row before the shiftable region)
 *   2. By scanning the lagrange_first polynomial for its non-zero entry
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnZPermNonZeroAtFirstRow)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Derive expected lagrange_first position from z_perm shiftable structure
    ASSERT_TRUE(pp.z_perm.is_shiftable());
    size_t structural_first_row = pp.z_perm.start_index() - 1;

    // Independently scan lagrange_first for its non-zero entry
    const auto& lagrange_first = pp.lagrange_first;
    size_t scanned_first_row = 0;
    bool found = false;
    for (size_t i = lagrange_first.start_index(); i < lagrange_first.end_index(); ++i) {
        if (lagrange_first[i] != FF(0)) {
            scanned_first_row = i;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "lagrange_first has no non-zero entry";
    ASSERT_EQ(structural_first_row, scanned_first_row)
        << "lagrange_first position doesn't match z_perm shiftable structure";

    const size_t first_row = scanned_first_row;

    // Expand to full polynomials so we can write at the zero row
    pp.z_perm = pp.z_perm.full();
    pp.z_perm_shift = pp.z_perm_shift.full();

    ASSERT_EQ(pp.z_perm[first_row], FF(0));

    // Tamper: set z_perm to non-zero where lagrange_first is active
    pp.z_perm.at(first_row) = FF(1);

    auto failures = RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(
        pp, params, "TranslatorPermutationRelation - After setting z_perm != 0 at lagrange_first");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after z_perm init corruption";
    // Sub-relation 2 (lagrange_first * z_perm = 0) should catch this
    EXPECT_TRUE(failures.contains(2)) << "Sub-relation 2 (z_perm init) should catch the corruption";
    EXPECT_EQ(failures.at(2), static_cast<uint32_t>(first_row)) << "Failure should be at lagrange_first row";
}

/**
 * @brief Test that each ordered_range_constraints wire must be zero at the lagrange_first row.
 *
 * @details Soundness of the 14-bit range check requires each sorted chain to start at 0; otherwise field wraparound
 * lets an out-of-range value (e.g. -3 = p-3) sit at the chain start with the delta to the next row still in {0,1,2,3}.
 * The Gemini/Shplemini shift mechanic forces the constant term of a to-be-shifted polynomial to 0, so this is not
 * exploitable, but TranslatorShiftableFirstCoeffZeroRelation anchors it explicitly as defense-in-depth.
 */
TEST_F(TranslatorRelationFailureTests, ShiftableFirstCoeffZeroFailsOnOrderedNonZero)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: the relation passes on valid data
    auto baseline = RelationChecker<Flavor>::check<TranslatorShiftableFirstCoeffZeroRelation<FF>>(
        pp, params, "TranslatorShiftableFirstCoeffZeroRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline shiftable-first-coeff-zero should pass";

    // Derive the lagrange_first position from the ordered poly's shiftable structure and cross-check it.
    ASSERT_TRUE(pp.ordered_range_constraints_0.is_shiftable());
    const size_t first_row = pp.ordered_range_constraints_0.start_index() - 1;
    ASSERT_NE(pp.lagrange_first[first_row], FF(0)) << "lagrange_first should be active at the ordered poly's zero row";

    // Expand to a full polynomial so we can write at the zero row. The shift drops index 0, so the unshifted/shift
    // views stay consistent after we only touch the zero row.
    pp.ordered_range_constraints_0 = pp.ordered_range_constraints_0.full();
    pp.ordered_range_constraints_0_shift = pp.ordered_range_constraints_0_shift.full();
    ASSERT_EQ(pp.ordered_range_constraints_0[first_row], FF(0));

    // Tamper: place an out-of-range micro-limb (-3 = p-3) at the sorted-chain start.
    pp.ordered_range_constraints_0.at(first_row) = -FF(3);

    auto failures = RelationChecker<Flavor>::check<TranslatorShiftableFirstCoeffZeroRelation<FF>>(
        pp, params, "TranslatorShiftableFirstCoeffZeroRelation - After setting ordered_range_constraints_0[0] != 0");
    EXPECT_FALSE(failures.empty()) << "Relation should fail after nonzero first sorted value";
    // Sub-relation 0 (lagrange_first * ordered_range_constraints_0 = 0) should catch this
    EXPECT_TRUE(failures.contains(0)) << "Sub-relation 0 (ordered_0 first-coeff anchor) should catch the corruption";
    EXPECT_EQ(failures.at(0), static_cast<uint32_t>(first_row)) << "Failure should be at lagrange_first row";
}

/**
 * @brief Corrupt ordered poly at position circuit_size - MAX_RANDOM - 2, the last row where the delta
 * constraint is enforced. This is right before lagrange_real_last + lagrange_ordered_masking kicks in.
 *
 * @details At this position: lagrange_real_last = 0, lagrange_ordered_masking = 0.
 * The delta to the next row (real_last, which holds 2^14-1) must be in {0,1,2,3}.
 * Setting a value of 0 here creates a gap of 2^14 - 1 to the next row.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnOrderedMaskingBoundary)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    const size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // Position circuit_size - MAX_RANDOM - 2 is the last row with delta enforcement active.
    // The next row (real_last) holds 2^14 - 1. Setting this to 0 creates delta = 16383.
    const size_t boundary_pos = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 2;
    pp.ordered_range_constraints_0.at(boundary_pos) = FF(0);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail at the masking boundary";
}

/**
 * @brief Swap two adjacent sorted values to create a negative delta (descending pair).
 * In the field, ordered[i+1] - ordered[i] becomes a huge element, not in {0,1,2,3}.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnNegativeDelta)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // Set ordered[pos] to be larger than ordered[pos+1], creating a negative delta at row pos.
    // D = ordered[pos+1] - ordered[pos] becomes a huge field element (negative in the integers),
    // which is not in {0,1,2,3}.
    const size_t pos = 5000;
    pp.ordered_range_constraints_0.at(pos) = pp.ordered_range_constraints_0[pos + 1] + FF(1);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail on descending (negative delta) pair";
}

/**
 * @brief Set delta = 4 (smallest forbidden step) between adjacent ordered values.
 * D ∈ {0,1,2,3} passes; D = 4 is the exact boundary that must fail.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnDeltaFour)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // Pick a mid-range position and set it so the delta to the next row is exactly 4
    const size_t pos = 3000;
    FF next_val = pp.ordered_range_constraints_0[pos + 1];
    pp.ordered_range_constraints_0.at(pos) = next_val - FF(4);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail when delta is exactly 4";
}

/**
 * @brief Corrupt position 1 in an ordered poly (the first real sorted value after virtual zero at pos 0).
 * If ordered[1] > 3, the delta from 0 to ordered[1] violates the step constraint.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnFirstSortedValueTooLarge)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // Position 0 is virtual zero (always 0). Position 1 is the first sorted value.
    // Setting it to 100 creates delta = 100 from row 0, which violates D ∈ {0,1,2,3}.
    pp.ordered_range_constraints_0.at(1) = FF(100);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail when first sorted value > 3";
}

/**
 * @brief Corrupt ordered_range_constraints_4 (the 5th ordered poly, built from the extra denominator).
 * This poly is constructed from a different code path than the first 4. Verify subrelation 4 catches it.
 */
TEST_F(TranslatorRelationFailureTests, DeltaRangeFailsOnFifthOrderedPolyCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: delta range passes
    auto baseline = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline delta range should pass";

    // Corrupt ordered_range_constraints_4 at a mid position
    const size_t pos = 2000;
    pp.ordered_range_constraints_4.at(pos) = pp.ordered_range_constraints_4[pos - 1] + FF(100);

    auto failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Delta range should fail on 5th ordered poly corruption";
}

/**
 * @brief Corrupt a value in ordered_range_constraints_0 (denominator side of the permutation),
 * creating a multiset mismatch without updating z_perm.
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnOrderedCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Corrupt a non-masking position in ordered_range_constraints_0 without recomputing z_perm
    const size_t corrupt_pos = 500;
    pp.ordered_range_constraints_0.at(corrupt_pos) = FF::random_element();

    auto failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after ordered poly corruption";
}

/**
 * @brief Place a small in-range value (42) at a wire masking position and verify it flows correctly
 * through concatenation into the ordered polynomial's contiguous masking tail.
 *
 * @details The value 42 is unique among random FF masking values. We trace it:
 *   wire masking pos → concatenated poly (scattered) → ordered poly tail (contiguous).
 * After the full pipeline, all relations should still pass.
 */
TEST_F(TranslatorRelationFailureTests, InRangeValueInMaskingFlowsToOrderedTail)
{
    const size_t full_circuit_size = Flavor::MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE;
    auto& engine = numeric::get_debug_randomness();

    TranslatorProvingKey key{};
    key.proving_key = std::make_shared<typename Flavor::ProvingKey>();
    ProverPolynomials& pp = key.proving_key->polynomials;

    // Fill wire polynomials with random 14-bit values (circuit) and random FF (masking)
    for (const auto& group : pp.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            if (poly.is_empty()) {
                continue;
            }
            for (size_t i = poly.start_index(); i < poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i++) {
                poly.at(i) = engine.get_random_uint16() & ((1 << Flavor::MICRO_LIMB_BITS) - 1);
            }
            for (size_t i = poly.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i < poly.end_index(); i++) {
                poly.at(i) = FF::random_element();
            }
        }
    }

    // Place a known small in-range value at the first masking position of group[0][0]
    // (p_x_low_limbs_range_constraint_0, block 0)
    const FF sentinel(42);
    auto groups = pp.get_groups_to_be_concatenated();
    auto& target_wire = groups[0][0];
    const size_t wire_masking_start = target_wire.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK;
    target_wire.at(wire_masking_start) = sentinel;

    // Reallocate lagrange polynomials
    pp.lagrange_first = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_last = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_real_last = typename Flavor::Polynomial(full_circuit_size);
    pp.lagrange_masking = typename Flavor::Polynomial(full_circuit_size);

    key.compute_lagrange_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_concatenated_polynomials();

    // After concatenation: group[0][0] maps to block 0 of concatenated_range_constraints_0
    // Masking position in concatenated poly = 0 * MINI + wire_masking_start
    const size_t concat_masking_pos = wire_masking_start; // block 0, so offset is 0
    EXPECT_EQ(pp.concatenated_range_constraints_0[concat_masking_pos], sentinel)
        << "Sentinel should appear at the correct concatenated position";

    key.compute_translator_range_constraint_ordered_polynomials();

    // The sentinel should now be in the contiguous masking tail of one of the ordered polys.
    // split_concatenated_random_coefficients_to_ordered extracts from concat[0..3] in order:
    //   concat 0, block 0, rows [MINI-4, MINI) → first 4 values in random_values[]
    // Our sentinel is random_values[0] (first extracted value from concat 0, block 0, first masking row).
    //
    // Distribution: 256 total values across 5 ordered polys.
    // ordered[0] gets 52 values (256/5=51, remainder 1 → first poly gets +1).
    // random_values[0] → ordered[0] at position circuit_size - 52.
    bool found = false;
    for (const auto& ord_poly : pp.get_ordered_range_constraints()) {
        for (size_t pos = full_circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; pos < full_circuit_size; pos++) {
            if (ord_poly[pos] == sentinel) {
                found = true;
                break;
            }
        }
        if (found) {
            break;
        }
    }
    EXPECT_TRUE(found) << "Sentinel value 42 should appear in the ordered poly masking tail";

    // Verify all relations still pass with an in-range value in the masking position
    RelationParameters<FF> params{ .beta = FF::random_element(), .gamma = FF::random_element() };
    compute_grand_product<Flavor, TranslatorPermutationRelation<FF>>(pp, params);

    auto perm_failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(perm_failures.empty()) << "Permutation should pass with in-range masking value";

    auto delta_failures = RelationChecker<Flavor>::check<TranslatorDeltaRangeConstraintRelation<FF>>(
        pp, params, "TranslatorDeltaRangeConstraintRelation");
    EXPECT_TRUE(delta_failures.empty()) << "Delta range should pass with in-range masking value";
}

/**
 * @brief Corrupt ordered_extra_range_constraints_numerator (the 5th factor in the permutation numerator),
 * creating a multiset mismatch without updating z_perm.
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnExtraNumeratorCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Corrupt a value in the extra range constraint numerator without recomputing z_perm
    const size_t corrupt_pos = 5;
    pp.ordered_extra_range_constraints_numerator.at(corrupt_pos) = FF::random_element();

    auto failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after extra numerator corruption";
}

// ======================== Accumulator Transfer Relation ========================

/**
 * @brief Corrupt an accumulator limb at an interior odd row to break the transfer chain.
 * Subrelations 0-3 enforce acc[odd] == acc[odd+1] at odd minicircuit rows (except the last).
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferFailsOnOddRowCorruption)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: accumulator transfer passes with real Horner-scheme accumulator values
    auto baseline = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline accumulator transfer should pass";

    // Corrupt accumulators_binary_limbs_0 at an interior odd row.
    // Transfer checks acc[101] == acc[102]. Corrupting acc[101] breaks this.
    pp.accumulators_binary_limbs_0.at(101) = FF::random_element();

    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_FALSE(failures.empty()) << "Accumulator transfer should fail after odd row corruption";
}

/**
 * @brief Set a non-zero accumulator at the last minicircuit row where zero-init is enforced.
 * Subrelations 4-7 check acc * lagrange_last_in_minicircuit == 0 at position MINI - NUM_MASKED - 1 (= 8187).
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferFailsOnZeroInitCorruption)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    auto baseline = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline accumulator transfer should pass";

    // Corrupt: set non-zero accumulator at the last minicircuit row (zero-init position 8187)
    const size_t last_in_minicircuit = Flavor::MINI_CIRCUIT_SIZE - Flavor::NUM_MASKED_ROWS_END - 1;
    pp.accumulators_binary_limbs_0.at(last_in_minicircuit) = FF(1);

    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_FALSE(failures.empty()) << "Accumulator transfer should fail when zero-init position is non-zero";
}

/**
 * @brief Mismatch accumulated_result[0] with the actual accumulator value at RESULT_ROW (= 8).
 * Subrelations 8-11 check (acc - expected) * lagrange_result_row == 0.
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferFailsOnResultMismatch)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    auto baseline = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline accumulator transfer should pass";

    // Perturb accumulated_result so it no longer matches the witness at RESULT_ROW
    params.accumulated_result[0] += FF(1);

    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_FALSE(failures.empty()) << "Accumulator transfer should fail on result mismatch";
}

/**
 * @brief Place arbitrary non-zero values in accumulator limbs at masking positions ([2,7] and [8188,8191]).
 * Verify the relation still passes — masking regions must not leak into the accumulator transfer relation.
 *
 * @details This is the key test for the new concatenated layout: lagrange_odd_in_minicircuit is only active
 * at odd positions in [RESULT_ROW, MINI - NUM_MASKED), lagrange_last_in_minicircuit at 8187, and
 * lagrange_result_row at 8. None of these cover masking positions [2,7] or [8188,8191].
 * If any selector were accidentally set at a masking position, non-zero accumulator values there
 * would cause a failure.
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferPassesWithMaskingRegionValues)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    // Place non-zero values at start masking positions [RANDOMNESS_START, RESULT_ROW) = [2, 8)
    for (size_t i = Flavor::RANDOMNESS_START; i < Flavor::RESULT_ROW; i++) {
        pp.accumulators_binary_limbs_0.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_1.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_2.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_3.at(i) = FF::random_element();
    }

    // Place non-zero values at end masking positions [MINI - NUM_MASKED, MINI) = [8188, 8192)
    const size_t end_mask_start = Flavor::MINI_CIRCUIT_SIZE - Flavor::NUM_MASKED_ROWS_END;
    for (size_t i = end_mask_start; i < Flavor::MINI_CIRCUIT_SIZE; i++) {
        pp.accumulators_binary_limbs_0.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_1.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_2.at(i) = FF::random_element();
        pp.accumulators_binary_limbs_3.at(i) = FF::random_element();
    }

    // Relation should still pass — masking regions are excluded by selectors
    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(failures.empty()) << "Accumulator transfer should pass even with arbitrary masking region values";
}

/**
 * @brief Corrupt the accumulator at row 9 (first odd row in minicircuit, left boundary of transfer chain).
 * lagrange_odd_in_minicircuit is first active at RESULT_ROW + 1 = 9.
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferFailsAtFirstTransferRow)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    auto baseline = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline accumulator transfer should pass";

    // Row 9 is the first odd row where lagrange_odd_in_minicircuit = 1.
    // Transfer checks acc[9] == acc[10]. Corrupting acc[9] breaks this.
    const size_t first_transfer_row = Flavor::RESULT_ROW + 1;
    pp.accumulators_binary_limbs_0.at(first_transfer_row) = FF::random_element();

    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_FALSE(failures.empty()) << "Accumulator transfer should fail at first transfer row";
}

/**
 * @brief Corrupt the accumulator at the penultimate odd row (right boundary of the transfer chain,
 * just before the zero-init row 8187). Row 8185 is the last odd row where the transfer subrelation
 * is active (lagrange_odd = 1, lagrange_last = 0).
 */
TEST_F(TranslatorRelationFailureTests, AccumulatorTransferFailsAtLastTransferRow)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    auto baseline = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline accumulator transfer should pass";

    // Row MINI - NUM_MASKED - 3 = 8185 is the last odd row before 8187 where transfer is enforced
    const size_t last_transfer_row = Flavor::MINI_CIRCUIT_SIZE - Flavor::NUM_MASKED_ROWS_END - 3;
    pp.accumulators_binary_limbs_0.at(last_transfer_row) = FF::random_element();

    auto failures = RelationChecker<Flavor>::check<TranslatorAccumulatorTransferRelation<FF>>(
        pp, params, "TranslatorAccumulatorTransferRelation");
    EXPECT_FALSE(failures.empty()) << "Accumulator transfer should fail at last transfer row";
}

/**
 * @brief Place a non-zero value at position j*MINI (block boundary, below start_index) in a concatenated poly.
 * This position is normally zero because wire data starts at start_index=1 within each block.
 * Changing it alters the permutation numerator without updating ordered polys.
 */
TEST_F(TranslatorRelationFailureTests, PermutationFailsOnConcatenatedBlockBoundaryCorruption)
{
    auto [key, params] = build_valid_translator_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: permutation relation passes
    auto baseline =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline permutation should pass";

    // Position 0 of block 5 in concatenated_range_constraints_0.
    // This is at index 5 * MINI_CIRCUIT_SIZE, which should be zero (below start_index of that block's wire).
    const size_t block_boundary_pos = 5 * Flavor::MINI_CIRCUIT_SIZE;
    EXPECT_EQ(pp.concatenated_range_constraints_0[block_boundary_pos], FF(0))
        << "Block boundary should initially be zero";

    pp.concatenated_range_constraints_0.at(block_boundary_pos) = FF(999);

    // Re-compute grand product with corrupted data
    compute_grand_product<Flavor, TranslatorPermutationRelation<FF>>(pp, params);

    auto failures =
        RelationChecker<Flavor>::check<TranslatorPermutationRelation<FF>>(pp, params, "TranslatorPermutationRelation");
    EXPECT_FALSE(failures.empty()) << "Permutation should fail after block boundary corruption";
}

// ======================== Non-Native Field Relation: Accumulator Alias ========================

/**
 * @brief Regression for AztecProtocol/barretenberg#2492: verify that the accumulator alias
 * attack (current_acc += q, quotient -= 1) is caught by the higher carry check.
 *
 * @details The Fq accumulation formula holds in integers:
 *   prev * x + stuff - quotient * p - current_acc = 0
 * Replacing current_acc with current_acc + p and quotient with quotient - 1 preserves this
 * equation, plus its mod-2^272 and mod-r projections. However, the limb-level carry witnesses
 * (relation_wide_limbs) become stale: the new intermediate sums at limbs 2-3 no longer match
 * the old high carry value, and subrelation 1 (higher mod 2^136 check) detects the mismatch.
 */
TEST_F(TranslatorRelationFailureTests, NonNativeFieldRejectsAccumulatorAlias)
{
    using BF = typename Flavor::BF;
    static constexpr size_t NUM_LIMB_BITS = Flavor::CircuitBuilder::NUM_LIMB_BITS;

    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    // Baseline: all three NonNativeField subrelations pass
    auto baseline = RelationChecker<Flavor>::check<TranslatorNonNativeFieldRelation<FF>>(
        pp, params, "TranslatorNonNativeFieldRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline non-native field should pass";

    constexpr size_t ROW = Flavor::RESULT_ROW; // 8

    // --- Read old accumulator and quotient at RESULT_ROW ---
    // Accumulator limbs are at the even row (current acc = row ROW, previous acc = row ROW+1 via shift)
    auto read_limbs = [](const auto& l0, const auto& l1, const auto& l2, const auto& l3, size_t row) {
        return uint256_t(l0[row]) | (uint256_t(l1[row]) << NUM_LIMB_BITS) |
               (uint256_t(l2[row]) << (2 * NUM_LIMB_BITS)) | (uint256_t(l3[row]) << (3 * NUM_LIMB_BITS));
    };

    uint256_t old_acc = read_limbs(pp.accumulators_binary_limbs_0,
                                   pp.accumulators_binary_limbs_1,
                                   pp.accumulators_binary_limbs_2,
                                   pp.accumulators_binary_limbs_3,
                                   ROW);

    // Quotient: limbs 0,1 from quotient_low at rows ROW, ROW+1; limbs 2,3 from quotient_high at rows ROW, ROW+1
    uint256_t old_quot = uint256_t(pp.quotient_low_binary_limbs[ROW]) |
                         (uint256_t(pp.quotient_low_binary_limbs[ROW + 1]) << NUM_LIMB_BITS) |
                         (uint256_t(pp.quotient_high_binary_limbs[ROW]) << (2 * NUM_LIMB_BITS)) |
                         (uint256_t(pp.quotient_high_binary_limbs[ROW + 1]) << (3 * NUM_LIMB_BITS));

    // --- Apply the alias mutation: acc += p, quotient -= 1 ---
    const uint256_t p_mod = BF::modulus;
    uint256_t new_acc = old_acc + p_mod;
    uint256_t new_quot = old_quot - uint256_t(1);

    auto split = [](const uint256_t& val) -> std::array<FF, 4> {
        return { FF(val.slice(0, NUM_LIMB_BITS)),
                 FF(val.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)),
                 FF(val.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS)),
                 FF(val.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS)) };
    };

    auto new_acc_limbs = split(new_acc);
    auto new_quot_limbs = split(new_quot);

    // Write mutated accumulator limbs
    pp.accumulators_binary_limbs_0.at(ROW) = new_acc_limbs[0];
    pp.accumulators_binary_limbs_1.at(ROW) = new_acc_limbs[1];
    pp.accumulators_binary_limbs_2.at(ROW) = new_acc_limbs[2];
    pp.accumulators_binary_limbs_3.at(ROW) = new_acc_limbs[3];

    // Write mutated quotient limbs
    pp.quotient_low_binary_limbs.at(ROW) = new_quot_limbs[0];
    pp.quotient_low_binary_limbs.at(ROW + 1) = new_quot_limbs[1];
    pp.quotient_high_binary_limbs.at(ROW) = new_quot_limbs[2];
    pp.quotient_high_binary_limbs.at(ROW + 1) = new_quot_limbs[3];

    // Deliberately do NOT update relation_wide_limbs (carry witnesses) — the stale carries
    // should cause the higher mod-2^136 check to fail.

    auto failures = RelationChecker<Flavor>::check<TranslatorNonNativeFieldRelation<FF>>(
        pp, params, "TranslatorNonNativeFieldRelation");

    // The higher carry check (subrelation 1) must fail at RESULT_ROW.
    EXPECT_TRUE(failures.contains(1)) << "Subrelation 1 (higher carry check) should reject the alias";
    EXPECT_EQ(failures.at(1), static_cast<uint32_t>(ROW)) << "Failure should be at RESULT_ROW";

    // The native-field check (subrelation 2) should still pass — the mod-r projection is preserved.
    EXPECT_FALSE(failures.contains(2)) << "Subrelation 2 (native check) should pass under the alias mutation";
}

// ======================== Opcode Constraint Relation: op on odd rows ========================

/**
 * @brief A genuine opcode must never appear on an odd minicircuit row.
 *
 * @details The non-native accumulator only advances on even rows (every advance subrelation is gated by
 * lagrange_even_in_minicircuit * op). An opcode placed on an odd row would therefore be skipped by the
 * accumulator, letting a prover exclude an ECC op from the batched evaluation while the rest of the circuit
 * stays consistent. Subrelation 0 of the opcode-constraint relation forbids this by enforcing
 * lagrange_odd_in_minicircuit * op == 0. Random masking ops are exempt because both lagrange selectors are zero
 * in the masking regions.
 */
TEST_F(TranslatorRelationFailureTests, OpcodeConstraintFailsOnGenuineOpcodeAtOddRow)
{
    auto [key, params] = build_valid_accumulator_transfer_state();
    auto& pp = key.proving_key->polynomials;

    auto baseline = RelationChecker<Flavor>::check<TranslatorOpcodeConstraintRelation<FF>>(
        pp, params, "TranslatorOpcodeConstraintRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline opcode constraint should pass";

    // Row 9 is the first odd row in the genuine-op processing range (lagrange_odd_in_minicircuit = 1, op = 0).
    const size_t odd_row = Flavor::RESULT_ROW + 1;
    ASSERT_EQ(pp.op[odd_row], FF(0));

    // Place a genuine opcode (3 = eq + reset) on the odd row.
    pp.op.at(odd_row) = FF(3);

    auto failures = RelationChecker<Flavor>::check<TranslatorOpcodeConstraintRelation<FF>>(
        pp, params, "TranslatorOpcodeConstraintRelation");
    EXPECT_FALSE(failures.empty()) << "Opcode constraint should fail with a genuine opcode on an odd row";
    EXPECT_TRUE(failures.contains(0)) << "Subrelation 0 (opcode validity) should catch the odd-row opcode";
    EXPECT_EQ(failures.at(0), static_cast<uint32_t>(odd_row)) << "Failure should be at the odd row";
}

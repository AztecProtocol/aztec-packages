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
 * Pipeline correctness — 1 test:
 *   InRangeValueInMaskingFlowsToOrderedTail           — trace FF(42) from wire masking through
 *                                                       concatenation into ordered poly tail
 */
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
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
    pp.lagrange_masking_adjacent = typename Flavor::Polynomial(full_circuit_size);

    key.compute_lagrange_polynomials();
    key.compute_extra_range_constraint_numerator();
    key.compute_concatenated_polynomials();
    key.compute_translator_range_constraint_ordered_polynomials();

    // Compute grand product
    RelationParameters<FF> params{ .beta = FF::random_element(), .gamma = FF::random_element() };
    compute_grand_product<Flavor, TranslatorPermutationRelation<FF>>(pp, params);

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
 * @brief Corrupt ordered poly at position circuit_size - MAX_RANDOM - 2, the last row where the delta
 * constraint is enforced. This is right before lagrange_ordered_masking_adjacent kicks in.
 *
 * @details At this position: lagrange_real_last = 0, lagrange_ordered_masking_adjacent = 0.
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
    pp.lagrange_masking_adjacent = typename Flavor::Polynomial(full_circuit_size);

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

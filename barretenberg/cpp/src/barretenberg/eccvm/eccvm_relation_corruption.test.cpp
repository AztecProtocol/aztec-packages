/**
 * @file eccvm_relation_corruption.test.cpp
 * @brief Corruption/negative tests for ECCVM relation constraints.
 *
 * Each test builds valid ProverPolynomials from a real ECCVMCircuitBuilder, asserts that
 * relations pass on clean data, then corrupts specific witness values and verifies detection.
 */
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_test_utils.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {

using Flavor = ECCVMFlavor;
using FF = typename Flavor::FF;
using G1 = bb::g1;
using Fr = typename G1::Fr;
using Polynomial = typename Flavor::Polynomial;
using ProverPolynomials = typename Flavor::ProverPolynomials;
using eccvm_test_utils::add_hiding_op_for_test;

auto& engine = numeric::get_debug_randomness();

/**
 * @brief Return pointers to every MSM-prefixed polynomial in a ProverPolynomials instance.
 * @note Used by MSMRelationFailsOnShiftedMSMTable to shift all MSM columns in lockstep.
 * @warning This must be updated if MSM columns are added, removed, or renamed.
 */
std::vector<Polynomial*> get_msm_polynomials(ProverPolynomials& polys)
{
    return {
        // From WireNonShiftedEntities (columns 21-44)
        &polys.msm_size_of_msm,
        &polys.msm_add2,
        &polys.msm_add3,
        &polys.msm_add4,
        &polys.msm_x1,
        &polys.msm_y1,
        &polys.msm_x2,
        &polys.msm_y2,
        &polys.msm_x3,
        &polys.msm_y3,
        &polys.msm_x4,
        &polys.msm_y4,
        &polys.msm_collision_x1,
        &polys.msm_collision_x2,
        &polys.msm_collision_x3,
        &polys.msm_collision_x4,
        &polys.msm_lambda1,
        &polys.msm_lambda2,
        &polys.msm_lambda3,
        &polys.msm_lambda4,
        &polys.msm_slice1,
        &polys.msm_slice2,
        &polys.msm_slice3,
        &polys.msm_slice4,
        // From WireToBeShiftedWithoutAccumulatorsEntities (columns 68-77)
        &polys.msm_transition,
        &polys.msm_add,
        &polys.msm_double,
        &polys.msm_skew,
        &polys.msm_accumulator_x,
        &polys.msm_accumulator_y,
        &polys.msm_count,
        &polys.msm_round,
        &polys.msm_add1,
        &polys.msm_pc,
    };
}

/**
 * @brief Build valid ProverPolynomials from an ECCVMCircuitBuilder with a small MSM.
 */
ProverPolynomials build_valid_eccvm_msm_state()
{
    auto generators = G1::derive_generators("test generators", 3);
    auto a = generators[0];
    auto b = generators[1];
    Fr x = Fr::random_element(&engine);
    Fr y = Fr::random_element(&engine);

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, y);
    op_queue->eq_and_reset();
    op_queue->merge();
    add_hiding_op_for_test(op_queue);

    ECCVMCircuitBuilder builder{ op_queue };
    return ProverPolynomials(builder);
}

/**
 * @brief Compute random Fiat-Shamir challenges and derived polynomials (logderivative inverse, grand product)
 * needed to check ECCVMSetRelation and ECCVMLookupRelation.
 */
RelationParameters<FF> compute_full_relation_params(ProverPolynomials& polynomials)
{
    const FF beta = FF::random_element(&engine);
    const FF gamma = FF::random_element(&engine);
    const FF beta_sqr = beta.sqr();
    const FF beta_cube = beta_sqr * beta;
    auto eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    eccvm_set_permutation_delta = eccvm_set_permutation_delta.invert();

    RelationParameters<FF> params{
        .eta = 0,
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = 0,
        .beta_sqr = beta_sqr,
        .beta_cube = beta_cube,
        .eccvm_set_permutation_delta = eccvm_set_permutation_delta,
    };

    const size_t num_rows = polynomials.get_polynomial_size();
    const size_t unmasked_witness_size = num_rows - NUM_DISABLED_ROWS_IN_SUMCHECK;
    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(polynomials, params, unmasked_witness_size);
    compute_grand_product<Flavor, ECCVMSetRelation<FF>>(polynomials, params, unmasked_witness_size);
    polynomials.z_perm_shift = Polynomial(polynomials.z_perm.shifted());

    return params;
}

} // anonymous namespace

class ECCVMRelationCorruptionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Show that corrupting the accumulator at row 1 (msm_transition=1) does NOT break the MSM relation.
 *
 * @details Row 1 is the first active MSM row with msm_transition=1. The first_add lambda in the
 * MSM relation replaces the accumulator with the offset generator when msm_transition=1:
 *   x = xo * msm_transition + acc_x * (-msm_transition + 1)
 * So when msm_transition=1, acc_x and acc_y are completely unused — corrupting them is harmless.
 * This test documents that behavior explicitly.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMAccumulatorCorruptionAtTransitionRowIsHarmless)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Confirm row 1 is indeed the transition row
    ASSERT_EQ(polynomials.msm_add[1], FF(1)) << "Row 1 should be an active MSM add row";
    ASSERT_EQ(polynomials.msm_transition[1], FF(1)) << "Row 1 should have msm_transition=1";

    // Corrupt the accumulator at the transition row
    polynomials.msm_accumulator_x.at(1) = FF::random_element(&engine);
    polynomials.msm_accumulator_y.at(1) = FF::random_element(&engine);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
    EXPECT_TRUE(failures.empty()) << "MSM relation should STILL PASS — acc is unused when msm_transition=1";
}

/**
 * @brief Corrupt the MSM accumulator at an interior active row and at a trailing no-op row.
 *
 * @details Part 1 targets an interior addition row (q_add=1, msm_transition=0). Unlike the
 * transition row, the interior addition directly uses acc as input to the point-addition chain,
 * so corrupting it breaks the addition subrelations.
 *
 * Part 2 targets a trailing no-op row where all MSM selectors are zero. Here the no-op
 * preservation constraints (subrelations 45-46) enforce acc_shift == acc.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMAccumulatorCorruptionAtInteriorAndNoOpRows)
{
    RelationParameters<FF> params{};

    // --- Part 1: corrupt the accumulator at an interior active MSM row (q_add=1, msm_transition=0) ---
    {
        auto polynomials = build_valid_eccvm_msm_state();

        auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
        EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

        // Find an interior addition row: q_add=1, msm_transition=0
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t active_row = 0;
        for (size_t i = 1; i < num_rows - 1; i++) {
            if (polynomials.msm_add[i] == FF(1) && polynomials.msm_transition[i] == FF(0)) {
                active_row = i;
                break;
            }
        }
        ASSERT_NE(active_row, 0) << "Should find an interior active MSM add row";

        polynomials.msm_accumulator_x.at(active_row) = FF::random_element(&engine);
        polynomials.msm_accumulator_y.at(active_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
        EXPECT_FALSE(failures.empty()) << "MSM relation should fail after active-row accumulator corruption";
    }

    // --- Part 2: corrupt the accumulator at a trailing no-op row ---
    {
        auto polynomials = build_valid_eccvm_msm_state();

        // Find the first no-op row (all MSM selectors zero, not lagrange_first)
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t no_op_row = 0;
        for (size_t i = 2; i < num_rows - 1; i++) {
            if (polynomials.msm_add[i] == FF(0) && polynomials.msm_double[i] == FF(0) &&
                polynomials.msm_skew[i] == FF(0) && polynomials.msm_transition[i] == FF(0) &&
                polynomials.lagrange_first[i] == FF(0)) {
                no_op_row = i;
                break;
            }
        }
        ASSERT_NE(no_op_row, 0) << "Should find a no-op row in the MSM table";

        polynomials.msm_accumulator_x.at(no_op_row) = FF::random_element(&engine);
        polynomials.msm_accumulator_y.at(no_op_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
        EXPECT_FALSE(failures.empty()) << "MSM relation should fail after no-op accumulator corruption";

        // The failure should be in subrelations 45 or 46 (the no-op accumulator preservation constraints)
        bool found_noop_subrelation_failure = failures.contains(45) || failures.contains(46);
        EXPECT_TRUE(found_noop_subrelation_failure)
            << "Failure should be detected by subrelations 45/46 (no-op accumulator preservation)";
    }
}

/**
 * @brief Shift every MSM column down by one row, inserting a zero row at row 1.
 *
 * @details For every MSM polynomial p, we set:
 *   p_new[0] = p[0]  (row 0 is reserved for shifts, always zero)
 *   p_new[1] = 0     (injected blank row)
 *   p_new[k] = p[k-1] for k >= 2
 *
 * This shifts all real MSM data one row later. Row 1, which was the first active MSM row
 * (msm_transition = 1, q_add = 1, nonzero accumulator), becomes a no-op with zero accumulator.
 * But the non-MSM columns (e.g. lagrange polynomials, precompute columns) are NOT shifted,
 * so there's a mismatch. The no-op constraint (subrelations 45-46) forces acc_shift == acc
 * at the now-empty row 1, but the shifted row 2 carries a nonzero accumulator from what was
 * originally the row-1 computation, causing a detected violation.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRelationFailsOnShiftedMSMTable)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    // Baseline: MSM relation passes on clean data
    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    const size_t num_rows = polynomials.get_polynomial_size();
    auto msm_polys = get_msm_polynomials(polynomials);

    // Shift every MSM column down by 1: p[k] = p[k-1] for k = num_rows-1 down to 2, then p[1] = 0
    for (auto* poly : msm_polys) {
        for (size_t k = num_rows - 1; k >= 2; k--) {
            poly->at(k) = (*poly)[k - 1];
        }
        poly->at(1) = FF(0);
    }

    // Subrelation 27 enforces: is_not_first_row * msm_transition_shift * (msm_size + pc_shift - pc) = 0
    // After shifting, row 1 has msm_transition_shift = msm_transition[2] = 1 (old row 1's transition),
    // but pc[1] = 0 and pc[2] = pc_original[1] (nonzero), with msm_size[1] = 0.
    // Patch msm_size_of_msm[1] so the pc-continuity constraint is satisfied at the injected row.
    polynomials.msm_size_of_msm.at(1) = polynomials.msm_pc[1] - polynomials.msm_pc[2];

    // Refresh shifted views
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "ECCVMMSMRelation");
    EXPECT_FALSE(failures.empty()) << "MSM relation should fail after shifting MSM table by one row";

    // Log all failing subrelations for visibility
    for (const auto& [subrelation_idx, row_idx] : failures) {
        info("Shifted MSM table: subrelation ", subrelation_idx, " first failed at row ", row_idx);
    }

    // Only subrelations 45 and 46 (no-op accumulator preservation) should fail
    EXPECT_EQ(failures.size(), 2U) << "Exactly two subrelations should fail (45 and 46)";
    EXPECT_TRUE(failures.contains(45)) << "Subrelation 45 (no-op acc_x preservation) should fail";
    EXPECT_TRUE(failures.contains(46)) << "Subrelation 46 (no-op acc_y preservation) should fail";

    // Verify that all other ECCVM relations still pass after the shift.
    // We compute random Fiat-Shamir challenges and derived polynomials (logderivative inverse, grand product)
    // so we can also check ECCVMSetRelation and ECCVMLookupRelation.
    auto full_params = compute_full_relation_params(polynomials);

    // Relations that don't touch MSM columns should be completely unaffected.
    auto transcript_failures =
        RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(polynomials, full_params, "ECCVMTranscriptRelation");
    EXPECT_TRUE(transcript_failures.empty()) << "ECCVMTranscriptRelation should still pass";

    auto point_table_failures =
        RelationChecker<void>::check<ECCVMPointTableRelation<FF>>(polynomials, full_params, "ECCVMPointTableRelation");
    EXPECT_TRUE(point_table_failures.empty()) << "ECCVMPointTableRelation should still pass";

    auto wnaf_failures =
        RelationChecker<void>::check<ECCVMWnafRelation<FF>>(polynomials, full_params, "ECCVMWnafRelation");
    EXPECT_TRUE(wnaf_failures.empty()) << "ECCVMWnafRelation should still pass";

    auto bools_failures =
        RelationChecker<void>::check<ECCVMBoolsRelation<FF>>(polynomials, full_params, "ECCVMBoolsRelation");
    EXPECT_TRUE(bools_failures.empty()) << "ECCVMBoolsRelation should still pass";

    // The Set relation enforces a multiset equality between MSM output tuples (pc, acc_x, acc_y, msm_size)
    // and the transcript. Shifting the MSM columns corrupts these tuples, so the grand product (computed
    // post-shift) reflects mismatched reads/writes and the relation correctly fails. It is possible that with more
    // care, we could make this also pass.
    auto set_failures =
        RelationChecker<void>::check<ECCVMSetRelation<FF>>(polynomials, full_params, "ECCVMSetRelation");
    EXPECT_FALSE(set_failures.empty()) << "ECCVMSetRelation should also fail (MSM output tuples are shifted)";

    // The Lookup relation's logderivative inverse is computed post-shift, so it adapts to the
    // shifted column values. The per-row subrelation passes, and the sum-over-trace (linearly
    // dependent) subrelation also vanishes since the inverse was derived from the current data.
    auto lookup_failures = RelationChecker<void>::check<ECCVMLookupRelation<FF>, /*has_linearly_dependent=*/true>(
        polynomials, full_params, "ECCVMLookupRelation");
    EXPECT_TRUE(lookup_failures.empty()) << "ECCVMLookupRelation should still pass (inverse computed post-shift)";
}

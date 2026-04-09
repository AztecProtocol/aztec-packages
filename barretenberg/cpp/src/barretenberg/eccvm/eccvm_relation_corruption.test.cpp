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
    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(
        polynomials, params, num_rows, NUM_DISABLED_ROWS_IN_SUMCHECK);
    compute_grand_product<Flavor, ECCVMSetRelation<FF>>(polynomials, params);
    polynomials.z_perm_shift = Polynomial(polynomials.z_perm.shifted());

    return params;
}

/**
 * @brief Find the first transcript no-op row: all selectors zero, not first/last row.
 */
size_t find_transcript_noop_row(const ProverPolynomials& polynomials)
{
    const size_t num_rows = polynomials.get_polynomial_size();
    for (size_t i = NUM_DISABLED_ROWS_IN_SUMCHECK; i < num_rows - 1; i++) {
        if (polynomials.transcript_add[i] == FF(0) && polynomials.transcript_mul[i] == FF(0) &&
            polynomials.transcript_eq[i] == FF(0) && polynomials.transcript_reset_accumulator[i] == FF(0) &&
            polynomials.lagrange_first[i] == FF(0) && polynomials.lagrange_last[i] == FF(0)) {
            return i;
        }
    }
    return 0;
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

    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Confirm the first active MSM row is the transition row (offset by disabled head region)
    constexpr size_t first_msm_row = NUM_DISABLED_ROWS_IN_SUMCHECK + 1;
    ASSERT_EQ(polynomials.msm_add[first_msm_row], FF(1)) << "First MSM row should be an active MSM add row";
    ASSERT_EQ(polynomials.msm_transition[first_msm_row], FF(1)) << "First MSM row should have msm_transition=1";

    // Corrupt the accumulator at the transition row
    polynomials.msm_accumulator_x.at(first_msm_row) = FF::random_element(&engine);
    polynomials.msm_accumulator_y.at(first_msm_row) = FF::random_element(&engine);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
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

        auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
            polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
        EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

        // Find an interior addition row: q_add=1, msm_transition=0
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t active_row = 0;
        for (size_t i = NUM_DISABLED_ROWS_IN_SUMCHECK; i < num_rows - 1; i++) {
            if (polynomials.msm_add[i] == FF(1) && polynomials.msm_transition[i] == FF(0)) {
                active_row = i;
                break;
            }
        }
        ASSERT_NE(active_row, 0) << "Should find an interior active MSM add row";

        polynomials.msm_accumulator_x.at(active_row) = FF::random_element(&engine);
        polynomials.msm_accumulator_y.at(active_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
            polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
        EXPECT_FALSE(failures.empty()) << "MSM relation should fail after active-row accumulator corruption";
    }

    // --- Part 2: corrupt the accumulator at a trailing no-op row ---
    {
        auto polynomials = build_valid_eccvm_msm_state();

        // Find the first no-op row (all MSM selectors zero, not lagrange_first)
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t no_op_row = 0;
        for (size_t i = NUM_DISABLED_ROWS_IN_SUMCHECK; i < num_rows - 1; i++) {
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

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
            polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
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
    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    auto msm_polys = get_msm_polynomials(polynomials);

    // Shift every MSM column down by 1 within the active region
    constexpr size_t ofs = NUM_DISABLED_ROWS_IN_SUMCHECK;
    for (auto* poly : msm_polys) {
        for (size_t k = poly->end_index() - 1; k >= ofs + 2; k--) {
            poly->at(k) = (*poly)[k - 1];
        }
        poly->at(ofs + 1) = FF(0);
    }

    // Patch msm_size_of_msm at the injected row so the pc-continuity constraint is satisfied
    polynomials.msm_size_of_msm.at(ofs + 1) = polynomials.msm_pc[ofs + 1] - polynomials.msm_pc[ofs + 2];

    // Refresh shifted views
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
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
    auto transcript_failures = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, full_params, "ECCVMTranscriptRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(transcript_failures.empty()) << "ECCVMTranscriptRelation should still pass";

    auto point_table_failures = RelationChecker<void>::check<ECCVMPointTableRelation<FF>>(
        polynomials, full_params, "ECCVMPointTableRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(point_table_failures.empty()) << "ECCVMPointTableRelation should still pass";

    auto wnaf_failures = RelationChecker<void>::check<ECCVMWnafRelation<FF>>(
        polynomials, full_params, "ECCVMWnafRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(wnaf_failures.empty()) << "ECCVMWnafRelation should still pass";

    auto bools_failures = RelationChecker<void>::check<ECCVMBoolsRelation<FF>>(
        polynomials, full_params, "ECCVMBoolsRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(bools_failures.empty()) << "ECCVMBoolsRelation should still pass";

    // The Set relation enforces a multiset equality between MSM output tuples (pc, acc_x, acc_y, msm_size)
    // and the transcript. Shifting the MSM columns corrupts these tuples, so the grand product (computed
    // post-shift) reflects mismatched reads/writes and the relation correctly fails. It is possible that with more
    // care, we could make this also pass.
    auto set_failures = RelationChecker<void>::check<ECCVMSetRelation<FF>>(
        polynomials, full_params, "ECCVMSetRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_FALSE(set_failures.empty()) << "ECCVMSetRelation should also fail (MSM output tuples are shifted)";

    // The Lookup relation's logderivative inverse is computed post-shift, so it adapts to the
    // shifted column values. The per-row subrelation passes, and the sum-over-trace (linearly
    // dependent) subrelation also vanishes since the inverse was derived from the current data.
    auto lookup_failures = RelationChecker<void>::check<ECCVMLookupRelation<FF>, /*has_linearly_dependent=*/true>(
        polynomials, full_params, "ECCVMLookupRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(lookup_failures.empty()) << "ECCVMLookupRelation should still pass (inverse computed post-shift)";
}

/**
 * @brief On a transcript no-op row, setting accumulator_not_empty=1 must be caught by subrelation 22.
 *
 * @details The `accumulator_infinity_from_noop` term in subrelation 22 forces
 * is_accumulator_empty_shift = 1 whenever all selectors are zero. This test corrupts
 * the shifted value (i.e. accumulator_not_empty at row+1) to 1 and verifies detection.
 */
TEST_F(ECCVMRelationCorruptionTests, TranscriptNoOpRowRejectsAccumulatorNotEmpty)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, params, "ECCVMTranscriptRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(baseline.empty()) << "Baseline transcript relation should pass";

    size_t noop_row = find_transcript_noop_row(polynomials);
    ASSERT_NE(noop_row, 0) << "Should find a transcript no-op row";

    // The no-op constraint at row `noop_row` constrains is_accumulator_empty_shift,
    // which reads from accumulator_not_empty at row `noop_row + 1`.
    polynomials.transcript_accumulator_not_empty.at(noop_row + 1) = FF(1);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, params, "ECCVMTranscriptRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_FALSE(failures.empty()) << "Transcript relation should fail after corrupting accumulator_not_empty on "
                                      "the row following a no-op";
    EXPECT_TRUE(failures.contains(22)) << "Subrelation 22 (accumulator_infinity) should catch the corruption";
}

/**
 * @brief Test that z_perm must be zero at the lagrange_first row.
 *
 * @details The set relation grand product relies on z_perm[0] = 0 so that (z_perm + lagrange_first)
 * evaluates to 1 at the first row. Sub-relation Z_PERM_INIT (lagrange_first * z_perm = 0) enforces this.
 *
 * We cross-check the lagrange_first position two ways:
 *   1. Structurally: z_perm.start_index() - 1 (the zero row before the shiftable region)
 *   2. By scanning the lagrange_first polynomial for its non-zero entry
 */
TEST_F(ECCVMRelationCorruptionTests, SetRelationFailsOnZPermNonZeroAtFirstRow)
{
    auto polynomials = build_valid_eccvm_msm_state();
    auto params = compute_full_relation_params(polynomials);

    // Baseline: set relation passes (skip disabled head rows where masking values break relations)
    auto baseline = RelationChecker<void>::check<ECCVMSetRelation<FF>>(
        polynomials, params, "ECCVMSetRelation", NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_TRUE(baseline.empty()) << "Baseline set relation should pass";

    // Derive expected lagrange_first position from z_perm shiftable structure
    ASSERT_TRUE(polynomials.z_perm.is_shiftable());
    size_t structural_first_row = NUM_DISABLED_ROWS_IN_SUMCHECK;

    // Independently scan lagrange_first for its non-zero entry
    const auto& lagrange_first = polynomials.lagrange_first;
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

    // Expand to full polynomials so we can write at index 0
    polynomials.z_perm = polynomials.z_perm.full();
    polynomials.z_perm_shift = polynomials.z_perm_shift.full();

    ASSERT_EQ(polynomials.z_perm[first_row], FF(0));

    // Tamper: set z_perm to non-zero where lagrange_first is active
    polynomials.z_perm.at(first_row) = FF(1);

    auto failures = RelationChecker<void>::check<ECCVMSetRelation<FF>>(
        polynomials,
        params,
        "ECCVMSetRelation - After setting z_perm != 0 at lagrange_first",
        NUM_DISABLED_ROWS_IN_SUMCHECK);
    EXPECT_FALSE(failures.empty()) << "Set relation should fail after z_perm init corruption";
    EXPECT_TRUE(failures.contains(ECCVMSetRelationImpl<FF>::Z_PERM_INIT))
        << "Sub-relation Z_PERM_INIT should catch the corruption";
    EXPECT_EQ(failures.at(ECCVMSetRelationImpl<FF>::Z_PERM_INIT), first_row)
        << "Failure should be at lagrange_first row";
}

/**
 * @brief Shiftable columns constrained by lagrange_first-activated initialization relations.
 *
 * @details Corrupting the *shifted* value (P[k+1]) of these columns at the lagrange_first row
 * must be caught by specific initialization subrelations in the WNAF relation.
 */
TEST_F(ECCVMRelationCorruptionTests, ShiftableInitializationConstraints)
{
    const size_t first_row = NUM_DISABLED_ROWS_IN_SUMCHECK;
    RelationParameters<FF> params{};

    // Evaluate the WNAF relation at exactly the lagrange_first row, returning per-subrelation values.
    auto eval_wnaf_at_first_row = [&](const auto& polys) {
        typename ECCVMWnafRelation<FF>::SumcheckArrayOfValuesOverSubrelations result{};
        for (auto& e : result) {
            e = FF(0);
        }
        ECCVMWnafRelation<FF>::accumulate(result, polys.get_row(first_row), params, FF(1));
        return result;
    };

    // precompute_round_shift must be 0 at lagrange_first (ROUND_SHIFT_ZERO)
    {
        auto polys = build_valid_eccvm_msm_state();
        ASSERT_EQ(polys.lagrange_first[first_row], FF(1));
        auto clean = eval_wnaf_at_first_row(polys);
        ASSERT_EQ(clean[ECCVMWnafRelationImpl<FF>::ROUND_SHIFT_ZERO], FF(0)) << "Baseline should be zero";

        polys.precompute_round.at(first_row + 1) = FF(5);
        polys.set_shifted();
        auto dirty = eval_wnaf_at_first_row(polys);
        EXPECT_NE(dirty[ECCVMWnafRelationImpl<FF>::ROUND_SHIFT_ZERO], FF(0))
            << "ROUND_SHIFT_ZERO must catch non-zero precompute_round_shift at lagrange_first row";
    }

    // precompute_scalar_sum_shift must be 0 at lagrange_first (SCALAR_SUM_SHIFT_ZERO)
    {
        auto polys = build_valid_eccvm_msm_state();
        auto clean = eval_wnaf_at_first_row(polys);
        ASSERT_EQ(clean[ECCVMWnafRelationImpl<FF>::SCALAR_SUM_SHIFT_ZERO], FF(0)) << "Baseline should be zero";

        polys.precompute_scalar_sum.at(first_row + 1) = FF(42);
        polys.set_shifted();
        auto dirty = eval_wnaf_at_first_row(polys);
        EXPECT_NE(dirty[ECCVMWnafRelationImpl<FF>::SCALAR_SUM_SHIFT_ZERO], FF(0))
            << "SCALAR_SUM_SHIFT_ZERO must catch non-zero precompute_scalar_sum_shift at lagrange_first row";
    }

    // precompute_s1hi_shift must be in {2, 3} when precompute_select_shift != 0 (FIRST_SLICE_POSITIVE)
    {
        auto polys = build_valid_eccvm_msm_state();
        ASSERT_NE(polys.precompute_select[first_row + 1], FF(0))
            << "Test assumes precompute_select is active at first_row + 1";
        auto clean = eval_wnaf_at_first_row(polys);
        ASSERT_EQ(clean[ECCVMWnafRelationImpl<FF>::FIRST_SLICE_POSITIVE], FF(0)) << "Baseline should be zero";

        polys.precompute_s1hi.at(first_row + 1) = FF(0); // 0 ∉ {2, 3}
        polys.set_shifted();
        auto dirty = eval_wnaf_at_first_row(polys);
        EXPECT_NE(dirty[ECCVMWnafRelationImpl<FF>::FIRST_SLICE_POSITIVE], FF(0))
            << "FIRST_SLICE_POSITIVE must catch s1hi_shift not in {2,3} at lagrange_first row";
    }
}

/**
 * @brief Verify that "harmless" shiftable columns are truly unconstrained at the lagrange_first row.
 *
 * @details For each column documented as "harmless" in eccvm_flavor.hpp, corrupt its value at the
 * lagrange_first row and verify that no relation subrelation goes from zero to non-zero at that row.
 * This confirms the column's value at row k does not enter any active relation.
 *
 * This test also serves as a regression guard: if a future change adds a relation term that references
 * one of these columns at the lagrange_first row without proper gating, this test will fail — signaling
 * that a new boundary constraint (lagrange_first * column = 0) is needed.
 */
TEST_F(ECCVMRelationCorruptionTests, HarmlessColumnsUnconstrainedAtLagrangeFirst)
{
    const size_t first_row = NUM_DISABLED_ROWS_IN_SUMCHECK;
    RelationParameters<FF> params{};

    auto eval_at_row = []<typename Relation>(const auto& polys, const auto& p, size_t row) {
        typename Relation::SumcheckArrayOfValuesOverSubrelations result{};
        for (auto& e : result) {
            e = FF(0);
        }
        Relation::accumulate(result, polys.get_row(row), p, FF(1));
        return result;
    };

    struct ColumnSpec {
        Flavor::Polynomial ProverPolynomials::* poly;
        const char* name;
    };

    // These are the columns claimed to be harmless in the eccvm_flavor.hpp doc.
    std::vector<ColumnSpec> harmless_columns = {
        { &ProverPolynomials::precompute_dx, "precompute_dx (col 4)" },
        { &ProverPolynomials::precompute_dy, "precompute_dy (col 5)" },
        { &ProverPolynomials::precompute_tx, "precompute_tx (col 6)" },
        { &ProverPolynomials::precompute_ty, "precompute_ty (col 7)" },
        { &ProverPolynomials::msm_transition, "msm_transition (col 8)" },
        { &ProverPolynomials::msm_accumulator_x, "msm_accumulator_x (col 12)" },
        { &ProverPolynomials::msm_accumulator_y, "msm_accumulator_y (col 13)" },
        { &ProverPolynomials::msm_count, "msm_count (col 14)" },
        { &ProverPolynomials::msm_round, "msm_round (col 15)" },
        { &ProverPolynomials::msm_pc, "msm_pc (col 17)" },
        { &ProverPolynomials::transcript_pc, "transcript_pc (col 19)" },
    };

    for (const auto& col : harmless_columns) {
        auto polynomials = build_valid_eccvm_msm_state();
        ASSERT_EQ(polynomials.lagrange_first[first_row], FF(1));

        auto tx_clean = eval_at_row.template operator()<ECCVMTranscriptRelation<FF>>(polynomials, params, first_row);
        auto msm_clean = eval_at_row.template operator()<ECCVMMSMRelation<FF>>(polynomials, params, first_row);
        auto wnaf_clean = eval_at_row.template operator()<ECCVMWnafRelation<FF>>(polynomials, params, first_row);
        auto pt_clean = eval_at_row.template operator()<ECCVMPointTableRelation<FF>>(polynomials, params, first_row);

        (polynomials.*col.poly).at(first_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto tx_dirty = eval_at_row.template operator()<ECCVMTranscriptRelation<FF>>(polynomials, params, first_row);
        auto msm_dirty = eval_at_row.template operator()<ECCVMMSMRelation<FF>>(polynomials, params, first_row);
        auto wnaf_dirty = eval_at_row.template operator()<ECCVMWnafRelation<FF>>(polynomials, params, first_row);
        auto pt_dirty = eval_at_row.template operator()<ECCVMPointTableRelation<FF>>(polynomials, params, first_row);

        auto check = [&](const auto& clean, const auto& dirty, const char* rel) {
            for (size_t i = 0; i < clean.size(); i++) {
                if (clean[i] == FF(0) && dirty[i] != FF(0)) {
                    ADD_FAILURE() << col.name << " is NOT harmless: " << rel << " subrelation " << i
                                  << " became non-zero at lagrange_first row";
                }
            }
        };
        check(tx_clean, tx_dirty, "TranscriptRelation");
        check(msm_clean, msm_dirty, "MSMRelation");
        check(wnaf_clean, wnaf_dirty, "WnafRelation");
        check(pt_clean, pt_dirty, "PointTableRelation");
    }
}

// TODO(@notnotraju):
// Add constraint `lagrange_first * transcript_accumulator_not_empty = 0` to ECCVMTranscriptRelation.
// Without it, a malicious prover can set accumulator_not_empty = 1 at the lagrange_first row,
// disabling INFINITY_ACC_X/Y and injecting arbitrary accumulator coordinates undetected.
// Once the constraint is added, flip this test: EXPECT_FALSE(no_new_nonzero(...)) for TranscriptRelation.

/**
 * @brief Demonstrate that transcript_accumulator_not_empty is UNCONSTRAINED at the lagrange_first row.
 *
 * @details A malicious prover can set accumulator_not_empty = 1 at the lagrange_first row, which
 * disables INFINITY_ACC_X/Y (the constraints that force accumulator coordinates to zero when the
 * accumulator is "empty"). This allows injecting arbitrary accumulator coordinates at row k
 * without any relation firing.
 *
 * This test proves the gap exists: all four ECCVM relation families evaluate to the same values
 * at the lagrange_first row before and after the corruption. No subrelation catches it.
 *
 * Fix: add `lagrange_first * transcript_accumulator_not_empty = 0` to the transcript relation.
 */
TEST_F(ECCVMRelationCorruptionTests, AccumulatorNotEmptyUnconstrainedAtLagrangeFirst)
{
    const size_t first_row = NUM_DISABLED_ROWS_IN_SUMCHECK;
    RelationParameters<FF> params{};

    // Helper: evaluate a relation at a single row, returning per-subrelation values
    auto eval_at_row = []<typename Relation>(const auto& polys, const auto& p, size_t row) {
        typename Relation::SumcheckArrayOfValuesOverSubrelations result{};
        for (auto& e : result) {
            e = FF(0);
        }
        Relation::accumulate(result, polys.get_row(row), p, FF(1));
        return result;
    };

    auto polynomials = build_valid_eccvm_msm_state();
    ASSERT_EQ(polynomials.lagrange_first[first_row], FF(1));

    // Baseline at the lagrange_first row
    auto tx_clean = eval_at_row.template operator()<ECCVMTranscriptRelation<FF>>(polynomials, params, first_row);
    auto msm_clean = eval_at_row.template operator()<ECCVMMSMRelation<FF>>(polynomials, params, first_row);
    auto wnaf_clean = eval_at_row.template operator()<ECCVMWnafRelation<FF>>(polynomials, params, first_row);
    auto pt_clean = eval_at_row.template operator()<ECCVMPointTableRelation<FF>>(polynomials, params, first_row);

    // Corrupt: set accumulator_not_empty = 1 and inject arbitrary accumulator coordinates.
    // With accumulator_not_empty = 1, is_accumulator_empty = 0, so INFINITY_ACC_X/Y no longer
    // forces accumulator_x/y to zero.
    polynomials.transcript_accumulator_not_empty.at(first_row) = FF(1);
    polynomials.transcript_accumulator_x.at(first_row) = FF::random_element(&engine);
    polynomials.transcript_accumulator_y.at(first_row) = FF::random_element(&engine);
    polynomials.set_shifted();

    // Evaluate after corruption
    auto tx_dirty = eval_at_row.template operator()<ECCVMTranscriptRelation<FF>>(polynomials, params, first_row);
    auto msm_dirty = eval_at_row.template operator()<ECCVMMSMRelation<FF>>(polynomials, params, first_row);
    auto wnaf_dirty = eval_at_row.template operator()<ECCVMWnafRelation<FF>>(polynomials, params, first_row);
    auto pt_dirty = eval_at_row.template operator()<ECCVMPointTableRelation<FF>>(polynomials, params, first_row);

    // No relation should catch this — that's the gap.
    auto no_new_nonzero = [](const auto& clean, const auto& dirty) {
        for (size_t i = 0; i < clean.size(); i++) {
            if (clean[i] == FF(0) && dirty[i] != FF(0)) {
                return false;
            }
        }
        return true;
    };
    EXPECT_TRUE(no_new_nonzero(tx_clean, tx_dirty)) << "TranscriptRelation should not catch this";
    EXPECT_TRUE(no_new_nonzero(msm_clean, msm_dirty)) << "MSMRelation should not catch this";
    EXPECT_TRUE(no_new_nonzero(wnaf_clean, wnaf_dirty)) << "WnafRelation should not catch this";
    EXPECT_TRUE(no_new_nonzero(pt_clean, pt_dirty)) << "PointTableRelation should not catch this";
}

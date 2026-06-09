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

void expand_shiftable_to_virtual_size(Polynomial& polynomial)
{
    polynomial = Polynomial(polynomial, polynomial.virtual_size() - polynomial.start_index());
}

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
        &polys.msm_round_minus_31_inv,
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
 * @brief Build valid ProverPolynomials with a single MSM of `num_points` points.
 *
 * @details The skew round spans `ceil(num_points / 4)` rows, so `num_points >= 9` yields a skew
 * round with interior rows (skew rows that are neither the first nor the last of the round). These
 * interior skew rows are what MSM_PC_SKEW_CONTINUITY pins.
 */
ProverPolynomials build_valid_eccvm_large_msm_state(size_t num_points)
{
    auto generators = G1::derive_generators("test generators", num_points);

    auto op_queue = std::make_shared<ECCOpQueue>();
    for (size_t i = 0; i < num_points; i++) {
        op_queue->mul_accumulate(generators[i], Fr::random_element(&engine));
    }
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

    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(polynomials, params, Flavor::TRACE_OFFSET);
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
    for (size_t i = Flavor::TRACE_OFFSET; i < num_rows - 1; i++) {
        if (polynomials.transcript_add.get(i) == FF(0) && polynomials.transcript_mul.get(i) == FF(0) &&
            polynomials.transcript_eq.get(i) == FF(0) && polynomials.transcript_reset_accumulator.get(i) == FF(0) &&
            polynomials.lagrange_first.get(i) == FF(0) && polynomials.lagrange_last.get(i) == FF(0)) {
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
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Confirm the first active MSM row is the transition row (offset by disabled head region)
    constexpr size_t first_msm_row = Flavor::TRACE_OFFSET + 1;
    ASSERT_EQ(polynomials.msm_add.get(first_msm_row), FF(1)) << "First MSM row should be an active MSM add row";
    ASSERT_EQ(polynomials.msm_transition.get(first_msm_row), FF(1)) << "First MSM row should have msm_transition=1";

    // Corrupt the accumulator at the transition row
    polynomials.msm_accumulator_x.at(first_msm_row) = FF::random_element(&engine);
    polynomials.msm_accumulator_y.at(first_msm_row) = FF::random_element(&engine);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
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
            polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
        EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

        // Find an interior addition row: q_add=1, msm_transition=0
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t active_row = 0;
        for (size_t i = Flavor::TRACE_OFFSET; i < num_rows - 1; i++) {
            if (polynomials.msm_add.get(i) == FF(1) && polynomials.msm_transition.get(i) == FF(0)) {
                active_row = i;
                break;
            }
        }
        ASSERT_NE(active_row, 0) << "Should find an interior active MSM add row";

        polynomials.msm_accumulator_x.at(active_row) = FF::random_element(&engine);
        polynomials.msm_accumulator_y.at(active_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
            polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
        EXPECT_FALSE(failures.empty()) << "MSM relation should fail after active-row accumulator corruption";
    }

    // --- Part 2: corrupt the accumulator at a trailing no-op row ---
    {
        auto polynomials = build_valid_eccvm_msm_state();

        // Find the first no-op row (all MSM selectors zero, not lagrange_first)
        const size_t num_rows = polynomials.get_polynomial_size();
        size_t no_op_row = 0;
        for (size_t i = Flavor::TRACE_OFFSET; i < num_rows - 1; i++) {
            if (polynomials.msm_add.get(i) == FF(0) && polynomials.msm_double.get(i) == FF(0) &&
                polynomials.msm_skew.get(i) == FF(0) && polynomials.msm_transition.get(i) == FF(0) &&
                polynomials.lagrange_first.get(i) == FF(0)) {
                no_op_row = i;
                break;
            }
        }
        ASSERT_NE(no_op_row, 0) << "Should find a no-op row in the MSM table";

        expand_shiftable_to_virtual_size(polynomials.msm_accumulator_x);
        expand_shiftable_to_virtual_size(polynomials.msm_accumulator_y);
        polynomials.msm_accumulator_x.at(no_op_row) = FF::random_element(&engine);
        polynomials.msm_accumulator_y.at(no_op_row) = FF::random_element(&engine);
        polynomials.set_shifted();

        auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
            polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
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
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    auto msm_polys = get_msm_polynomials(polynomials);

    // Shift every MSM column down by 1 within the active region
    constexpr size_t ofs = Flavor::TRACE_OFFSET;
    for (auto* poly : msm_polys) {
        for (size_t k = poly->end_index() - 1; k >= ofs + 2; k--) {
            poly->at(k) = (*poly)[k - 1];
        }
        poly->at(ofs + 1) = FF(0);
    }

    // Patch msm_size_of_msm at the injected row so the pc-continuity constraint is satisfied
    polynomials.msm_size_of_msm.at(ofs + 1) = polynomials.msm_pc.get(ofs + 1) - polynomials.msm_pc.get(ofs + 2);

    // Refresh shifted views
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "MSM relation should fail after shifting MSM table by one row";

    // Log all failing subrelations for visibility
    for (const auto& [subrelation_idx, row_idx] : failures) {
        info("Shifted MSM table: subrelation ", subrelation_idx, " first failed at row ", row_idx);
    }

    EXPECT_TRUE(failures.contains(45)) << "Subrelation 45 (no-op acc_x preservation) should fail";
    EXPECT_TRUE(failures.contains(46)) << "Subrelation 46 (no-op acc_y preservation) should fail";

    // Verify that all other ECCVM relations still pass after the shift.
    // We compute random Fiat-Shamir challenges and derived polynomials (logderivative inverse, grand product)
    // so we can also check ECCVMSetRelation and ECCVMLookupRelation.
    auto full_params = compute_full_relation_params(polynomials);

    // Relations that don't touch MSM columns should be completely unaffected.
    auto transcript_failures = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, full_params, "ECCVMTranscriptRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(transcript_failures.empty()) << "ECCVMTranscriptRelation should still pass";

    auto point_table_failures = RelationChecker<void>::check<ECCVMPointTableRelation<FF>>(
        polynomials, full_params, "ECCVMPointTableRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(point_table_failures.empty()) << "ECCVMPointTableRelation should still pass";

    auto wnaf_failures = RelationChecker<void>::check<ECCVMWnafRelation<FF>>(
        polynomials, full_params, "ECCVMWnafRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(wnaf_failures.empty()) << "ECCVMWnafRelation should still pass";

    auto bools_failures = RelationChecker<void>::check<ECCVMBoolsRelation<FF>>(
        polynomials, full_params, "ECCVMBoolsRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(bools_failures.empty()) << "ECCVMBoolsRelation should still pass";

    // The Set relation enforces a multiset equality between MSM output tuples (pc, acc_x, acc_y, msm_size)
    // and the transcript. Shifting the MSM columns corrupts these tuples, so the grand product (computed
    // post-shift) reflects mismatched reads/writes and the relation correctly fails. It is possible that with more
    // care, we could make this also pass.
    auto set_failures = RelationChecker<void>::check<ECCVMSetRelation<FF>>(
        polynomials, full_params, "ECCVMSetRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(set_failures.empty()) << "ECCVMSetRelation should also fail (MSM output tuples are shifted)";

    // The Lookup relation's logderivative inverse is computed post-shift, so it adapts to the
    // shifted column values. The per-row subrelation passes, and the sum-over-trace (linearly
    // dependent) subrelation also vanishes since the inverse was derived from the current data.
    auto lookup_failures = RelationChecker<void>::check<ECCVMLookupRelation<FF>, /*has_linearly_dependent=*/true>(
        polynomials, full_params, "ECCVMLookupRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(lookup_failures.empty()) << "ECCVMLookupRelation should still pass (inverse computed post-shift)";
}

/**
 * @brief On a transcript no-op row, setting accumulator_not_empty=1 must be caught by the
 *        ACCUMULATOR_EMPTY_UPDATE subrelation.
 *
 * @details The `accumulator_infinity_from_noop` term in that subrelation forces
 * is_accumulator_empty_shift = 1 whenever all selectors are zero. This test corrupts
 * the shifted value (i.e. accumulator_not_empty at row+1) to 1 and verifies detection.
 */
TEST_F(ECCVMRelationCorruptionTests, TranscriptNoOpRowRejectsAccumulatorNotEmpty)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, params, "ECCVMTranscriptRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline transcript relation should pass";

    size_t noop_row = find_transcript_noop_row(polynomials);
    ASSERT_NE(noop_row, 0) << "Should find a transcript no-op row";

    // The no-op constraint at row `noop_row` constrains is_accumulator_empty_shift,
    // which reads from accumulator_not_empty at row `noop_row + 1`.
    expand_shiftable_to_virtual_size(polynomials.transcript_accumulator_not_empty);
    polynomials.transcript_accumulator_not_empty.at(noop_row + 1) = FF(1);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, params, "ECCVMTranscriptRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "Transcript relation should fail after corrupting accumulator_not_empty on "
                                      "the row following a no-op";
    EXPECT_TRUE(failures.contains(ECCVMTranscriptRelationImpl<FF>::ACCUMULATOR_EMPTY_UPDATE))
        << "ACCUMULATOR_EMPTY_UPDATE subrelation should catch the corruption";
}

/**
 * @brief Test that z_perm must be zero at the lagrange_first row.
 *
 * @details The set relation grand product relies on z_perm[lagrange_first row] = 0 so that
 * (z_perm + lagrange_first) evaluates to 1 at the first row. Sub-relation Z_PERM_INIT
 * (lagrange_first * z_perm = 0) — housed in ECCVMShiftableInitRelation — enforces this.
 *
 * We cross-check the lagrange_first position two ways:
 *   1. Structurally: z_perm.start_index() - 1 (the zero row before the shiftable region)
 *   2. By scanning the lagrange_first polynomial for its non-zero entry
 */
TEST_F(ECCVMRelationCorruptionTests, ShiftableInitFailsOnZPermNonZeroAtFirstRow)
{
    auto polynomials = build_valid_eccvm_msm_state();
    auto params = compute_full_relation_params(polynomials);

    // Baseline: the shiftable init relation passes
    auto baseline = RelationChecker<void>::check<ECCVMShiftableInitRelation<FF>>(
        polynomials, params, "ECCVMShiftableInitRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline shiftable init relation should pass";

    // Derive expected lagrange_first position from z_perm shiftable structure
    ASSERT_TRUE(polynomials.z_perm.is_shiftable());
    size_t structural_first_row = Flavor::TRACE_OFFSET;

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

    ASSERT_EQ(polynomials.z_perm.get(first_row), FF(0));

    // Tamper: set z_perm to non-zero where lagrange_first is active
    polynomials.z_perm.at(first_row) = FF(1);

    auto failures = RelationChecker<void>::check<ECCVMShiftableInitRelation<FF>>(
        polynomials, params, "ECCVMShiftableInitRelation - After z_perm != 0 at lagrange_first", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "Shiftable init relation should fail after z_perm corruption";
    EXPECT_TRUE(failures.contains(ECCVMShiftableInitRelationImpl<FF>::Z_PERM_INIT))
        << "Sub-relation Z_PERM_INIT should catch the corruption";
    EXPECT_EQ(failures.at(ECCVMShiftableInitRelationImpl<FF>::Z_PERM_INIT), first_row)
        << "Failure should be at lagrange_first row";
}

/**
 * @brief Verify that the DOUBLE_SHIFT_FORBIDS_ROUND_31 gate catches a missing round != 31 witness.
 *
 * @details Background: this gate guards against a soundness gap in the original ECCVM MSM relation,
 * where the converse "round = 31 ==> q_skew_shift = 1" was not constrained. The fix is the new
 * subrelation
 *   q_double_shift * (1 - (round - 31) * round_minus_31_inv) = 0,
 * which forces the prover to witness an inverse of (round - 31) at every row whose successor is a
 * double, making round = 31 unreachable there. This test exercises the gate the simple way: at a
 * valid `q_double_shift = 1` row, zero out the inverse witness and confirm only this gate fires.
 *
 * The original full PoC (kept as commentary so an attentive reader/LLM can reconstruct it):
 *
 *   Setup: a size-1 MSM with a 128-bit odd scalar `s`, e.g.
 *     Fr s = Fr(uint256_t(0x0123456789abcdefULL, 0x0fedcba987654321ULL, 0, 0));
 *     op_queue.mul_accumulate(P, s); op_queue.eq_and_reset(); op_queue.merge();
 *     // followed by `add_hiding_op_for_test(op_queue)` so the trace finalizes.
 *   Such a scalar gives z2 = 0 (single-mul MSM) and odd LSB so wnaf_skew = false, hence
 *   precompute_skew = 0 — the precondition for the round 31->32 phase swap.
 *
 *   Honest layout, with R = the unique row carrying msm_skew = 1, msm_round = 32:
 *     row R-1: q_add = 1, round = 31 (last add of digit 31)
 *     row R  : q_skew = 1, round = 32, (msm_x1, msm_y1) = T[0] = -15*P (lookup with slice1 = 0)
 *     row R+1: synthetic final (msm_transition = 1, round = 0, all selectors = 0)
 *     row R+2: padding (all zero)
 *
 *   Malicious patch: turn row R into a q_double, append a same-MSM q_add at row R+1 with
 *   round = 32 and slice1 = 0 (so the lookup forces (x1, y1) = T[0] = -15*P), and shift the
 *   synthetic final to row R+2:
 *     row R: msm_skew = 0, msm_double = 1; witness lambdas l1..l4 of the four doublings
 *            d1 = 2*acc_R, d2 = 2*d1, d3 = 2*d2, d4 = 2*d3 = 16*acc_R; clear msm_add1, msm_x1,
 *            msm_y1, msm_collision_x1.
 *     row R+1: msm_transition = 0, msm_add = 1, msm_round = 32, msm_count = 0,
 *              msm_size_of_msm = 1, msm_pc = msm_pc[R], msm_add1 = 1, msm_slice1 = 0,
 *              (msm_x1, msm_y1) = -15*P; lambda1 = (d4.y - (-15*P).y) / (d4.x - (-15*P).x),
 *              collision_x1 = 1 / ((-15*P).x - d4.x); accumulator = d4.
 *     row R+2: msm_transition = 1; (acc_x, acc_y) = malicious_acc, where
 *              malicious_acc = d4 + (-15*P) = 16 * (2^124*OFFSET + s*P) - 15*P
 *                            = 2^128 * OFFSET + (16s - 15) * P.
 *
 *   Transcript columns also need to be patched at the row t with transcript_msm_transition = 1:
 *     transcript_msm_x/y = malicious_acc;
 *     intermediate = malicious_acc - 2^124 * ECCVM_OFFSET_GENERATOR (do this via affine subtraction;
 *       remember offset_affine.y is negated to subtract);
 *     transcript_msm_intermediate_x/y = intermediate;
 *     transcript_msm_x_inverse = 1 / (malicious_acc.x - (-offset).x);
 *     transcript_base_x_inverse = 1 / intermediate.x;
 *     transcript_base_y_inverse = 1 / intermediate.y;
 *     at row t+1 (transcript accumulator after add): (transcript_accumulator_x/y, Px, Py) = intermediate
 *       (the running accumulator was empty after eq_and_reset, so add returns lhs).
 *
 *   Lookup-inverse hygiene: row R is no longer active for the lookup relation after the q_skew ->
 *   q_double swap, but compute_logderivative_inverse only overwrites active rows, so explicitly clear
 *   polynomials.lookup_inverses.at(R) = 0 before re-running set_shifted().
 *
 *   With the fix, the new gate rejects the malicious trace at row R: msm_double[R+1] = 1 demands an
 *   inverse witness for (msm_round[R] - 31), and msm_round[R] - 31 = 0 has none. Without the fix,
 *   every relation (MSM, Bools, Transcript, Set, Lookup) accepted the patched trace.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRelationRejectsMissingRoundMinus31Inverse)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    ASSERT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Find a row whose successor is an MSM double. The new gate constrains row k (carrying
    // round[k] and round_minus_31_inv[k]) whenever q_double[k+1] = 1.
    const size_t num_rows = polynomials.get_polynomial_size();
    size_t target_row = 0;
    for (size_t i = Flavor::TRACE_OFFSET; i + 1 < num_rows; ++i) {
        if (polynomials.msm_double[i + 1] == FF(1)) {
            target_row = i;
            break;
        }
    }
    ASSERT_NE(target_row, 0U) << "Should find a row preceding a doubling row";
    ASSERT_NE(polynomials.msm_round[target_row], FF(31)) << "Honest predecessors of double rows have round != 31";
    ASSERT_NE(polynomials.msm_round_minus_31_inv[target_row], FF(0))
        << "Honest inverse witness should be non-zero where round != 31";

    polynomials.msm_round_minus_31_inv.at(target_row) = FF(0);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "MSM relation should fail without the round != 31 witness";
    EXPECT_TRUE(failures.contains(ECCVMMSMRelationImpl<FF>::DOUBLE_SHIFT_FORBIDS_ROUND_31))
        << "DOUBLE_SHIFT_FORBIDS_ROUND_31 should be the failing subrelation";
}

/**
 * @brief Regression test for the MSM-start anchor (MSM_TRANSITION_AT_ACTIVE_START).
 *
 * The full attack (pre-fix): `first_add` is gated on `msm_transition`: when msm_transition = 0 the
 * chain begins from the row's witness (acc_x, acc_y) instead of offset_generator. A prover flips
 * msm_transition[first_msm_row] from 1 to 0, replaces (acc_x, acc_y) at that row with any chosen
 * point A, recomputes lambda1 and the resulting acc_shift, and propagates the new (acc_x, acc_y)
 * chain through every subsequent ADD/DOUBLE/SKEW row of the MSM. The set relation's third term
 * cross-checks (msm_acc_x_shift, msm_acc_y_shift) at the synthetic-final sentinel against the
 * transcript's transcript_msm_(x,y), which the prover patches to match. The transcript subtracts
 * a fixed offset_generator, so the user-visible MSM result is shifted by (A - offset_generator).
 *
 * What this test proves: that the new MSM_TRANSITION_AT_ACTIVE_START subrelation fires on the
 * msm_transition flip. We do NOT recompute the acc/lambda chain or the transcript patches -- the
 * point of the test is to certify that *the missing pin is now in place*, not to reconstruct the
 * full forgery.
 *
 * Why the minimal flip is a faithful regression target:
 * On the honest trace, (acc_x, acc_y) at the first MSM row is exactly offset_generator. With
 * those values, `first_add` produces the same output for both msm_transition branches
 * (selector = 1 plants offset_generator literal; selector = 0 reads (acc_x, acc_y) which equals
 * offset_generator). So the flip is invisible to every relation that consumes acc downstream --
 * pre-fix every relation passed despite the flip (this is precisely what made the attack viable).
 * Post-fix, the new gate detects the flip directly and the rest of the trace is unchanged.
 *
 * Trace layout (recall TRACE_OFFSET disabled rows precede the active region):
 *   rows 0..TRACE_OFFSET-1     -- disabled head region
 *   row  TRACE_OFFSET          -- lagrange_first, all phase selectors off
 *   row  TRACE_OFFSET + 1      -- first MSM row: q_add = 1, msm_transition = 1 honestly
 *
 * Where the new subrelation is non-trivial:
 * `curr_not_phase * next_phase * (msm_transition_shift - 1)` is checked at every row. The first
 * two factors are simultaneously non-zero only at "MSM-start boundaries" -- rows whose successor
 * activates a phase: lagrange_first -> first MSM, and synthetic-final sentinel of one MSM ->
 * start of the next. The third factor pins msm_transition to 1 on the next row at every such
 * boundary. This fixture has a single MSM, so the lagrange_first row is the only such boundary.
 * Flipping msm_transition[TRACE_OFFSET + 1] from 1 to 0 makes the third factor -1 at row
 * TRACE_OFFSET and the relation fails.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRelationRejectsTransitionZeroOnFirstRow)
{
    auto polynomials = build_valid_eccvm_msm_state();
    auto params = compute_full_relation_params(polynomials);

    EXPECT_TRUE(
        RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params, "MSM", Flavor::TRACE_OFFSET).empty());
    EXPECT_TRUE(
        RelationChecker<void>::check<ECCVMSetRelation<FF>>(polynomials, params, "Set", Flavor::TRACE_OFFSET).empty());
    EXPECT_TRUE((RelationChecker<void>::check<ECCVMLookupRelation<FF>, /*has_linearly_dependent=*/true>(
                     polynomials, params, "Lookup", Flavor::TRACE_OFFSET)
                     .empty()));

    constexpr size_t first_msm_row = Flavor::TRACE_OFFSET + 1;
    ASSERT_EQ(polynomials.msm_transition[first_msm_row], FF(1));
    ASSERT_EQ(polynomials.msm_add[first_msm_row], FF(1));
    polynomials.msm_transition.at(first_msm_row) = FF(0);
    polynomials.set_shifted();

    // Recompute logderivative inverse / grand product since msm_transition feeds into them.
    auto params_after = compute_full_relation_params(polynomials);

    auto msm_failures =
        RelationChecker<void>::check<ECCVMMSMRelation<FF>>(polynomials, params_after, "MSM", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(msm_failures.empty()) << "MSM-start anchor should reject msm_transition[first_msm_row] = 0";
    EXPECT_TRUE(msm_failures.contains(ECCVMMSMRelationImpl<FF>::MSM_TRANSITION_AT_ACTIVE_START))
        << "The rejecting subrelation should be the MSM-start anchor";

    // The rejection is exclusively in the MSM relation: the other relations have no role anchoring
    // msm_transition at the first MSM row.
    EXPECT_TRUE(
        RelationChecker<void>::check<ECCVMSetRelation<FF>>(polynomials, params_after, "Set", Flavor::TRACE_OFFSET)
            .empty());
    EXPECT_TRUE((RelationChecker<void>::check<ECCVMLookupRelation<FF>, /*has_linearly_dependent=*/true>(
                     polynomials, params_after, "Lookup", Flavor::TRACE_OFFSET)
                     .empty()));
}

/**
 * @brief MSM_PC_CONTINUITY rejects any tamper of `msm_pc` on an interior ADD or DOUBLE row.
 *
 * @details Before this subrelation existed, the MSM relation's only msm_pc constraint
 * (MSM_TRANSITION_PC) was gated by `msm_transition_shift`, so it fired only at MSM segment
 * boundaries. An attacker could swap `msm_pc` between two same-base MSMs on a single interior
 * round and the WNAF/lookup multisets would still balance (both swapped tuples are valid writes).
 * MSM_PC_CONTINUITY pins `msm_pc` constant across every interior ADD or DOUBLE row, so the
 * constraint at the row immediately preceding any such swap detects it.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRelationRejectsInteriorMsmPcTamper)
{
    auto polynomials = build_valid_eccvm_msm_state();
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Find an interior ADD row such that the previous row is also active and not a segment
    // boundary (msm_transition_shift on the previous row is 0). MSM_PC_CONTINUITY will fire at
    // that previous row when we tamper msm_pc on the chosen row.
    const size_t num_rows = polynomials.get_polynomial_size();
    size_t tamper_row = 0;
    for (size_t i = Flavor::TRACE_OFFSET + 2; i < num_rows - 1; i++) {
        const bool curr_is_add = polynomials.msm_add[i] == FF(1);
        const bool prev_is_active = polynomials.msm_add[i - 1] == FF(1) || polynomials.msm_double[i - 1] == FF(1);
        const bool not_segment_boundary = polynomials.msm_transition[i] == FF(0);
        if (curr_is_add && prev_is_active && not_segment_boundary) {
            tamper_row = i;
            break;
        }
    }
    ASSERT_NE(tamper_row, 0) << "Should find an interior ADD row with an active predecessor";

    polynomials.msm_pc.at(tamper_row) = polynomials.msm_pc[tamper_row] + FF(0xdead);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "MSM relation should reject msm_pc tamper on an interior row";
    EXPECT_TRUE(failures.contains(ECCVMMSMRelationImpl<FF>::MSM_PC_CONTINUITY))
        << "MSM_PC_CONTINUITY should be among the failing subrelations";
}

/**
 * @brief Reject an arbitrary msm_pc on an interior SKEW row.
 *
 * @details MSM_PC_CONTINUITY excludes q_skew from its active phase, and MSM_TRANSITION_PC only pins
 * the last skew row of a segment. For an MSM with a skew round of >= 3 rows (msm_size >= 9), the
 * interior skew rows are pinned by neither, so a prover could swap msm_pc on such a row between two
 * segments; the point-table lookup multiset still balances but the skew corrections are applied to
 * the wrong accumulators. MSM_PC_SKEW_CONTINUITY (q_skew * q_skew_shift) pins msm_pc across every
 * pair of consecutive skew rows, detecting the tamper at the preceding skew row.
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRelationRejectsInteriorSkewMsmPcTamper)
{
    auto polynomials = build_valid_eccvm_large_msm_state(/*num_points=*/10);
    RelationParameters<FF> params{};

    auto baseline = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Find an interior skew row: q_skew = 1 on the previous, current and next rows. Tampering
    // msm_pc here is caught only by MSM_PC_SKEW_CONTINUITY (firing at the previous skew row), since
    // neither MSM_PC_CONTINUITY (q_skew excluded) nor MSM_TRANSITION_PC (msm_transition_shift = 0)
    // constrains it.
    const size_t num_rows = polynomials.get_polynomial_size();
    size_t tamper_row = 0;
    for (size_t i = Flavor::TRACE_OFFSET + 1; i < num_rows - 1; i++) {
        if (polynomials.msm_skew[i - 1] == FF(1) && polynomials.msm_skew[i] == FF(1) &&
            polynomials.msm_skew[i + 1] == FF(1)) {
            tamper_row = i;
            break;
        }
    }
    ASSERT_NE(tamper_row, 0) << "Should find an interior skew row (msm_size >= 9 gives >= 3 skew rows)";

    polynomials.msm_pc.at(tamper_row) = polynomials.msm_pc[tamper_row] + FF(0xdead);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "MSM relation should reject msm_pc tamper on an interior skew row";
    EXPECT_TRUE(failures.contains(ECCVMMSMRelationImpl<FF>::MSM_PC_SKEW_CONTINUITY))
        << "MSM_PC_SKEW_CONTINUITY should be among the failing subrelations";
}

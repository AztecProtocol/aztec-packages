/**
 * @file eccvm_relation_corruption.test.cpp
 * @brief Corruption/negative tests for ECCVM relation constraints.
 *
 * Each test builds valid ProverPolynomials from a real ECCVMCircuitBuilder, asserts that
 * relations pass on clean data, then corrupts specific witness values and verifies detection.
 */
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
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

struct AffinePoint {
    FF x;
    FF y;
};

struct PointDoubleResult {
    AffinePoint point;
    FF lambda;
};

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

// The following helper methods are for a regression test: MSMRoundTransitionPhaseSelectorSwap.
// Without the correct constraints, one can swap a `double` for a `skew` at the last round, which allows one to spoof an MSM. 

/**
 * @brief Build a single-MSM trace with one point and one odd 128-bit scalar.
 *
 * Using a small (<2^128) odd scalar guarantees that the (z1, z2) decomposition of the scalar
 * yields z2 = 0, so the resulting MSM has size 1 (just the z1 mul). The scalar is odd so
 * `wnaf_skew = false` and therefore `precompute_skew = 0` for the underlying ScalarMul, which
 * is the precondition for a potential malicious phase-selector swap at the round 31->32 boundary.
 */
ProverPolynomials build_size1_eccvm_msm_state()
{
    auto generators = G1::derive_generators("test generators", 1);
    auto P = generators[0];
    // 128-bit odd scalar: z2 will be 0 -> single-mul MSM, wnaf_skew=false -> precompute_skew=0.
    Fr scalar = Fr(uint256_t(0x0123456789abcdefULL, 0x0fedcba987654321ULL, 0, 0));

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->mul_accumulate(P, scalar);
    op_queue->eq_and_reset();
    op_queue->merge();
    add_hiding_op_for_test(op_queue);

    ECCVMCircuitBuilder builder{ op_queue };
    return ProverPolynomials(builder);
}

/**
 * @brief Find the unique round-32 skew row that terminates a size-1 MSM.
 */
size_t find_round_32_skew_row(const ProverPolynomials& polynomials)
{
    const size_t num_rows = polynomials.get_polynomial_size();
    for (size_t i = 1; i < num_rows - 2; ++i) {
        if (polynomials.msm_skew[i] == FF(1) && polynomials.msm_round[i] == FF(32)) {
            return i;
        }
    }
    return 0;
}

/**
 * @brief Find the transcript row that consumes an MSM output.
 */
size_t find_transcript_msm_transition_row(const ProverPolynomials& polynomials)
{
    const size_t num_rows = polynomials.get_polynomial_size();
    for (size_t i = 1; i < num_rows - 1; ++i) {
        if (polynomials.transcript_msm_transition[i] == FF(1)) {
            return i;
        }
    }
    return 0;
}

/**
 * @brief Apply one affine doubling step and return both the doubled point and tangent slope.
 *
 * The PoC needs explicit lambda witnesses for the four doublings in the malicious `q_double` row.
 */
PointDoubleResult double_point(const AffinePoint& point)
{
    const FF lambda = (point.x * point.x * FF(3)) * (point.y + point.y).invert();
    const FF x_new = lambda * lambda - point.x - point.x;
    const FF y_new = lambda * (point.x - x_new) - point.y;
    return { .point = { x_new, y_new }, .lambda = lambda };
}

/**
 * @brief Add `rhs` into `lhs` using the affine formulas encoded in the MSM/transcript relations.
 *
 * Returns the output point together with the slope and x-collision inverse witnesses that the
 * malicious `q_add` row must carry.
 */
std::tuple<AffinePoint, FF, FF> add_points(const AffinePoint& lhs, const AffinePoint& rhs)
{
    const FF dx = lhs.x - rhs.x;
    EXPECT_NE(dx, FF(0));
    const FF lambda = (lhs.y - rhs.y) * dx.invert();
    const FF collision_inverse = (rhs.x - lhs.x).invert();
    const FF x_out = lambda * lambda - lhs.x - rhs.x;
    const FF y_out = lambda * (rhs.x - x_out) - rhs.y;
    return { { x_out, y_out }, lambda, collision_inverse };
}

/**
 * @brief Subtract the fixed ECCVM offset generator from an MSM output.
 *
 * The transcript relation stores both the raw MSM accumulator (with offset) and the offset-subtracted
 * intermediate point, so the PoC must patch both consistently.
 */
std::tuple<AffinePoint, FF> subtract_msm_offset(const AffinePoint& msm_output)
{
    constexpr auto offset_base = get_precomputed_generators<G1, "ECCVM_OFFSET_GENERATOR", 1>()[0];
    const auto offset_affine = G1::affine_element(G1::element(offset_base) * Fr(uint256_t(1) << 124));
    const AffinePoint neg_offset{ offset_affine.x, -offset_affine.y };

    const FF dx = msm_output.x - neg_offset.x;
    EXPECT_NE(dx, FF(0));
    const FF lambda = (msm_output.y - neg_offset.y) * dx.invert();
    const FF x_out = lambda * lambda - msm_output.x - neg_offset.x;
    const FF y_out = lambda * (msm_output.x - x_out) - msm_output.y;
    return { { x_out, y_out }, dx.invert() };
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
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline MSM relation should pass";

    // Confirm the first active MSM row is the transition row (offset by disabled head region)
    constexpr size_t first_msm_row = Flavor::TRACE_OFFSET + 1;
    ASSERT_EQ(polynomials.msm_add[first_msm_row], FF(1)) << "First MSM row should be an active MSM add row";
    ASSERT_EQ(polynomials.msm_transition[first_msm_row], FF(1)) << "First MSM row should have msm_transition=1";

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
    polynomials.msm_size_of_msm.at(ofs + 1) = polynomials.msm_pc[ofs + 1] - polynomials.msm_pc[ofs + 2];

    // Refresh shifted views
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
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
        polynomials, params, "ECCVMTranscriptRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline transcript relation should pass";

    size_t noop_row = find_transcript_noop_row(polynomials);
    ASSERT_NE(noop_row, 0) << "Should find a transcript no-op row";

    // The no-op constraint at row `noop_row` constrains is_accumulator_empty_shift,
    // which reads from accumulator_not_empty at row `noop_row + 1`.
    polynomials.transcript_accumulator_not_empty.at(noop_row + 1) = FF(1);
    polynomials.set_shifted();

    auto failures = RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
        polynomials, params, "ECCVMTranscriptRelation", Flavor::TRACE_OFFSET);
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
        polynomials, params, "ECCVMSetRelation", Flavor::TRACE_OFFSET);
    EXPECT_TRUE(baseline.empty()) << "Baseline set relation should pass";

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

    ASSERT_EQ(polynomials.z_perm[first_row], FF(0));

    // Tamper: set z_perm to non-zero where lagrange_first is active
    polynomials.z_perm.at(first_row) = FF(1);

    auto failures = RelationChecker<void>::check<ECCVMSetRelation<FF>>(
        polynomials, params, "ECCVMSetRelation - After setting z_perm != 0 at lagrange_first", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(failures.empty()) << "Set relation should fail after z_perm init corruption";
    EXPECT_TRUE(failures.contains(ECCVMSetRelationImpl<FF>::Z_PERM_INIT))
        << "Sub-relation Z_PERM_INIT should catch the corruption";
    EXPECT_EQ(failures.at(ECCVMSetRelationImpl<FF>::Z_PERM_INIT), first_row)
        << "Failure should be at lagrange_first row";
}

/**
 * @brief Regression test for the round 31->32 phase-selector swap soundness gap.
 *
 * Demonstrated that an honest q_skew transition at round 31->32 can be replaced by
 *   q_double (extra 4 doublings, accumulator multiplied by 16)
 *   followed by q_add at round=32 with slice=0 (lookup forces (x1,y1) = T[0] = -15 P_pc)
 * and, before the fix, the resulting trace satisfied every existing ECCVM relation -- demonstrating that
 * the "round = 31 ==> q_skew_shift = 1" converse was not constrained.
 *
 * Layout (size-1 MSM, scalar with odd LSB so precompute_skew = 0):
 *   ... rows ending at:
 *   row R-1 = 63: q_add=1, round=31  (last add of digit 31)
 *   row R   = 64: q_skew=1, round=32  ===> patched to q_double=1
 *   row R+1 = 65: synthetic final (msm_transition=1, round=0, all selectors=0)
 *                 ===> patched to q_add=1, round=32, count=0, slice=0
 *   row R+2 = 66: padding (all zero)
 *                 ===> patched to be the new synthetic final (msm_transition=1)
 *
 * After patching, the accumulator at row R+2 holds
 *   acc' = 16*(2^124*OFFSET + s*P) - 15*P = 2^128*OFFSET + (16s - 15)*P,
 * which differs from the honest output 2^124*OFFSET + s*P. The transcript columns are
 * patched so that transcript_msm_x/y reflect this malicious accumulator and
 * transcript_msm_intermediate_x/y is (acc' - 2^124*OFFSET).
 */
TEST_F(ECCVMRelationCorruptionTests, MSMRoundTransitionPhaseSelectorSwap)
{
    auto polynomials = build_size1_eccvm_msm_state();

    // ---- Baseline: every relation passes on the clean trace ----
    {
        auto baseline_params = compute_full_relation_params(polynomials);
        EXPECT_TRUE(RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
                        polynomials, baseline_params, "MSM", Flavor::TRACE_OFFSET)
                        .empty());
        EXPECT_TRUE(RelationChecker<void>::check<ECCVMBoolsRelation<FF>>(
                        polynomials, baseline_params, "Bools", Flavor::TRACE_OFFSET)
                        .empty());
        EXPECT_TRUE(RelationChecker<void>::check<ECCVMTranscriptRelation<FF>>(
                        polynomials, baseline_params, "Tx", Flavor::TRACE_OFFSET)
                        .empty());
        EXPECT_TRUE(RelationChecker<void>::check<ECCVMSetRelation<FF>>(
                        polynomials, baseline_params, "Set", Flavor::TRACE_OFFSET)
                        .empty());
        EXPECT_TRUE((RelationChecker<void>::check<ECCVMLookupRelation<FF>, true>(
                         polynomials, baseline_params, "Lookup", Flavor::TRACE_OFFSET)
                         .empty()));
    }

    // ---- Locate the SKEW row ----
    const size_t R = find_round_32_skew_row(polynomials);
    ASSERT_NE(R, 0U) << "Could not find skew row";
    ASSERT_EQ(polynomials.msm_transition[R + 1], FF(1)) << "Row R+1 should be the synthetic final row";
    ASSERT_EQ(polynomials.msm_round[R + 1], FF(0));
    ASSERT_EQ(polynomials.msm_transition[R + 2], FF(0)) << "Row R+2 should be a padding row in size-1 MSM";

    // ---- Read honest values we need ----
    // Accumulator entering row R (acc_R = 2^124*OFFSET + s*P for an honest run with no skew)
    const AffinePoint acc_R{ polynomials.msm_accumulator_x[R], polynomials.msm_accumulator_y[R] };
    // T[0] = -15*P is what's loaded as (msm_x1, msm_y1) on the honest skew row when slice1 = 0.
    const AffinePoint neg15P{ polynomials.msm_x1[R], polynomials.msm_y1[R] };

    // ---- Compute 4 sequential doublings of acc_R (= 16 * acc_R) and the four lambdas ----
    const auto d1 = double_point(acc_R);
    const auto d2 = double_point(d1.point);
    const auto d3 = double_point(d2.point);
    const auto d4 = double_point(d3.point); // d4.point = 16 * acc_R

    // ---- Compute the q_add row's lambda1 (adding -15P to 16*acc_R) and collision_inverse1 ----
    // The malicious q_add row uses the same affine formulas as `first_add` in the relation.
    const auto [malicious_acc, add_lambda1, add_collision_inv1] = add_points(d4.point, neg15P);

    // ---- Patch row R: q_skew -> q_double ----
    polynomials.msm_skew.at(R) = FF(0);
    polynomials.msm_double.at(R) = FF(1);
    polynomials.msm_add1.at(R) = FF(0);
    polynomials.msm_x1.at(R) = FF(0);
    polynomials.msm_y1.at(R) = FF(0);
    polynomials.msm_collision_x1.at(R) = FF(0);
    polynomials.msm_lambda1.at(R) = d1.lambda;
    polynomials.msm_lambda2.at(R) = d2.lambda;
    polynomials.msm_lambda3.at(R) = d3.lambda;
    polynomials.msm_lambda4.at(R) = d4.lambda;
    // msm_x2..4, msm_y2..4, msm_slice1..4, msm_add2..4 are already 0 in a size-1 skew row

    // ---- Patch row R+1: synthetic final -> malicious q_add row ----
    polynomials.msm_transition.at(R + 1) = FF(0);
    polynomials.msm_add.at(R + 1) = FF(1);
    polynomials.msm_round.at(R + 1) = FF(32);
    polynomials.msm_count.at(R + 1) = FF(0);
    polynomials.msm_size_of_msm.at(R + 1) = FF(1); // still in this MSM
    polynomials.msm_pc.at(R + 1) = polynomials.msm_pc[R];
    polynomials.msm_add1.at(R + 1) = FF(1);
    polynomials.msm_slice1.at(R + 1) = FF(0);
    polynomials.msm_x1.at(R + 1) = neg15P.x;
    polynomials.msm_y1.at(R + 1) = neg15P.y;
    polynomials.msm_lambda1.at(R + 1) = add_lambda1;
    polynomials.msm_collision_x1.at(R + 1) = add_collision_inv1;
    polynomials.msm_accumulator_x.at(R + 1) = d4.point.x;
    polynomials.msm_accumulator_y.at(R + 1) = d4.point.y;

    // ---- Patch row R+2: was padding -> new synthetic final ----
    polynomials.msm_transition.at(R + 2) = FF(1);
    // msm_round[R+2] is already 0, msm_pc[R+2] is already 0 (padding), msm_size[R+2]=0, count=0
    polynomials.msm_accumulator_x.at(R + 2) = malicious_acc.x;
    polynomials.msm_accumulator_y.at(R + 2) = malicious_acc.y;

    // ---- Patch the transcript columns ----
    // The transcript_msm_x/y columns hold the raw (with-offset) MSM output the transcript reads.
    // transcript_msm_intermediate_x/y is that minus the offset (= the actual MSM result).
    // The set relation third term ties (msm_acc_*[R+2], msm_pc[R+2], msm_size[R+1]) ==
    // (transcript_msm_x, transcript_msm_y, transcript_pc_shift, full_msm_count) at the transcript msm_transition row.
    const size_t t_row = find_transcript_msm_transition_row(polynomials);
    ASSERT_NE(t_row, 0U);

    polynomials.transcript_msm_x.at(t_row) = malicious_acc.x;
    polynomials.transcript_msm_y.at(t_row) = malicious_acc.y;

    // Compute (transcript_msm_intermediate_x, _y) = (transcript_msm_x, _y) - offset, where
    // offset = 2^124 * ECCVM_OFFSET_GENERATOR. We do the subtraction via affine point math.
    const auto [intermediate_msm, transcript_msm_x_inverse] = subtract_msm_offset(malicious_acc);
    polynomials.transcript_msm_intermediate_x.at(t_row) = intermediate_msm.x;
    polynomials.transcript_msm_intermediate_y.at(t_row) = intermediate_msm.y;
    // transcript_msm_x_inverse: 1/(x2 - x1) where (x2, y2) = transcript_msm and (x1,y1) = -offset
    polynomials.transcript_msm_x_inverse.at(t_row) = transcript_msm_x_inverse;
    // transcript_msm_infinity stays 0

    // Witness the x/y-equality checks for the msm_transition row:
    // the transcript adds `transcript_msm_intermediate_*` into an empty accumulator, so the relevant
    // differences are simply the intermediate coordinates themselves.
    ASSERT_NE(intermediate_msm.x, FF(0));
    ASSERT_NE(intermediate_msm.y, FF(0));
    polynomials.transcript_base_x_inverse.at(t_row) = intermediate_msm.x.invert();
    polynomials.transcript_base_y_inverse.at(t_row) = intermediate_msm.y.invert();

    // The transcript accumulator at row t_row+1 receives the result of "add MSM intermediate to
    // transcript_accumulator". Since the running accumulator was empty (eq_and_reset zeroed it), the
    // result equals lhs (the intermediate). Patch transcript_accumulator at t_row+1 accordingly.
    polynomials.transcript_accumulator_x.at(t_row + 1) = intermediate_msm.x;
    polynomials.transcript_accumulator_y.at(t_row + 1) = intermediate_msm.y;
    polynomials.transcript_Px.at(t_row + 1) = intermediate_msm.x;
    polynomials.transcript_Py.at(t_row + 1) = intermediate_msm.y;

    // Row R is no longer active for the lookup relation after changing q_skew -> q_double.
    // `compute_logderivative_inverse` only overwrites active rows, so clear the stale inverse witness here.
    polynomials.lookup_inverses.at(R) = FF(0);

    polynomials.set_shifted();

    // ---- The fix should reject the malicious trace directly inside ECCVMMSMRelation ----
    RelationParameters<FF> params{};
    auto msm_failures = RelationChecker<void>::check<ECCVMMSMRelation<FF>>(
        polynomials, params, "ECCVMMSMRelation", Flavor::TRACE_OFFSET);
    EXPECT_FALSE(msm_failures.empty()) << "The round-transition fix should reject the malicious trace.";
    EXPECT_TRUE(msm_failures.contains(ECCVMMSMRelationImpl<FF>::DOUBLE_SHIFT_FORBIDS_ROUND_31))
        << "The new round-31 inverse-witness gate should be the rejecting subrelation.";
}

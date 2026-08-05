/**
 * @file eccvm_msm_phantom_forgery.test.cpp
 * @brief MSM_TRANSITION_FOLLOWS_SKEW rejects a published MSM result the MSM table never computed.
 *
 * A row carrying `msm_transition = 1` with all phase selectors zero leaves
 * `msm_accumulator_{x,y}_shift` outside the domain of ADD_ACC, DOUBLE_ACC, SKEW_ACC and
 * IDLE_ROW_PRESERVES_ACC, and `ECCVMSetRelation`'s third term publishes that value as an MSM result.
 * The witnesses below place an attacker-chosen point there and check that the relations, and then the
 * prover and verifier, reject it.
 *
 * The forged trace is assembled entirely out of real builder output, so no witness value is
 * hand-derived:
 *
 *   CANCELLING  mul(A,x) mul(B,y) add(C) mul(P,s) mul(P,-s) eq   two MSMs; MSM2 evaluates to O
 *   DONOR       mul(A,x) mul(B,y) add(C) mul(P,s) mul(P,s2) eq   same shape; MSM2 evaluates to a real point
 *   ONE_MSM     mul(A,x) mul(B,y)        mul(P,s) mul(P,-s) eq   one MSM absorbing all four muls
 *
 * CANCELLING supplies the precompute table and the op-queue columns; DONOR supplies the transcript's
 * claimed MSM output and the accumulator chain that follows it; ONE_MSM supplies the absorbing MSM
 * segment. CANCELLING's `eq` target is repointed at DONOR's, which makes the statement false.
 */
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_msm_forgery.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_test_utils.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/honk/relation_checker.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {

using bb::eccvm_msm_forgery::build_trace;
using bb::eccvm_msm_forgery::Fixture;
using bb::eccvm_msm_forgery::Forgery;
using bb::eccvm_msm_forgery::make_fixture;
using bb::eccvm_msm_forgery::make_queue;
using bb::eccvm_msm_forgery::op_queue_columns;
using bb::eccvm_msm_forgery::true_msm1;
using bb::eccvm_msm_forgery::true_msm2;
using bb::eccvm_msm_forgery::Variant;

using Flavor = ECCVMFlavor;
using FF = typename Flavor::FF;
using G1 = bb::g1;
using Point = typename G1::affine_element;
using Polynomial = typename Flavor::Polynomial;
using ProverPolynomials = typename Flavor::ProverPolynomials;

auto& engine = numeric::get_debug_randomness();

RelationParameters<FF> compute_params(ProverPolynomials& polynomials)
{
    const FF beta = FF::random_element(&engine);
    const FF gamma = FF::random_element(&engine);
    const FF beta_sqr = beta.sqr();
    const FF beta_cube = beta_sqr * beta;
    const FF beta_quartic = beta_sqr * beta_sqr;
    const FF first_term_tag = beta_quartic;
    auto delta = (gamma + first_term_tag) * (gamma + beta_sqr + first_term_tag) *
                 (gamma + beta_sqr + beta_sqr + first_term_tag) *
                 (gamma + beta_sqr + beta_sqr + beta_sqr + first_term_tag);
    delta = delta.invert();

    RelationParameters<FF> params{
        .eta = 0,
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = 0,
        .beta_sqr = beta_sqr,
        .beta_cube = beta_cube,
        .beta_quartic = beta_quartic,
        .eccvm_set_permutation_delta = delta,
    };
    compute_logderivative_inverse<FF, ECCVMLookupRelation<FF>>(polynomials, params, Flavor::TRACE_OFFSET);
    compute_grand_product<Flavor, ECCVMSetRelation<FF>>(polynomials, params);
    polynomials.z_perm_shift = Polynomial(polynomials.z_perm.shifted());
    return params;
}

/// Accumulate every ECCVM relation over the whole trace and report the first failing row per subrelation.
std::vector<std::string> check_all_relations(const ProverPolynomials& polys, const RelationParameters<FF>& params)
{
    std::vector<std::string> failures;
    const size_t num_rows = polys.get_polynomial_size();

    const auto evaluate = [&]<typename Relation>(const std::string& name, bool linearly_dependent) {
        typename Relation::SumcheckArrayOfValuesOverSubrelations result;
        for (auto& r : result) {
            r = 0;
        }
        std::set<size_t> reported;
        for (size_t i = Flavor::TRACE_OFFSET; i < num_rows; ++i) {
            Relation::accumulate(result, polys.get_row(i), params, 1);
            if (linearly_dependent) {
                continue;
            }
            for (size_t j = 0; j < result.size(); ++j) {
                if (result[j] != 0 && !reported.contains(j)) {
                    reported.insert(j);
                    failures.push_back(name + " subrelation " + std::to_string(j) + " first fails at row " +
                                       std::to_string(i));
                }
            }
        }
        if (linearly_dependent) {
            for (size_t j = 0; j < result.size(); ++j) {
                if (result[j] != 0) {
                    failures.push_back(name + " subrelation " + std::to_string(j) + " does not vanish over the trace");
                }
            }
        }
    };

    evaluate.template operator()<ECCVMTranscriptRelation<FF>>("ECCVMTranscriptRelation", false);
    evaluate.template operator()<ECCVMPointTableRelation<FF>>("ECCVMPointTableRelation", false);
    evaluate.template operator()<ECCVMWnafRelation<FF>>("ECCVMWnafRelation", false);
    evaluate.template operator()<ECCVMMSMRelation<FF>>("ECCVMMSMRelation", false);
    evaluate.template operator()<ECCVMSetRelation<FF>>("ECCVMSetRelation", false);
    evaluate.template operator()<ECCVMBoolsRelation<FF>>("ECCVMBoolsRelation", false);
    evaluate.template operator()<ECCVMShiftableInitRelation<FF>>("ECCVMShiftableInitRelation", false);
    evaluate.template operator()<ECCVMLookupRelation<FF>>("ECCVMLookupRelation", true);
    return failures;
}

/// Every msm-prefixed column, in a fixed order, so two traces can be copied column-wise.
bool report(const std::string& label, const ProverPolynomials& polys, const RelationParameters<FF>& params)
{
    const auto failures = check_all_relations(polys, params);
    std::cout << "[" << label << "] " << (failures.empty() ? "ALL RELATIONS SATISFIED" : "relation failures:") << "\n";
    for (const auto& f : failures) {
        std::cout << "    " << f << "\n";
    }
    return failures.empty();
}

class ECCVMPhantomForgeryTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }
};

TEST_F(ECCVMPhantomForgeryTests, HonestTracePasses)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    auto queue = make_queue(f, Variant::TARGET);
    ECCVMCircuitBuilder builder{ queue };
    ProverPolynomials polys(builder);
    auto params = compute_params(polys);
    EXPECT_TRUE(report("honest", polys, params));
}

TEST_F(ECCVMPhantomForgeryTests, FalseStatementIsRejected)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    ProverPolynomials polys = build_trace(f, /*forge=*/false);
    auto params = compute_params(polys);
    EXPECT_FALSE(report("false statement, no forgery", polys, params));
}

TEST_F(ECCVMPhantomForgeryTests, ForgedTraceIsRejectedByRelations)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    Forgery info{ ProverPolynomials{}, 0, 0, 0 };
    ProverPolynomials polys = build_trace(f, /*forge=*/true, &info);
    auto params = compute_params(polys);
    std::cout << "emitting_row=" << info.emitting_row << " injected_row=" << info.injected_row
              << " published_row=" << info.published_row << "\n";
    EXPECT_FALSE(report("forged", polys, params));
}

/**
 * @brief Run the production prover and verifier over the false statement, with the forgery optionally
 *        written into the prover's witness before `construct_proof()`.
 */
bool prove_and_verify(const Fixture& f, bool forge)
{
    using Transcript = ECCVMFlavor::Transcript;
    using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;

    auto donor_queue = make_queue(f, Variant::DONOR);
    ECCVMCircuitBuilder donor_builder{ donor_queue };

    auto queue = make_queue(f, Variant::TARGET);
    auto& ops = queue->get_eccvm_ops();
    ops.back().base_point = donor_queue->get_eccvm_ops().back().base_point;
    ECCVMCircuitBuilder builder{ queue };

    auto prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);

    if (forge) {
        ProverPolynomials forged = build_trace(f, /*forge=*/true);
        auto dst = prover.key->polynomials.get_all();
        auto src = forged.get_all();
        for (size_t c = 0; c < dst.size(); c++) {
            for (size_t i = Flavor::TRACE_OFFSET; i < dst[c].end_index(); i++) {
                dst[c].set_if_valid_index(i, src[c][i]);
            }
        }
        prover.key->polynomials.set_shifted();
    }

    auto proof = prover.construct_proof();
    EXPECT_EQ(proof.size(), ECCVMFlavor::PROOF_LENGTH);

    auto verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    auto ipa_verifier_transcript = std::make_shared<Transcript>();
    ipa_verifier_transcript->load_proof(prover.ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    const bool ipa_verified =
        ECCVMVerifier::TripleIPA::reduce_verify(ipa_vk, eccvm_result.triple_ipa_claim, ipa_verifier_transcript);

    return ipa_verified && eccvm_result.reduction_succeeded;
}

/// Control: the harness accepts an honest, true statement.
TEST_F(ECCVMPhantomForgeryTests, HonestStatementProvesAndVerifies)
{
    using Transcript = ECCVMFlavor::Transcript;
    using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;

    const Fixture f = make_fixture(/*cancelling=*/true);
    auto queue = make_queue(f, Variant::TARGET);
    ECCVMCircuitBuilder builder{ queue };

    auto prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    auto verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    auto ipa_verifier_transcript = std::make_shared<Transcript>();
    ipa_verifier_transcript->load_proof(prover.ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    EXPECT_TRUE(
        ECCVMVerifier::TripleIPA::reduce_verify(ipa_vk, eccvm_result.triple_ipa_claim, ipa_verifier_transcript));
    EXPECT_TRUE(eccvm_result.reduction_succeeded);
}

/// The statement being forged really is false: the repointed `eq` target is not the true accumulator.
TEST_F(ECCVMPhantomForgeryTests, TargetStatementIsFalse)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    auto honest_queue = make_queue(f, Variant::TARGET);
    auto donor_queue = make_queue(f, Variant::DONOR);
    const Point true_target = honest_queue->get_eccvm_ops().back().base_point;
    const Point false_target = donor_queue->get_eccvm_ops().back().base_point;
    EXPECT_NE(true_target, false_target);
    EXPECT_EQ(true_target, Point(G1::element(f.A) * f.x + G1::element(f.B) * f.y + G1::element(f.C)));
}

/// Control: the construction requires the published accumulator to match what the transcript claims.
/// Publishing an unrelated point breaks the multiset argument, so a rejection here would not
/// distinguish MSM_TRANSITION_FOLLOWS_SKEW from the harness rejecting arbitrary garbage.
TEST_F(ECCVMPhantomForgeryTests, ArbitraryPublishedAccumulatorIsRejected)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    Forgery info{ ProverPolynomials{}, 0, 0, 0 };
    ProverPolynomials polys = build_trace(f, /*forge=*/true, &info);
    polys.msm_accumulator_x.set_if_valid_index(info.published_row, FF::random_element(&engine));
    polys.set_shifted();
    auto params = compute_params(polys);
    EXPECT_FALSE(report("forged with mismatched accumulator", polys, params));
}

TEST_F(ECCVMPhantomForgeryTests, FalseStatementFailsProverVerifier)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    EXPECT_FALSE(prove_and_verify(f, /*forge=*/false));
}

TEST_F(ECCVMPhantomForgeryTests, ForgedTraceIsRejectedByProverVerifier)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    EXPECT_FALSE(prove_and_verify(f, /*forge=*/true));
}

/// The freed MSM's true value is a real nonzero point: nothing cancels anywhere in this variant.
TEST_F(ECCVMPhantomForgeryTests, NonCancellingFreedMsmHasRealTrueValue)
{
    const Fixture f = make_fixture(/*cancelling=*/false);
    EXPECT_FALSE(true_msm2(f).is_point_at_infinity());
    EXPECT_NE(Point(true_msm2(f)), Point(true_msm1(f)));

    // The absorbing segment publishes S1 + S2 for MSM1, so MSM1's certified value is wrong too.
    auto target = make_queue(f, Variant::TARGET);
    auto donor = make_queue(f, Variant::DONOR);
    const Point true_target = target->get_eccvm_ops().back().base_point;
    const Point false_target = donor->get_eccvm_ops().back().base_point;
    EXPECT_EQ(true_target, Point(true_msm1(f) + G1::element(f.C) + true_msm2(f)));
    EXPECT_NE(true_target, false_target);
}

TEST_F(ECCVMPhantomForgeryTests, NonCancellingForgedTraceIsRejectedByRelations)
{
    const Fixture f = make_fixture(/*cancelling=*/false);
    ProverPolynomials polys = build_trace(f, /*forge=*/true);
    auto params = compute_params(polys);
    EXPECT_FALSE(report("forged, nothing cancels", polys, params));
}

TEST_F(ECCVMPhantomForgeryTests, NonCancellingForgedTraceIsRejectedByProverVerifier)
{
    const Fixture f = make_fixture(/*cancelling=*/false);
    EXPECT_FALSE(prove_and_verify(f, /*forge=*/true));
}

TEST_F(ECCVMPhantomForgeryTests, NonCancellingFalseStatementFailsProverVerifier)
{
    const Fixture f = make_fixture(/*cancelling=*/false);
    EXPECT_FALSE(prove_and_verify(f, /*forge=*/false));
}

TEST_F(ECCVMPhantomForgeryTests, OpQueueColumnsAreUntouched)
{
    const Fixture f = make_fixture(/*cancelling=*/true);
    ProverPolynomials honest = build_trace(f, /*forge=*/false);
    ProverPolynomials forged = build_trace(f, /*forge=*/true);
    auto a = op_queue_columns(honest);
    auto b = op_queue_columns(forged);
    for (size_t c = 0; c < a.size(); c++) {
        for (size_t i = Flavor::TRACE_OFFSET; i < a[c]->end_index(); i++) {
            ASSERT_EQ((*a[c])[i], (*b[c])[i]) << "op-queue column " << c << " differs at row " << i;
        }
    }
}

} // namespace

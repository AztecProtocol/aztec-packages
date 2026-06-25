
#include "shplemini.hpp"
#include "../gemini/gemini.hpp"
#include "../kzg/kzg.hpp"
#include "../pcs_test_utils.hpp"
#include "../shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace bb {

template <class Flavor> class ShpleminiTest : public CommitmentTest<typename Flavor::Curve> {
  public:
    // Size of the test polynomials
    static constexpr size_t log_n = 9;
    static constexpr size_t n = 1UL << log_n;
    // Total number of random polynomials in each test
    static constexpr size_t num_polynomials = 7;
    // Number of shiftable polynomials
    static constexpr size_t num_shiftable = 2;

    // The length of the mock sumcheck univariates.
    static constexpr size_t sumcheck_univariate_length = 24;

    using Fr = typename Flavor::Curve::ScalarField;
    using GroupElement = typename Flavor::Curve::Element;
    using Commitment = typename Flavor::Curve::AffineElement;
    using CK = typename Flavor::CommitmentKey;
    using IPA = bb::IPA<typename Flavor::Curve, log_n>;

    // Witness polynomial slots returned by SmallSubgroupIPAProver::get_witness_polynomials(): {G, A, Q}.
    enum class TamperedPolynomial : size_t { None = SIZE_MAX, Concatenated = 0, GrandSum = 1, Quotient = 2 };

    // libra_commitments array: [0]=Concatenated, [1]=GrandSum, [2]=Quotient
    enum class TamperedCommitment : size_t { None = SIZE_MAX, Concatenated = 0, GrandSum = 1, Quotient = 2 };

    Fr run_forged_small_ipa_prover(const std::shared_ptr<typename Flavor::Transcript>& prover_transcript,
                                   CK& ck,
                                   ZKSumcheckData<Flavor>& zk_sumcheck_data,
                                   std::vector<Fr>& mle_opening_point,
                                   MockClaimGenerator<typename Flavor::Curve>& mock_claims,
                                   const Fr& honest_inner_product);
};

/**
 * @brief Simulated malicious prover for the Shplemini + SmallSubgroupIPA soundness regression.
 *
 * @details The production verifier does not run SmallSubgroupIPA in isolation: it receives the SmallSubgroupIPA
 * commitments/evaluations through the transcript, checks the SmallSubgroupIPA identity, and then relies on Shplemini
 * to PCS-bind those evaluations to the committed witness polynomials. To regression-test the full path, this helper
 * acts as a malicious prover rather than calling the honest `SmallSubgroupIPAProver::prove()` end to end.
 *
 * Starting from honest setup data, it tampers the SmallSubgroupIPA witness by constructing forged
 * `(A_f, Q_f, s_f)` data that still satisfies the local algebraic identity at the random Gemini challenge
 *
 *   L_1(X) A(X) + (X - g^{-1})(A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) = Z_H(X) Q(X)
 *
 * but does not satisfy the boundary condition expected from an honestly generated grand-sum polynomial. The forging
 * uses the homogeneous perturbation
 *   delta_A's Lagrange values on H = (delta, c, c, ..., c)   with   c = -delta / (g - 1)
 *   delta_s = c
 *   delta_Q = (L_1*delta_A + (X-g^{-1})(delta_A(gX) - delta_A) + L_{|H|}*(delta_A - delta_s)) / Z_H
 *
 * The helper writes forged transcript data and commitments for `(A_f, Q_f, s_f)`, then runs ShpleminiProver under
 * `BB_DISABLE_ASSERTS` so the honest prover's fail-fast exact-division precondition is downgraded to a warning. This
 * lets the test feed the verifier the kind of inconsistent PCS material a malicious prover would submit and check that
 * Shplemini rejects it. Returns the forged inner product so the test can confirm what the verifier is actually fed.
 */
template <class Flavor>
typename ShpleminiTest<Flavor>::Fr ShpleminiTest<Flavor>::run_forged_small_ipa_prover(
    const std::shared_ptr<typename Flavor::Transcript>& prover_transcript,
    typename Flavor::CommitmentKey& ck,
    ZKSumcheckData<Flavor>& zk_sumcheck_data,
    std::vector<typename Flavor::Curve::ScalarField>& mle_opening_point,
    MockClaimGenerator<typename Flavor::Curve>& mock_claims,
    const typename Flavor::Curve::ScalarField& honest_inner_product)
{
    using Curve = typename Flavor::Curve;
    using Fr = typename Curve::ScalarField;
    using ShpleminiProver = ShpleminiProver_<Curve>;

    static constexpr size_t SUBGROUP_SIZE = Flavor::SUBGROUP_SIZE;
    const Fr g = Curve::subgroup_generator;
    const Fr g_inv = Curve::subgroup_generator_inverse;

    // ---- Forging perturbation: pick delta != 0, then derive (c, delta_s, forged_s). ------------
    Fr delta = Fr::random_element();
    while (delta == Fr(0)) {
        delta = Fr::random_element();
    }
    const Fr c = -delta / (g - Fr(1));
    const Fr delta_s = c;
    const Fr forged_inner_product = honest_inner_product + delta_s;

    // Send forged s_f to the transcript before any prover commitments — the verifier will read this back.
    prover_transcript->send_to_verifier("Libra:claimed_evaluation", forged_inner_product);

    // Drive the small-IPA prover's component methods with the HONEST inner product so the resulting (A_h, Q_h)
    // satisfy the identity for s_h. We bypass prove() to avoid sending honest commitments — we'll commit to the
    // forged polynomials ourselves below.
    SmallSubgroupIPAProver<Flavor> ipa_prover(
        zk_sumcheck_data, mle_opening_point, honest_inner_product, prover_transcript, ck);
    ipa_prover.compute_grand_sum_polynomial();
    ipa_prover.compute_grand_sum_identity_polynomial();
    ipa_prover.compute_grand_sum_identity_quotient();

    auto honest_polys = ipa_prover.get_witness_polynomials();
    const Polynomial<Fr>& A_honest = honest_polys[1];
    const Polynomial<Fr>& Q_honest = honest_polys[2];

    // ---- Build delta_A in monomial form via Lagrange interpolation on H. -----------------------
    std::array<Fr, SUBGROUP_SIZE> H_domain;
    H_domain[0] = Fr(1);
    for (size_t i = 1; i < SUBGROUP_SIZE; ++i) {
        H_domain[i] = H_domain[i - 1] * g;
    }
    std::vector<Fr> delta_A_lagrange(SUBGROUP_SIZE, c);
    delta_A_lagrange[0] = delta;
    Polynomial<Fr> delta_A(
        std::span<const Fr>(H_domain.data(), SUBGROUP_SIZE), std::span<const Fr>(delta_A_lagrange), SUBGROUP_SIZE);

    // L_1, L_{|H|} in monomial form.
    std::vector<Fr> L_1_lag(SUBGROUP_SIZE, Fr(0));
    L_1_lag[0] = Fr(1);
    Polynomial<Fr> L_1(
        std::span<const Fr>(H_domain.data(), SUBGROUP_SIZE), std::span<const Fr>(L_1_lag), SUBGROUP_SIZE);
    std::vector<Fr> L_H_lag(SUBGROUP_SIZE, Fr(0));
    L_H_lag[SUBGROUP_SIZE - 1] = Fr(1);
    Polynomial<Fr> L_H(
        std::span<const Fr>(H_domain.data(), SUBGROUP_SIZE), std::span<const Fr>(L_H_lag), SUBGROUP_SIZE);

    // delta_A(gX) — coefficient i scaled by g^i.
    std::vector<Fr> delta_A_shifted(SUBGROUP_SIZE);
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        delta_A_shifted[i] = delta_A.at(i) * H_domain[i];
    }

    // delta_C(X) = L_1*delta_A + (X - g^{-1})*(delta_A(gX) - delta_A) + L_{|H|}*(delta_A - delta_s).
    std::vector<Fr> delta_C(2 * SUBGROUP_SIZE, Fr(0));
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        for (size_t j = 0; j < SUBGROUP_SIZE; ++j) {
            delta_C[i + j] += L_1.at(i) * delta_A.at(j);
        }
    }
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        for (size_t j = 0; j < SUBGROUP_SIZE; ++j) {
            delta_C[i + j] += L_H.at(i) * delta_A.at(j);
        }
        delta_C[i] -= L_H.at(i) * delta_s;
    }
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        const Fr u_i = delta_A_shifted[i] - delta_A.at(i);
        delta_C[i + 1] += u_i;
        delta_C[i] -= g_inv * u_i;
    }

    // delta_Q = delta_C / Z_H (exact division by construction; the loop below also clears the remainder buffer).
    std::vector<Fr> delta_Q_coeffs(SUBGROUP_SIZE, Fr(0));
    for (size_t i = 2 * SUBGROUP_SIZE; i-- > SUBGROUP_SIZE;) {
        delta_Q_coeffs[i - SUBGROUP_SIZE] = delta_C[i];
        delta_C[i - SUBGROUP_SIZE] += delta_C[i];
        delta_C[i] = Fr(0);
    }
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        BB_ASSERT_EQ(delta_C[i], Fr(0), "delta_C is not divisible by Z_H — perturbation is malformed.");
    }
    Polynomial<Fr> delta_Q(std::span<const Fr>(delta_Q_coeffs), SUBGROUP_SIZE);

    // ---- A_forged = A_honest + delta_A; Q_forged = Q_honest + delta_Q. -------------------------
    Polynomial<Fr> A_forged = A_honest;
    Polynomial<Fr> Q_forged = Q_honest;
    for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
        A_forged.at(i) += delta_A.at(i);
        Q_forged.at(i) += delta_Q.at(i);
    }

    // Forged commitments — these are what the verifier will see for [A] and [Q].
    prover_transcript->send_to_verifier("Libra:grand_sum_commitment", ck.commit(A_forged));
    prover_transcript->send_to_verifier("Libra:quotient_commitment", ck.commit(Q_forged));

    // Witness layout passed to Shplemini: 3-array {G, A_f, Q_f} matching
    // SmallSubgroupIPAProver::get_witness_polynomials().
    std::array<Polynomial<Fr>, NUM_SMALL_IPA_COMMITMENTS> forged_witness = { honest_polys[0], A_forged, Q_forged };

    // A protocol-following prover aborts inside factor_roots when constructing the (A, 1, 0) opening, because
    // A_forged(1) != 0 makes the division non-exact. Demote asserts to warnings to simulate a malicious prover
    // that ignores this fail-fast precondition; the resulting proof is the (incorrect) one a real attacker would
    // submit, and the verifier must still reject it.
    BB_DISABLE_ASSERTS();
    const auto opening_claim = ShpleminiProver::prove(
        this->n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript, forged_witness);
    if constexpr (std::is_same_v<Flavor, GrumpkinSettings>) {
        IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    return forged_inner_product;
}

// Shplemini's multilinear opening is a production flow only over BN254 (KZG) — UltraHonk/MegaHonk/Translator/AVM.
// The Grumpkin (IPA) instantiation exercised Shplemini -> IPA, which ECCVM replaced with the TripleIPA; ECCVM
// only uses Shplemini's `compute_sumcheck_round_claims` helper, covered by the eccvm integration tests.
using TestSettings = ::testing::Types<BN254Settings>;

TYPED_TEST_SUITE(ShpleminiTest, TestSettings);

// Non-template test fixture for KZG-specific tests
class ShpleminiKZGTest : public CommitmentTest<curve::BN254> {
  public:
    static constexpr size_t log_n = 9;
    static constexpr size_t n = 1UL << log_n;
};

// This test checks that batch_multivariate_opening_claims method operates correctly
TYPED_TEST(ShpleminiTest, CorrectnessOfMultivariateClaimBatching)
{
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    CK ck = create_commitment_key<CK>(this->n);

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();
    Fr shplonk_eval_challenge = Fr::random_element();

    // Generate multilinear polynomials and compute their commitments
    auto mle_opening_point = this->random_evaluation_point(this->log_n);

    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          mle_opening_point,
                                          ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    // Lambda to compute batched multivariate evaluation
    auto update_batched_eval = [&](Fr& batched_eval, const std::vector<Fr>& evaluations, Fr& rho_power) {
        for (auto& eval : evaluations) {
            batched_eval += eval * rho_power;
            rho_power *= rho;
        }
    };

    Fr rho_power(1);
    Fr batched_evaluation(0);
    update_batched_eval(batched_evaluation, mock_claims.unshifted.evals, rho_power);
    update_batched_eval(batched_evaluation, mock_claims.to_be_shifted.evals, rho_power);

    // Lambda to compute batched commitment
    auto compute_batched_commitment = [&](const std::vector<Commitment>& commitments, Fr& rho_power) {
        GroupElement batched = GroupElement::zero();
        for (auto& comm : commitments) {
            batched += comm * rho_power;
            rho_power *= rho;
        }
        return batched;
    };

    // Compute batched commitments manually
    rho_power = Fr(1);
    GroupElement batched_commitment_unshifted =
        compute_batched_commitment(mock_claims.unshifted.commitments, rho_power);
    GroupElement batched_commitment_to_be_shifted =
        compute_batched_commitment(mock_claims.to_be_shifted.commitments, rho_power);

    // Compute expected result manually
    GroupElement to_be_shifted_contribution = batched_commitment_to_be_shifted * gemini_eval_challenge.invert();

    GroupElement commitment_to_univariate_pos = batched_commitment_unshifted + to_be_shifted_contribution;

    GroupElement commitment_to_univariate_neg = batched_commitment_unshifted - to_be_shifted_contribution;

    GroupElement expected_result =
        commitment_to_univariate_pos * (shplonk_eval_challenge - gemini_eval_challenge).invert() +
        commitment_to_univariate_neg *
            (shplonk_batching_challenge * (shplonk_eval_challenge + gemini_eval_challenge).invert());

    // Run the ShepliminiVerifier batching method
    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;
    Fr verifier_batched_evaluation{ 0 };

    Fr inverted_vanishing_eval_pos = (shplonk_eval_challenge - gemini_eval_challenge).invert();
    Fr inverted_vanishing_eval_neg = (shplonk_eval_challenge + gemini_eval_challenge).invert();

    std::vector<Fr> inverted_vanishing_evals = { inverted_vanishing_eval_pos, inverted_vanishing_eval_neg };

    mock_claims.claim_batcher.compute_scalars_for_each_batch(
        inverted_vanishing_evals, shplonk_batching_challenge, gemini_eval_challenge);

    mock_claims.claim_batcher.update_batch_mul_inputs_and_batched_evaluation(
        commitments, scalars, verifier_batched_evaluation, rho);

    // Final pairing check
    GroupElement shplemini_result = GroupElement::batch_mul(commitments, scalars);

    EXPECT_EQ(commitments.size(),
              mock_claims.unshifted.commitments.size() + mock_claims.to_be_shifted.commitments.size());
    EXPECT_EQ(batched_evaluation, verifier_batched_evaluation);
    EXPECT_EQ(-expected_result, shplemini_result);
}
TYPED_TEST(ShpleminiTest, CorrectnessOfGeminiClaimBatching)
{
    using Curve = TypeParam::Curve;
    using GeminiProver = GeminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;
    using CK = typename TypeParam::CommitmentKey;

    CK ck = create_commitment_key<CK>(this->n);

    // Generate mock challenges
    Fr rho = Fr::random_element();
    Fr gemini_eval_challenge = Fr::random_element();
    Fr shplonk_batching_challenge = Fr::random_element();

    std::vector<Fr> shplonk_batching_challenge_powers =
        compute_shplonk_batching_challenge_powers(shplonk_batching_challenge, this->log_n);

    Fr shplonk_eval_challenge = Fr::random_element();

    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          mle_opening_point,
                                          ck);

    // Collect multilinear evaluations
    std::vector<Fr> rhos = gemini::powers_of_rho(rho, this->num_polynomials + this->num_shiftable);

    Polynomial batched = mock_claims.polynomial_batcher.compute_batched(rho);

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto fold_polynomials = GeminiProver::compute_fold_polynomials(this->log_n, mle_opening_point, batched);

    std::vector<Commitment> prover_commitments;
    for (size_t l = 0; l < this->log_n - 1; ++l) {
        auto commitment = ck.commit(fold_polynomials[l]);
        prover_commitments.emplace_back(commitment);
    }

    auto [A_0_pos, A_0_neg] =
        mock_claims.polynomial_batcher.compute_partially_evaluated_batch_polynomials(gemini_eval_challenge);

    const auto opening_claims = GeminiProver::construct_univariate_opening_claims(
        this->log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), gemini_eval_challenge);

    std::vector<Fr> prover_evaluations;
    for (size_t l = 0; l < this->log_n; ++l) {
        const auto& evaluation = opening_claims[l + 1].opening_pair.evaluation;
        prover_evaluations.emplace_back(evaluation);
    }

    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_eval_challenge, this->log_n);

    GroupElement expected_result = GroupElement::zero();
    std::vector<Fr> expected_inverse_vanishing_evals;
    expected_inverse_vanishing_evals.reserve(2 * this->log_n);
    // Compute expected inverses
    for (size_t idx = 0; idx < this->log_n; idx++) {
        expected_inverse_vanishing_evals.emplace_back((shplonk_eval_challenge - r_squares[idx]).invert());
        expected_inverse_vanishing_evals.emplace_back((shplonk_eval_challenge + r_squares[idx]).invert());
    }

    Fr current_challenge{ shplonk_batching_challenge * shplonk_batching_challenge };
    for (size_t idx = 0; idx < prover_commitments.size(); ++idx) {
        expected_result -= prover_commitments[idx] * current_challenge * expected_inverse_vanishing_evals[2 * idx + 2];
        current_challenge *= shplonk_batching_challenge;
        expected_result -= prover_commitments[idx] * current_challenge * expected_inverse_vanishing_evals[2 * idx + 3];
        current_challenge *= shplonk_batching_challenge;
    }

    // Run the ShepliminiVerifier batching method
    std::vector<Fr> inverse_vanishing_evals =
        ShplonkVerifier::compute_inverted_gemini_denominators(shplonk_eval_challenge, r_squares);

    Fr expected_constant_term_accumulator{ 0 };

    std::vector<Fr> gemini_fold_pos_evaluations = GeminiVerifier_<Curve>::compute_fold_pos_evaluations(
        expected_constant_term_accumulator, mle_opening_point, r_squares, prover_evaluations);
    std::vector<Commitment> commitments;
    std::vector<Fr> scalars;

    ShpleminiVerifier::batch_gemini_claims_received_from_prover(prover_commitments,
                                                                prover_evaluations,
                                                                gemini_fold_pos_evaluations,
                                                                inverse_vanishing_evals,
                                                                shplonk_batching_challenge_powers,
                                                                commitments,
                                                                scalars,
                                                                expected_constant_term_accumulator);

    // Compute the group element using the output of Shplemini method
    GroupElement shplemini_result = GroupElement::batch_mul(commitments, scalars);

    EXPECT_EQ(shplemini_result, expected_result);
}

/**
 * @brief Test Shplemini with ZK data consisting of a hiding polynomial generated by GeminiProver and Libra polynomials
 * used to mask Sumcheck Round Univariates. This abstracts the PCS step in each ZK Flavor running over BN254.
 *
 */
TYPED_TEST(ShpleminiTest, ShpleminiZKNoSumcheckOpenings)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    constexpr bool HasZK = true;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve, HasZK>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    // Initialize transcript and commitment key
    auto prover_transcript = TypeParam::Transcript::test_prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->n, 1ULL << (log_subgroup_size + 1)));

    // Generate Libra polynomials, compute masked concatenated Libra polynomial, commit to it
    ZKData zk_sumcheck_data(this->log_n, prover_transcript, ck);

    // Generate multivariate challenge
    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    // Generate random prover polynomials, compute their evaluations and commitments
    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          mle_opening_point,
                                          ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, mle_opening_point, this->log_n);

    prover_transcript->send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, mle_opening_point, claimed_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    // Reduce to KZG or IPA based on the curve used in the test Flavor
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      mock_claims.polynomial_batcher,
                                                      mle_opening_point,
                                                      ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials());

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        TestFixture::IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    // Start populating Verifier's array of Libra commitments
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Place Libra data to the transcript
    const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    // Check that transcript is consistent
    EXPECT_EQ(libra_total_sum, zk_sumcheck_data.libra_total_sum);
    EXPECT_EQ(libra_challenge, zk_sumcheck_data.libra_challenge);
    EXPECT_EQ(libra_evaluation, claimed_inner_product);

    // Finalize the array of Libra/SmallSubgroupIpa commitments
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Run Shplemini
    auto [batch_opening_claim, consistency_checked] =
        ShpleminiVerifier::compute_batch_opening_claim(mock_claims.claim_batcher,
                                                       mle_opening_point,
                                                       this->vk().get_g1_identity(),
                                                       verifier_transcript,
                                                       {},
                                                       libra_commitments,
                                                       libra_evaluation);
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result =
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(pairing_points.check(), true);
    }
    EXPECT_EQ(consistency_checked, true);
}

/**
 * @brief Test Shplemini with ZK data consisting of a hiding polynomial generated by GeminiProver, Libra polynomials
 * used to mask Sumcheck Round Univariates and prove/verify the claimed evaluations of committed sumcheck round
 * univariates. This test abstracts the PCS step in each ZK Flavor running over Grumpkin.
 *
 */
TYPED_TEST(ShpleminiTest, ShpleminiZKWithSumcheckOpenings)
{
    using Curve = TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    using ShpleminiProver = ShpleminiProver_<Curve>;
    constexpr bool HasZK = true;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve, HasZK>;

    CK ck = create_commitment_key<CK>(4096);

    // Generate Sumcheck challenge
    std::vector<Fr> challenge = this->random_evaluation_point(this->log_n);

    auto prover_transcript = TypeParam::Transcript::test_prover_init_empty();

    // Generate masking polynomials for Sumcheck Round Univariates
    ZKSumcheckData<TypeParam> zk_sumcheck_data(this->log_n, prover_transcript, ck);
    // Generate mock witness
    MockClaimGenerator<Curve> mock_claims(this->n, 1);

    // Generate valid sumcheck polynomials of given length
    mock_claims.template compute_sumcheck_opening_data<TypeParam>(
        this->log_n, this->sumcheck_univariate_length, challenge, ck);

    // Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product =
        SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(zk_sumcheck_data, challenge, this->log_n);

    prover_transcript->send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    // Instantiate SmallSubgroupIPAProver, this prover sends commitments to Big Sum and Quotient polynomials
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, challenge, claimed_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    // Reduce proving to a single claimed fed to KZG or IPA
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      mock_claims.polynomial_batcher,
                                                      challenge,
                                                      ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials(),
                                                      mock_claims.round_univariates,
                                                      mock_claims.sumcheck_evaluations);

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        TestFixture::IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Place Libra data to the transcript
    const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    // Check that transcript is consistent
    EXPECT_EQ(libra_total_sum, zk_sumcheck_data.libra_total_sum);
    EXPECT_EQ(libra_challenge, zk_sumcheck_data.libra_challenge);
    EXPECT_EQ(libra_evaluation, claimed_inner_product);

    // Finalize the array of Libra/SmallSubgroupIpa commitments
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Run Shplemini
    auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(mock_claims.claim_batcher,
                                                                              challenge,
                                                                              this->vk().get_g1_identity(),
                                                                              verifier_transcript,
                                                                              {},
                                                                              libra_commitments,
                                                                              libra_evaluation,
                                                                              mock_claims.sumcheck_commitments,
                                                                              mock_claims.sumcheck_evaluations)
                                   .batch_opening_claim;
    // Verify claim using KZG or IPA
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result =
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
        EXPECT_EQ(pairing_points.check(), true);
    }
}

/**
 * @brief High degree attack test: prover commits to a higher degree polynomial than expected.
 * @details The polynomial is crafted such that it folds down to a constant (equal to the claimed evaluation)
 * after the expected number of rounds. In this case, the verifier accepts.
 * See: https://hackmd.io/zm5SDfBqTKKXGpI-zQHtpA?view
 */
TYPED_TEST(ShpleminiTest, HighDegreeAttackAccept)
{
    // In debug builds, the coarse-form field assertion can intermittently fire during intermediate
    // arithmetic when processing deliberately oversized polynomials. Suppress assertions to warnings.
    BB_DISABLE_ASSERTS();

    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using CK = typename TypeParam::CommitmentKey;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Polynomial = bb::Polynomial<Fr>;

    // Use the fixture's n (1 << 9 = 512) as the polynomial size
    // small_log_n = 3 means we fold to a constant after 3 rounds
    static constexpr size_t small_log_n = 3;
    CK ck = create_commitment_key<CK>(this->n);

    // Sample public opening point (u_0, u_1, u_2)
    auto u = this->random_evaluation_point(small_log_n);

    // Choose a claimed eval at `u`
    Fr claimed_multilinear_eval = Fr::random_element();

    // poly is of high degrees (up to n), as the SRS allows for it
    Polynomial poly(this->n);

    // Define poly to be of a specific form such that after small_log_n folds with u, it becomes a constant equal to
    // claimed_multilinear_eval. The non-zero coefficients are at indices that fold correctly.
    // For n = 512, small_log_n = 3: indices 4, 504, 508 work (instead of 4, 4088, 4092 for n = 4096)
    const Fr tail = ((Fr(1) - u[0]) * (Fr(1) - u[1])).invert();
    poly.at(4) = claimed_multilinear_eval * tail / u[2];
    poly.at(this->n - 8) = tail;                          // 504 for n=512
    poly.at(this->n - 4) = -tail * (Fr(1) - u[2]) / u[2]; // 508 for n=512

    MockClaimGenerator<Curve> mock_claims(
        this->n, std::vector{ std::move(poly) }, std::vector<Fr>{ claimed_multilinear_eval }, ck);

    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // Run Shplemini prover
    const auto opening_claim =
        ShpleminiProver::prove(this->n, mock_claims.polynomial_batcher, u, ck, prover_transcript);

    // Run KZG/IPA prover
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        TestFixture::IPA::compute_opening_proof(ck, opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(ck, opening_claim, prover_transcript);
    }

    // Verifier side
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(
                                   mock_claims.claim_batcher, u, this->vk().get_g1_identity(), verifier_transcript)
                                   .batch_opening_claim;

    // Verify claim - should succeed because the polynomial was crafted to fold correctly
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        auto result =
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, true);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        EXPECT_EQ(pairing_points.check(), true);
    }
}

/**
 * @brief High degree attack test: prover commits to a random higher degree polynomial.
 * @details The polynomial does not fold down to a constant after the expected number of rounds.
 * In this case, the verifier rejects with high probability.
 */
TYPED_TEST(ShpleminiTest, HighDegreeAttackReject)
{
    // In debug builds, the coarse-form field assertion can intermittently fire during intermediate
    // arithmetic when processing deliberately oversized polynomials. Suppress assertions to warnings
    // for this adversarial test so the test can complete and verify the pairing check fails.
    BB_DISABLE_ASSERTS();

    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using CK = typename TypeParam::CommitmentKey;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Polynomial = bb::Polynomial<Fr>;

    // Use a larger SRS size to allow committing to high degree polynomials
    static constexpr size_t big_n = 1UL << 12;
    static constexpr size_t small_log_n = 3;
    static constexpr size_t big_ck_size = 1 << 14;
    CK ck = create_commitment_key<CK>(big_ck_size);

    // Random high degree polynomial
    Polynomial poly = Polynomial::random(big_n);

    // Sample public opening point (u_0, u_1, u_2)
    auto u = this->random_evaluation_point(small_log_n);

    // Choose a random claimed eval at `u` (likely wrong)
    Fr claimed_multilinear_eval = Fr::random_element();

    MockClaimGenerator<Curve> mock_claims(
        big_n, std::vector{ std::move(poly) }, std::vector<Fr>{ claimed_multilinear_eval }, ck);

    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // Run Shplemini prover
    const auto opening_claim = ShpleminiProver::prove(big_n, mock_claims.polynomial_batcher, u, ck, prover_transcript);

    // Run KZG/IPA prover
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        TestFixture::IPA::compute_opening_proof(ck, opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(ck, opening_claim, prover_transcript);
    }

    // Verifier side
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(
                                   mock_claims.claim_batcher, u, this->vk().get_g1_identity(), verifier_transcript)
                                   .batch_opening_claim;

    // Verify claim - should fail because the random polynomial doesn't fold correctly
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        // IPA verification failure normally throws, but with BB_DISABLE_ASSERTS the assertion
        // becomes a warning and the function may return false instead of throwing.
        auto result =
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, false);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        EXPECT_EQ(pairing_points.check(), false);
    }
}

/**
 * @brief Soundness of the to-be-shifted PCS backstop: a commitment with a non-zero constant
 * coefficient must be rejected.
 *
 * @details For "to-be-shifted-by-one" polynomials (e.g. z_perm in Honk flavors), the verifier
 * batches the commitment com(p) with scalar r^{-1} against the claimed MLE evaluation
 * p_shift(u). With G(X) the univariate whose coefficients are p in Lagrange basis, the
 * commitment side opens to G(r)/r = p[0]/r + G_shift(r), while the MLE side delivers
 * G_shift(r) via the Gemini fold. The two sides differ by the algebraic term p[0]/r; when
 * p[0] != 0 the would-be Shplonk quotient is a rational function rather than a polynomial,
 * and the KZG pairing check rejects with overwhelming probability over the FS challenges.
 *
 * This is the implicit PCS-shift backstop that several relations rely on to enforce
 * z_perm[0] = 0 in disabled rows of ZK flavors (where row-disabling zeros the explicit
 * lagrange_first * z_perm subrelation). The test commits to (p + c * delta_0), claims the
 * shifted MLE evaluation of the honest p (which is unchanged by adding c at index 0, since
 * shifting drops the constant term), and confirms the verifier rejects.
 */
TYPED_TEST(ShpleminiTest, ToBeShiftedNonZeroConstantTermRejected)
{
    using Curve = typename TypeParam::Curve;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;

    CK ck = create_commitment_key<CK>(this->n);

    auto mle_opening_point = this->random_evaluation_point(this->log_n);

    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          mle_opening_point,
                                          ck);

    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    const auto opening_claim =
        ShpleminiProver::prove(this->n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript);

    // For KZG, run the opening proof now: KZG never binds the claim into Fiat-Shamir, so the
    // verifier can be handed a tampered claim later without affecting the prover transcript.
    // For IPA, defer the opening proof until after the tampered batched claim is available; the
    // adversarial prover hashes that claim into its FS buffer to match the verifier (see below).
    if constexpr (!std::is_same_v<TypeParam, GrumpkinSettings>) {
        KZG<Curve>::compute_opening_proof(ck, opening_claim, prover_transcript);
    }

    // Simulate adversary: replace the first to-be-shifted commitment with com(p + c * delta_0),
    // i.e. add c * [1]_1 to it. The shifted MLE evaluation is unchanged (shifting drops the [0]
    // coefficient). The unshifted MLE evaluation of p + c * delta_0 differs from the unshifted MLE
    // evaluation of p by c * prod_i (1 - u_i); update the unshifted counterpart claim accordingly
    // so that any rejection cannot be attributed to a stale unshifted-side mismatch.
    const Fr c = Fr::random_element();
    const Commitment g1_identity = this->vk().get_g1_identity();
    const auto tampered = Commitment(GroupElement(mock_claims.to_be_shifted.commitments[0]) + g1_identity * c);

    Fr lagrange0_at_u = Fr(1);
    for (const auto& u_i : mle_opening_point) {
        lagrange0_at_u *= (Fr(1) - u_i);
    }
    const size_t unshifted_idx = this->num_polynomials - this->num_shiftable; // first to-be-shifted in unshifted batch
    mock_claims.to_be_shifted.commitments[0] = tampered;
    mock_claims.unshifted.commitments[unshifted_idx] = tampered;
    mock_claims.unshifted.evals[unshifted_idx] += c * lagrange0_at_u;

    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(
                                   mock_claims.claim_batcher, mle_opening_point, g1_identity, verifier_transcript)
                                   .batch_opening_claim;

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        // Adversarial IPA prover: stage the prover transcript with the same reduced claim the
        // verifier will hash via add_claim_to_hash_buffer, then fold the honest polynomial. This
        // keeps prover/verifier FS in sync so the rejection isolates the inner-product relation
        // rather than transcript divergence.
        const auto reduced = TestFixture::IPA::reduce_batch_opening_claim(batch_opening_claim);
        prover_transcript->add_to_hash_buffer("IPA:commitment", reduced.commitment);
        prover_transcript->add_to_hash_buffer("IPA:challenge", reduced.opening_pair.challenge);
        prover_transcript->add_to_hash_buffer("IPA:evaluation", reduced.opening_pair.evaluation);
        TestFixture::IPA::compute_opening_proof_internal(ck, opening_claim, prover_transcript);

        // The verifier transcript was initialized before the IPA prover wrote its bytes; refresh
        // its view of proof_data so the IPA verifier can read them.
        verifier_transcript->test_get_proof_data() = prover_transcript->test_get_proof_data();

        auto result =
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
        EXPECT_EQ(result, false);
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        EXPECT_EQ(pairing_points.check(), false);
    }

    // Confirm the rejection is not an artifact of transcript divergence: a fresh challenge with
    // the same label drawn from both transcripts must agree. For KZG this is automatic (the
    // claim is never hashed into FS). For IPA we matched the prover and verifier hash buffers
    // explicitly above; if this check fails, the rejection above could be attributed to the
    // prover and verifier consuming different challenges rather than the PCS check itself.
    EXPECT_EQ(prover_transcript->template get_challenge<Fr>("transcript_sync_check"),
              verifier_transcript->template get_challenge<Fr>("transcript_sync_check"));
}

/**
 * @brief Test that consistency_checked is false when a Libra univariate evaluation is corrupted.
 * @details This test simulates a malicious prover sending a corrupted Libra evaluation via the
 * transcript. The ShpleminiVerifier should detect the inconsistency and set consistency_checked to false.
 */
TYPED_TEST(ShpleminiTest, LibraConsistencyCheckFailsOnCorruptedEvaluation)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    constexpr bool HasZK = true;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve, HasZK>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    // Initialize transcript and commitment key
    auto prover_transcript = TypeParam::Transcript::test_prover_init_empty();

    // SmallSubgroupIPAProver requires at least CURVE::SUBGROUP_SIZE + 3 elements in the ck.
    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->n, 1ULL << (log_subgroup_size + 1)));

    // Generate Libra polynomials, compute masked concatenated Libra polynomial, commit to it
    ZKData zk_sumcheck_data(this->log_n, prover_transcript, ck);

    // Generate multivariate challenge
    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);

    // Generate random prover polynomials, compute their evaluations and commitments
    MockClaimGenerator<Curve> mock_claims(this->n,
                                          /*num_polynomials*/ this->num_polynomials,
                                          /*num_to_be_shifted*/ this->num_shiftable,
                                          mle_opening_point,
                                          ck);

    // Compute the correct sum of the Libra constant term and Libra univariates evaluated at Sumcheck challenges
    const Fr claimed_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, mle_opening_point, this->log_n);

    // CORRUPT: Malicious prover sends a corrupted evaluation via the transcript
    const Fr corrupted_inner_product = claimed_inner_product + Fr::random_element();
    prover_transcript->send_to_verifier("Libra:claimed_evaluation", corrupted_inner_product);

    // Instantiate SmallSubgroupIPAProver with the CORRECT value (prover's internal state is correct,
    // but the value sent to verifier is corrupted - simulating a cheating prover)
    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, mle_opening_point, corrupted_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    // Reduce to KZG or IPA based on the curve used in the test Flavor
    const auto opening_claim = ShpleminiProver::prove(this->n,
                                                      mock_claims.polynomial_batcher,
                                                      mle_opening_point,
                                                      ck,
                                                      prover_transcript,
                                                      small_subgroup_ipa_prover.get_witness_polynomials());

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        TestFixture::IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(this->ck(), opening_claim, prover_transcript);
    }

    // Initialize verifier's transcript
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    // Start populating Verifier's array of Libra commitments
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // Place Libra data to the transcript
    [[maybe_unused]] const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    [[maybe_unused]] const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    // Verifier receives the CORRUPTED evaluation from the transcript
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    // Finalize the array of Libra/SmallSubgroupIpa commitments
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Run Shplemini - verifier uses the corrupted evaluation received from the transcript
    auto shplemini_output = ShpleminiVerifier::compute_batch_opening_claim(mock_claims.claim_batcher,
                                                                           mle_opening_point,
                                                                           this->vk().get_g1_identity(),
                                                                           verifier_transcript,
                                                                           {},
                                                                           libra_commitments,
                                                                           libra_evaluation);

    // Verify that consistency_checked is false due to corrupted Libra evaluation
    EXPECT_FALSE(shplemini_output.consistency_checked);
}

/**
 * @brief Helper to run a Libra tampering test with configurable tampering options.
 * @details Runs the full ZK Shplemini prover/verifier flow with optional tampering of:
 * - A witness polynomial (Concatenated, GrandSum, or Quotient)
 * - A commitment (Concatenated, GrandSum, or Quotient)
 * Then verifies the expected consistency_checked result and that PCS verification fails.
 */
template <typename TypeParam>
void run_libra_tampering_test(ShpleminiTest<TypeParam>* test,
                              typename ShpleminiTest<TypeParam>::TamperedPolynomial tamper_polynomial,
                              typename ShpleminiTest<TypeParam>::TamperedCommitment tamper_commitment,
                              bool expected_consistency_checked)
{
    using TamperedPolynomial = typename ShpleminiTest<TypeParam>::TamperedPolynomial;
    using TamperedCommitment = typename ShpleminiTest<TypeParam>::TamperedCommitment;
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = typename TypeParam::Curve;
    using ShpleminiProver = ShpleminiProver_<Curve>;
    constexpr bool HasZK = true;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve, HasZK>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    auto prover_transcript = TypeParam::Transcript::test_prover_init_empty();

    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(test->n, 1ULL << (log_subgroup_size + 1)));

    ZKData zk_sumcheck_data(test->log_n, prover_transcript, ck);
    std::vector<Fr> mle_opening_point = test->random_evaluation_point(test->log_n);

    MockClaimGenerator<Curve> mock_claims(test->n, test->num_polynomials, test->num_shiftable, mle_opening_point, ck);

    const Fr claimed_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, mle_opening_point, test->log_n);

    prover_transcript->send_to_verifier("Libra:claimed_evaluation", claimed_inner_product);

    SmallSubgroupIPAProver<TypeParam> small_subgroup_ipa_prover(
        zk_sumcheck_data, mle_opening_point, claimed_inner_product, prover_transcript, ck);
    small_subgroup_ipa_prover.prove();

    auto witness_polynomials = small_subgroup_ipa_prover.get_witness_polynomials();

    // Optionally tamper with a witness polynomial
    if (tamper_polynomial != TamperedPolynomial::None) {
        witness_polynomials[static_cast<size_t>(tamper_polynomial)].at(0) += Fr::random_element();
    }

    // Generate opening proof material for the possibly tampered witness polynomials.
    const auto opening_claim = ShpleminiProver::prove(
        test->n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript, witness_polynomials);

    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        ShpleminiTest<TypeParam>::IPA::compute_opening_proof(test->ck(), opening_claim, prover_transcript);
    } else {
        KZG<Curve>::compute_opening_proof(test->ck(), opening_claim, prover_transcript);
    }

    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    [[maybe_unused]] const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    [[maybe_unused]] const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");

    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Optionally tamper with a commitment
    if (tamper_commitment != TamperedCommitment::None) {
        auto idx = static_cast<size_t>(tamper_commitment);
        libra_commitments[idx] = libra_commitments[idx] + Commitment::one();
    }

    auto [batch_opening_claim, consistency_checked] =
        ShpleminiVerifier::compute_batch_opening_claim(mock_claims.claim_batcher,
                                                       mle_opening_point,
                                                       test->vk().get_g1_identity(),
                                                       verifier_transcript,
                                                       {},
                                                       libra_commitments,
                                                       libra_evaluation);

    EXPECT_EQ(consistency_checked, expected_consistency_checked);

    // PCS verification should always fail when tampering occurred
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        EXPECT_FALSE(ShpleminiTest<TypeParam>::IPA::reduce_verify_batch_opening_claim(
            batch_opening_claim, test->vk(), verifier_transcript));
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        EXPECT_FALSE(pairing_points.check());
    }
}

/**
 * @brief Test tampering with quotient polynomial Q - breaks consistency check and PCS.
 */
TYPED_TEST(ShpleminiTest, LibraQuotientPolynomialTamperingCausesVerificationFailure)
{
    using TamperedPolynomial = typename TestFixture::TamperedPolynomial;
    using TamperedCommitment = typename TestFixture::TamperedCommitment;
    // Consistency check fails because Q(r) is wrong
    run_libra_tampering_test(
        this, TamperedPolynomial::Quotient, TamperedCommitment::None, /*expected_consistency_checked=*/false);
}

/**
 * @brief Test tampering with quotient commitment [Q] - consistency check passes but PCS fails.
 */
TYPED_TEST(ShpleminiTest, LibraQuotientCommitmentTamperingCausesVerificationFailure)
{
    using TamperedPolynomial = typename TestFixture::TamperedPolynomial;
    using TamperedCommitment = typename TestFixture::TamperedCommitment;
    // Consistency check passes because evaluations are honest
    run_libra_tampering_test(
        this, TamperedPolynomial::None, TamperedCommitment::Quotient, /*expected_consistency_checked=*/true);
}

/**
 * @brief Test tampering with grand sum commitment [A] - consistency check passes but PCS fails.
 */
TYPED_TEST(ShpleminiTest, LibraGrandSumCommitmentTamperingCausesVerificationFailure)
{
    using TamperedPolynomial = typename TestFixture::TamperedPolynomial;
    using TamperedCommitment = typename TestFixture::TamperedCommitment;
    // Consistency check passes because evaluations are honest
    run_libra_tampering_test(
        this, TamperedPolynomial::None, TamperedCommitment::GrandSum, /*expected_consistency_checked=*/true);
}

/**
 * @brief Test tampering with concatenated polynomial G - breaks consistency check and PCS.
 */
TYPED_TEST(ShpleminiTest, LibraConcatenatedPolynomialTamperingCausesVerificationFailure)
{
    using TamperedPolynomial = typename TestFixture::TamperedPolynomial;
    using TamperedCommitment = typename TestFixture::TamperedCommitment;
    // Consistency check fails because G(r) is wrong
    run_libra_tampering_test(
        this, TamperedPolynomial::Concatenated, TamperedCommitment::None, /*expected_consistency_checked=*/false);
}

/**
 * @brief Test tampering with concatenated commitment [G] - consistency check passes but PCS fails.
 */
TYPED_TEST(ShpleminiTest, LibraConcatenatedCommitmentTamperingCausesVerificationFailure)
{
    using TamperedPolynomial = typename TestFixture::TamperedPolynomial;
    using TamperedCommitment = typename TestFixture::TamperedCommitment;
    // Consistency check passes because evaluations are honest
    run_libra_tampering_test(
        this, TamperedPolynomial::None, TamperedCommitment::Concatenated, /*expected_consistency_checked=*/true);
}

/**
 * @brief End-to-end Shplemini + SmallSubgroupIPA soundness regression.
 *
 * @details Drives `run_forged_small_ipa_prover` to create malicious SmallSubgroupIPA witness data that satisfies the
 * local algebraic identity at the random Gemini challenge. The test then runs the production Shplemini verifier path
 * and asserts:
 *   - `consistency_checked == true`, proving the local SmallSubgroupIPA identity alone accepts the tampered data,
 *   - PCS verification fails, proving the Shplemini-batched opening catches the inconsistency in the committed data.
 */
TYPED_TEST(ShpleminiTest, SmallSubgroupIPABoundaryOpeningRejectsForgedInnerProduct)
{
    using ZKData = ZKSumcheckData<TypeParam>;
    using Curve = typename TypeParam::Curve;
    constexpr bool HasZK = true;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve, HasZK>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using CK = typename TypeParam::CommitmentKey;

    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;
    auto prover_transcript = TypeParam::Transcript::test_prover_init_empty();

    static constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(SUBGROUP_SIZE));
    CK ck = create_commitment_key<CK>(std::max<size_t>(this->n, 1ULL << (log_subgroup_size + 1)));

    ZKData zk_sumcheck_data(this->log_n, prover_transcript, ck);
    std::vector<Fr> mle_opening_point = this->random_evaluation_point(this->log_n);
    MockClaimGenerator<Curve> mock_claims(this->n, this->num_polynomials, this->num_shiftable, mle_opening_point, ck);

    const Fr honest_inner_product = SmallSubgroupIPAProver<TypeParam>::compute_claimed_inner_product(
        zk_sumcheck_data, mle_opening_point, this->log_n);

    const Fr forged_inner_product = this->run_forged_small_ipa_prover(
        prover_transcript, ck, zk_sumcheck_data, mle_opening_point, mock_claims, honest_inner_product);

    // ---- Verifier ------------------------------------------------------------------------------
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] =
        verifier_transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    [[maybe_unused]] const Fr libra_total_sum = verifier_transcript->template receive_from_prover<Fr>("Libra:Sum");
    [[maybe_unused]] const Fr libra_challenge = verifier_transcript->template get_challenge<Fr>("Libra:Challenge");
    const Fr libra_evaluation = verifier_transcript->template receive_from_prover<Fr>("Libra:claimed_evaluation");
    libra_commitments[1] = verifier_transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = verifier_transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    EXPECT_EQ(libra_evaluation, forged_inner_product);
    EXPECT_NE(libra_evaluation, honest_inner_product);

    auto [batch_opening_claim, consistency_checked] =
        ShpleminiVerifier::compute_batch_opening_claim(mock_claims.claim_batcher,
                                                       mle_opening_point,
                                                       this->vk().get_g1_identity(),
                                                       verifier_transcript,
                                                       {},
                                                       libra_commitments,
                                                       libra_evaluation);

    // The algebraic identity at r holds for (A_forged, Q_forged, forged_inner_product) by construction.
    EXPECT_TRUE(consistency_checked);

    // The Shplemini batched opening MUST reject because the committed [A_forged] does not actually evaluate to 0
    // at X = 1 — it evaluates to delta != 0 — contradicting the verifier's hardcoded boundary claim.
    if constexpr (std::is_same_v<TypeParam, GrumpkinSettings>) {
        EXPECT_FALSE(
            TestFixture::IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript));
    } else {
        const auto pairing_points =
            KZG<Curve>::reduce_verify_batch_opening_claim(std::move(batch_opening_claim), verifier_transcript);
        EXPECT_FALSE(pairing_points.check());
    }
}

} // namespace bb

#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "gemini_impl.hpp"

#include "../commitment_key.test.hpp"

using namespace bb;

template <class Curve> class GeminiTest : public CommitmentTest<Curve> {
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

  public:
    static constexpr size_t log_n = 4;
    static constexpr size_t n = 1UL << log_n;

    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;

    static CK ck;
    static std::shared_ptr<VK> vk;

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(n);
        vk = create_verifier_commitment_key<VK>();
    }

    void execute_gemini_and_verify_claims(std::vector<Fr>& multilinear_evaluation_point,
                                          MockClaimGenerator<Curve> mock_claims)
    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(
            this->n, mock_claims.polynomial_batcher, multilinear_evaluation_point, ck, prover_transcript);

        // The prover output needs to be completed by adding the "positive" Fold claims, i.e. evaluations of Fold^(i) at
        // r^{2^i} for i=1, ..., d-1. Although here we are copying polynomials, it is not the case when GeminiProver is
        // combined with ShplonkProver.
        std::vector<ProverOpeningClaim<Curve>> prover_claims_with_pos_evals;
        // `prover_output` consists of d+1 opening claims, we add another d-1 claims for each positive evaluation
        // Fold^i(r^{2^i}) for i = 1, ..., d-1
        const size_t total_num_claims = 2 * log_n;
        prover_claims_with_pos_evals.reserve(total_num_claims);

        for (auto& claim : prover_output) {
            if (claim.gemini_fold) {
                if (claim.gemini_fold) {
                    // "positive" evaluation challenge r^{2^i} for i = 1, ..., d-1
                    const Fr evaluation_challenge = -claim.opening_pair.challenge;
                    // Fold^(i) at r^{2^i} for i=1, ..., d-1
                    const Fr pos_evaluation = claim.polynomial.evaluate(evaluation_challenge);
                    // Add the positive Fold claims to the vector of claims
                    ProverOpeningClaim<Curve> pos_fold_claim = { .polynomial = claim.polynomial,
                                                                 .opening_pair = { .challenge = evaluation_challenge,
                                                                                   .evaluation = pos_evaluation } };
                    prover_claims_with_pos_evals.emplace_back(pos_fold_claim);
                }
            }
            prover_claims_with_pos_evals.emplace_back(claim);
        }

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_claims_with_pos_evals);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - d opening pairs: {r^{2^i}, \hat{a}_i} for i = 0, ..., d-1
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: 2d opening pairs and 2d Fold poly commitments into verifier claim
        auto verifier_claims = GeminiVerifier::reduce_verification(
            multilinear_evaluation_point, mock_claims.claim_batcher, verifier_transcript);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_claims_with_pos_evals, verifier_claims)) {
            this->verify_opening_claim(verifier_claim, prover_claim.polynomial, ck);
            ASSERT_EQ(prover_claim.opening_pair, verifier_claim.opening_pair);
        }
    }
};

using ParamsTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(GeminiTest, ParamsTypes);

TYPED_TEST(GeminiTest, Single)
{
    auto u = this->random_evaluation_point(this->log_n);
    MockClaimGenerator mock_claims(
        this->n, /*num_polynomials*/ 1, /*num_to_be_shifted*/ 0, /*num_to_be_right_shifted_by_k*/ 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, mock_claims);
}

TYPED_TEST(GeminiTest, SingleShift)
{
    auto u = this->random_evaluation_point(this->log_n);

    MockClaimGenerator mock_claims(
        this->n, /*num_polynomials*/ 1, /*num_to_be_shifted*/ 1, /*num_to_be_right_shifted_by_k*/ 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, mock_claims);
}

TYPED_TEST(GeminiTest, Double)
{

    auto u = this->random_evaluation_point(this->log_n);

    MockClaimGenerator mock_claims(
        this->n, /*num_polynomials*/ 2, /*num_to_be_shifted*/ 0, /*num_to_be_right_shifted_by_k*/ 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, mock_claims);
}

TYPED_TEST(GeminiTest, DoubleWithShift)
{

    auto u = this->random_evaluation_point(this->log_n);

    MockClaimGenerator mock_claims(
        this->n, /*num_polynomials*/ 2, /*num_to_be_shifted*/ 1, /*num_to_be_right_shifted_by_k*/ 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, mock_claims);
}

TYPED_TEST(GeminiTest, DoubleWithShiftAndInterleaving)
{
    auto u = this->random_evaluation_point(this->log_n);

    MockClaimGenerator mock_claims(this->n,
                                   /*num_polynomials*/ 2,
                                   /*num_to_be_shifted*/ 0,
                                   /*num_to_be_right_shifted_by_k*/ 0,
                                   u,
                                   this->ck,
                                   /*num_interleaved*/ 3,
                                   /*num_to_be_interleaved*/ 2);

    this->execute_gemini_and_verify_claims(u, mock_claims);
}

/**
 * @brief Implementation of the [attack described by Ariel](https://hackmd.io/zm5SDfBqTKKXGpI-zQHtpA?view).
 *
 */
TYPED_TEST(GeminiTest, SoundnessRegression)
{
    using ClaimBatcher = ClaimBatcher_<TypeParam>;
    using ClaimBatch = ClaimBatcher::Batch;
    using Claim = ProverOpeningClaim<TypeParam>;
    using Commitment = TypeParam::AffineElement;
    using Fr = TypeParam::ScalarField;
    const size_t log_n = 3;
    const size_t n = 8;

    auto prover_transcript = NativeTranscript::prover_init_empty();
    const Fr rho = prover_transcript->template get_challenge<Fr>("rho");
    std::vector<Polynomial<Fr>> fold_polynomials;
    fold_polynomials.reserve(log_n);

    Polynomial<Fr> fold_0(n);
    Polynomial<Fr> fold_1(n / 2);
    Polynomial<Fr> fold_2(n / 4);

    auto u = this->random_evaluation_point(log_n);

    // Generate a random evaluation v, the prover claims that `zero_polynomial`(u) = v
    Fr claimed_multilinear_eval = Fr::random_element();

    // Go through the Gemini Prover steps: compute fold polynomials and their evaluations
    std::vector<Fr> fold_evals;
    fold_evals.reserve(log_n);

    // By defining the coefficients of fold polynomials as below, a malicious prover can make sure that the values
    // fold₁(r²) = 0, and hence fold₀(r), computed by the verifier, are 0. At the same time, the prover can open
    // fold₁(-r²) and fold₂(-r⁴)`to their honest value.

    // fold₂[0] = claimed_multilinear_eval ⋅ u₁² ⋅ [(1 - u₂) ⋅ u₁² - u₂ ⋅ (1 - u₁)²]⁻¹
    fold_2.at(0) =
        claimed_multilinear_eval * u[1].sqr() * ((Fr(1) - u[2]) * u[1].sqr() - u[2] * (Fr(1) - u[1]).sqr()).invert();
    // fold₂[1] = - (1 - u₁)² ⋅ fold₂[0] ⋅ u₁⁻²
    fold_2.at(1) = -(Fr(1) - u[1]).sqr() * fold_2.at(0) * (u[1].sqr()).invert();

    // The coefficients of fold_1 are determined by the constant term of fold_2.
    fold_1.at(0) = Fr(0);
    fold_1.at(1) = Fr(2) * fold_2.at(0) * u[1].invert();           // fold₁[1] = 2 ⋅ fold₂[0] / u₁
    fold_1.at(2) = -(Fr(1) - u[1]) * fold_1.at(1) * u[1].invert(); // fold₁[2] = -(1 - u₁) ⋅ fold₁[1] / u₁
    fold_1.at(3) = Fr(0);

    prover_transcript->template send_to_verifier("Gemini:FOLD_1", this->ck.commit(fold_1));
    prover_transcript->template send_to_verifier("Gemini:FOLD_2", this->ck.commit(fold_2));

    // Get Gemini evaluation challenge
    const Fr gemini_r = prover_transcript->template get_challenge<Fr>("Gemini:r");

    // Place honest eval of fold₀(-r) to the vector of evals
    fold_evals.emplace_back(fold_0.evaluate(-gemini_r));

    // Compute univariate opening queries rₗ = r^{2ˡ} for l = 0, 1, 2
    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_r, log_n);

    // Compute honest evaluations fold₁(-r²) and fold₂(-r⁴)
    fold_evals.emplace_back(fold_1.evaluate(-r_squares[1]));
    fold_evals.emplace_back(fold_2.evaluate(-r_squares[2]));
    prover_transcript->template send_to_verifier("Gemini:a_1", fold_evals[0]);
    prover_transcript->template send_to_verifier("Gemini:a_2", fold_evals[1]);
    prover_transcript->template send_to_verifier("Gemini:a_3", fold_evals[2]);

    // Compute the powers of r used by the verifier. It is an artifact of the const proof size logic.
    const std::vector<Fr> gemini_eval_challenge_powers = gemini::powers_of_evaluation_challenge(gemini_r, log_n);

    std::vector<Claim> prover_opening_claims;
    prover_opening_claims.reserve(2 * log_n);

    prover_opening_claims.emplace_back(Claim{ fold_0, { gemini_r, Fr{ 0 } } });
    prover_opening_claims.emplace_back(Claim{ fold_0, { -gemini_r, Fr{ 0 } } });
    prover_opening_claims.emplace_back(Claim{ fold_1, { r_squares[1], fold_1.evaluate(r_squares[1]) } });
    prover_opening_claims.emplace_back(Claim{ fold_1, { -r_squares[1], fold_evals[1] } });
    prover_opening_claims.emplace_back(Claim{ fold_2, { r_squares[2], fold_2.evaluate(r_squares[2]) } });
    prover_opening_claims.emplace_back(Claim{ fold_2, { -r_squares[2], fold_evals[2] } });

    // Check that the Fold polynomials have been evaluated correctly in the prover
    this->verify_batch_opening_pair(prover_opening_claims);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    std::vector<Commitment> unshifted_commitments = { this->ck.commit(fold_0) };
    std::vector<Fr> unshifted_evals = { claimed_multilinear_eval * rho.pow(0) };

    ClaimBatcher claim_batcher{ .unshifted =
                                    ClaimBatch{ RefVector(unshifted_commitments), RefVector(unshifted_evals) } };

    auto verifier_claims = GeminiVerifier_<TypeParam>::reduce_verification(u, claim_batcher, verifier_transcript);

    // Malicious prover could honestly prove all "negative" evaluations and several "positive evaluations". In
    // particular, the evaluation of `fold_0` at r.
    std::vector<size_t> matching_claim_indices{ 0, 1, 3, 4, 5 };
    // However, the evaluation of `fold_1` at r^2 that the verifier computes assuming that fold has been performed
    // correctly, does not match the actual evaluation of tampered fold_1 that the prover can open.
    std::vector<size_t> mismatching_claim_indices = { 2 };
    for (auto idx : matching_claim_indices) {
        EXPECT_TRUE(prover_opening_claims[idx].opening_pair == verifier_claims[idx].opening_pair);
    }

    // The mismatch in claims below leads to Gemini and Shplemini Verifier rejecting the tampered proof and confirms the
    // necessity of opening `fold_i` at r^{2^i} for i = 1, ..., log_n - 1.
    for (auto idx : mismatching_claim_indices) {
        EXPECT_FALSE(prover_opening_claims[idx].opening_pair == verifier_claims[idx].opening_pair);
    }
}

template <class Curve> typename GeminiTest<Curve>::CK GeminiTest<Curve>::ck;
template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::VK> GeminiTest<Curve>::vk = nullptr;

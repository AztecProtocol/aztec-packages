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

    static std::shared_ptr<CK> ck;
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

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_output);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - Single opening pair: {r, \hat{a}_0}
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: d+1 opening pairs and d+1 Fold poly commitments into verifier claim
        auto verifier_claims = GeminiVerifier::reduce_verification(
            multilinear_evaluation_point, mock_claims.claim_batcher, verifier_transcript);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_output, verifier_claims)) {
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

TYPED_TEST(GeminiTest, DoubleWithShiftAndConcatenation)
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
    using Fr = TypeParam::ScalarField;
    const size_t log_n = 3;
    const size_t n = 8;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    bb::Polynomial<Fr> zero_polynomial(n);
    auto u = this->random_evaluation_point(this->log_n);

    // Generate a random evaluation v, the prover claims that `zero_polynomial`(u) = v
    Fr claimed_multilinear_eval = Fr::random_element();

    // Go through the Gemini Prover steps: compute fold polynomials and their evaluations
    std::vector<Fr> fold_evals;
    fold_evals.reserve(log_n);
    Polynomial<Fr> fold_2(2);
    Polynomial<Fr> fold_1(4);

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

    // Get Gemini evaluation challenge
    const Fr gemini_r = Fr::random_element();

    // Place honest eval of fold₀(-r) to the vector of evals
    fold_evals.emplace_back(Fr(0));

    // Compute univariate opening queries rₗ = r^{2ˡ} for l = 0, 1, 2
    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(gemini_r, log_n);

    // Compute honest evaluations fold₁(-r²) and fold₂(-r⁴)
    fold_evals.emplace_back(fold_1.evaluate(-r_squares[1]));
    fold_evals.emplace_back(fold_2.evaluate(-r_squares[2]));

    // Compute the powers of r used by the verifier. It is an artifact of the const proof size logic.
    const std::vector<Fr> gemini_eval_challenge_powers =
        gemini::powers_of_evaluation_challenge(gemini_r, CONST_PROOF_SIZE_LOG_N);

    // Compute fold₀(r) as Verifier would compute it
    const Fr full_a_0_pos = GeminiVerifier_<TypeParam>::compute_gemini_batched_univariate_evaluation(
        log_n, claimed_multilinear_eval, u, gemini_eval_challenge_powers, fold_evals);

    // Check that fold₀(r) = 0. Therefore, a malicious prover could open it using the commitment to the zero
    // polynomial.
    EXPECT_TRUE(full_a_0_pos == Fr(0));
}

template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::CK> GeminiTest<Curve>::ck = nullptr;
template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::VK> GeminiTest<Curve>::vk = nullptr;

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
template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::CK> GeminiTest<Curve>::ck = nullptr;
template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::VK> GeminiTest<Curve>::vk = nullptr;

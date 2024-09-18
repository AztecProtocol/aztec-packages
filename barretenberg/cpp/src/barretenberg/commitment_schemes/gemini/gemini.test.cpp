#include "gemini.hpp"

#include "../commitment_key.test.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

using namespace bb;

template <class Curve> class GeminiTest : public CommitmentTest<Curve> {
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;

  public:
    void execute_gemini_and_verify_claims(std::vector<Fr>& multilinear_evaluation_point,
                                          std::vector<Fr>& multilinear_evaluations,
                                          std::vector<Polynomial<Fr>>& multilinear_polynomials,
                                          std::vector<Polynomial<Fr>>& multilinear_polynomials_to_be_shifted,
                                          std::vector<GroupElement>& multilinear_commitments,
                                          std::vector<GroupElement>& multilinear_commitments_to_be_shifted)
    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(this->commitment_key,
                                                 multilinear_evaluation_point,
                                                 multilinear_evaluations,
                                                 RefVector(multilinear_polynomials),
                                                 RefVector(multilinear_polynomials_to_be_shifted),
                                                 prover_transcript);

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_output);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - Single opening pair: {r, \hat{a}_0}
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: d+1 opening pairs and d+1 Fold poly commitments into verifier claim
        auto verifier_claims = GeminiVerifier::reduce_verification(multilinear_evaluation_point,
                                                                   multilinear_evaluations,
                                                                   RefVector(multilinear_commitments),
                                                                   RefVector(multilinear_commitments_to_be_shifted),
                                                                   verifier_transcript);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_output, verifier_claims)) {
            ASSERT_EQ(prover_claim.opening_pair, verifier_claim.opening_pair);
            this->verify_opening_claim(verifier_claim, prover_claim.polynomial);
        }
    }
};

using ParamsTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(GeminiTest, ParamsTypes);

TYPED_TEST(GeminiTest, Single)
{
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);
    auto poly = Polynomial<Fr>::random(n);
    auto commitment = this->commit(poly);
    auto eval = poly.evaluate_mle(u);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations = { eval };
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = {};
    std::vector<GroupElement> multilinear_commitments = { commitment };
    std::vector<GroupElement> multilinear_commitments_to_be_shifted = {};

    this->execute_gemini_and_verify_claims(u,
                                           multilinear_evaluations,
                                           multilinear_polynomials,
                                           multilinear_polynomials_to_be_shifted,
                                           multilinear_commitments,
                                           multilinear_commitments_to_be_shifted);
}

TYPED_TEST(GeminiTest, SingleShift)
{
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);

    // shiftable polynomial must have 0 as last coefficient
    auto poly = Polynomial<Fr>::random(n, /*shiftable*/ 1);

    auto commitment = this->commit(poly);
    auto eval_shift = poly.evaluate_mle(u, true);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations = { eval_shift };
    std::vector<Polynomial<Fr>> multilinear_polynomials = {};
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = { poly.share() };
    std::vector<GroupElement> multilinear_commitments = {};
    std::vector<GroupElement> multilinear_commitments_to_be_shifted = { commitment };

    this->execute_gemini_and_verify_claims(u,
                                           multilinear_evaluations,
                                           multilinear_polynomials,
                                           multilinear_polynomials_to_be_shifted,
                                           multilinear_commitments,
                                           multilinear_commitments_to_be_shifted);
}

TYPED_TEST(GeminiTest, Double)
{
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);

    auto poly1 = Polynomial<Fr>::random(n);
    auto poly2 = Polynomial<Fr>::random(n);

    auto commitment1 = this->commit(poly1);
    auto commitment2 = this->commit(poly2);

    auto eval1 = poly1.evaluate_mle(u);
    auto eval2 = poly2.evaluate_mle(u);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations = { eval1, eval2 };
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly1.share(), poly2.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = {};
    std::vector<GroupElement> multilinear_commitments = { commitment1, commitment2 };
    std::vector<GroupElement> multilinear_commitments_to_be_shifted = {};

    this->execute_gemini_and_verify_claims(u,
                                           multilinear_evaluations,
                                           multilinear_polynomials,
                                           multilinear_polynomials_to_be_shifted,
                                           multilinear_commitments,
                                           multilinear_commitments_to_be_shifted);
}

TYPED_TEST(GeminiTest, DoubleWithShift)
{
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);

    auto poly1 = Polynomial<Fr>::random(n);
    auto poly2 = Polynomial<Fr>::random(n, 1); // make 'shiftable'

    auto commitment1 = this->commit(poly1);
    auto commitment2 = this->commit(poly2);

    auto eval1 = poly1.evaluate_mle(u);
    auto eval2 = poly2.evaluate_mle(u);
    auto eval2_shift = poly2.evaluate_mle(u, true);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval2_shift };
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly1.share(), poly2.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = { poly2.share() };
    std::vector<GroupElement> multilinear_commitments = { commitment1, commitment2 };
    std::vector<GroupElement> multilinear_commitments_to_be_shifted = { commitment2 };

    this->execute_gemini_and_verify_claims(u,
                                           multilinear_evaluations,
                                           multilinear_polynomials,
                                           multilinear_polynomials_to_be_shifted,
                                           multilinear_commitments,
                                           multilinear_commitments_to_be_shifted);
}

#include "gemini_impl.hpp"

#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/utils/test_utils.hpp"

using namespace bb;

template <class Curve> class GeminiTest : public CommitmentTest<Curve> {
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

  public:
    void execute_gemini_and_verify_claims(std::vector<Fr>& multilinear_evaluation_point,
                                          RefVector<Fr> multilinear_evaluations_unshifted,
                                          RefVector<Fr> multilinear_evaluations_shifted,
                                          RefSpan<Polynomial<Fr>> multilinear_polynomials,
                                          RefSpan<Polynomial<Fr>> multilinear_polynomials_to_be_shifted,
                                          RefVector<Commitment> multilinear_commitments,
                                          RefVector<Commitment> multilinear_commitments_to_be_shifted)
    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(1 << multilinear_evaluation_point.size(),
                                                 multilinear_polynomials,
                                                 multilinear_polynomials_to_be_shifted,
                                                 multilinear_evaluation_point,
                                                 this->commitment_key,
                                                 prover_transcript);

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_output);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - Single opening pair: {r, \hat{a}_0}
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: d+1 opening pairs and d+1 Fold poly commitments into verifier claim
        auto verifier_claims = GeminiVerifier::reduce_verification(multilinear_evaluation_point,
                                                                   multilinear_evaluations_unshifted,
                                                                   multilinear_evaluations_shifted,
                                                                   multilinear_commitments,
                                                                   multilinear_commitments_to_be_shifted,
                                                                   verifier_transcript);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_output, verifier_claims)) {
            this->verify_opening_claim(verifier_claim, prover_claim.polynomial);
            ASSERT_EQ(prover_claim.opening_pair, verifier_claim.opening_pair);
        }
    }

    void execute_gemini_and_verify_claims_with_concatenation(
        std::vector<Fr>& multilinear_evaluation_point,
        RefVector<Fr> multilinear_evaluations_unshifted,
        RefVector<Fr> multilinear_evaluations_shifted,
        RefSpan<Polynomial<Fr>> multilinear_polynomials,
        RefSpan<Polynomial<Fr>> multilinear_polynomials_to_be_shifted,
        RefVector<Commitment> multilinear_commitments,
        RefVector<Commitment> multilinear_commitments_to_be_shifted,
        RefSpan<Polynomial<Fr>> concatenated_polynomials = {},
        RefSpan<Fr> concatenated_evaluations = {},
        const std::vector<RefVector<Polynomial<Fr>>>& groups_to_be_concatenated = {},
        const std::vector<RefVector<Commitment>>& concatenation_group_commitments = {})

    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(1 << multilinear_evaluation_point.size(),
                                                 multilinear_polynomials,
                                                 multilinear_polynomials_to_be_shifted,
                                                 multilinear_evaluation_point,
                                                 this->commitment_key,
                                                 prover_transcript,
                                                 concatenated_polynomials,
                                                 groups_to_be_concatenated);

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_output);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - Single opening pair: {r, \hat{a}_0}
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: d+1 opening pairs and d+1 Fold poly commitments into verifier claim
        auto verifier_claims = GeminiVerifier::reduce_verification(multilinear_evaluation_point,
                                                                   multilinear_evaluations_unshifted,
                                                                   multilinear_evaluations_shifted,
                                                                   multilinear_commitments,
                                                                   multilinear_commitments_to_be_shifted,
                                                                   verifier_transcript,
                                                                   concatenation_group_commitments,
                                                                   concatenated_evaluations);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_output, verifier_claims)) {
            this->verify_opening_claim(verifier_claim, prover_claim.polynomial);
            ASSERT_EQ(prover_claim.opening_pair, verifier_claim.opening_pair);
        }
    }
};

using ParamsTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(GeminiTest, ParamsTypes);

TYPED_TEST(GeminiTest, Single)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);
    auto poly = Polynomial<Fr>::random(n);
    auto commitment = this->commit(poly);
    auto eval = poly.evaluate_mle(u);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations_unshifted = { eval };
    std::vector<Fr> multilinear_evaluations_shifted = {};
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = {};
    std::vector<Commitment> multilinear_commitments = { commitment };
    std::vector<Commitment> multilinear_commitments_to_be_shifted = {};

    this->execute_gemini_and_verify_claims(u,
                                           RefVector(multilinear_evaluations_unshifted),
                                           RefVector(multilinear_evaluations_shifted),
                                           RefVector(multilinear_polynomials),
                                           RefVector(multilinear_polynomials_to_be_shifted),
                                           RefVector(multilinear_commitments),
                                           RefVector(multilinear_commitments_to_be_shifted));
}

TYPED_TEST(GeminiTest, SingleShift)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);

    // shiftable polynomial must have 0 as last coefficient
    auto poly = Polynomial<Fr>::random(n, /*shiftable*/ 1);

    auto commitment = this->commit(poly);
    auto eval_shift = poly.evaluate_mle(u, true);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations_unshifted = {};
    std::vector<Fr> multilinear_evaluations_shifted = { eval_shift };
    std::vector<Polynomial<Fr>> multilinear_polynomials = {};
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = { poly.share() };
    std::vector<Commitment> multilinear_commitments = {};
    std::vector<Commitment> multilinear_commitments_to_be_shifted = { commitment };

    this->execute_gemini_and_verify_claims(u,
                                           RefVector(multilinear_evaluations_unshifted),
                                           RefVector(multilinear_evaluations_shifted),
                                           RefVector(multilinear_polynomials),
                                           RefVector(multilinear_polynomials_to_be_shifted),
                                           RefVector(multilinear_commitments),
                                           RefVector(multilinear_commitments_to_be_shifted));
}

TYPED_TEST(GeminiTest, Double)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;

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
    std::vector<Fr> multilinear_evaluations_unshifted = { eval1, eval2 };
    std::vector<Fr> multilinear_evaluations_shifted = {};
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly1.share(), poly2.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = {};
    std::vector<Commitment> multilinear_commitments = { commitment1, commitment2 };
    std::vector<Commitment> multilinear_commitments_to_be_shifted = {};

    this->execute_gemini_and_verify_claims(u,
                                           RefVector(multilinear_evaluations_unshifted),
                                           RefVector(multilinear_evaluations_shifted),
                                           RefVector(multilinear_polynomials),
                                           RefVector(multilinear_polynomials_to_be_shifted),
                                           RefVector(multilinear_commitments),
                                           RefVector(multilinear_commitments_to_be_shifted));
}

TYPED_TEST(GeminiTest, DoubleWithShift)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;

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
    std::vector<Fr> multilinear_evaluations_unshifted = { eval1, eval2 };
    std::vector<Fr> multilinear_evaluations_shifted = { eval2_shift };
    std::vector<Polynomial<Fr>> multilinear_polynomials = { poly1.share(), poly2.share() };
    std::vector<Polynomial<Fr>> multilinear_polynomials_to_be_shifted = { poly2.share() };
    std::vector<Commitment> multilinear_commitments = { commitment1, commitment2 };
    std::vector<Commitment> multilinear_commitments_to_be_shifted = { commitment2 };

    this->execute_gemini_and_verify_claims(u,
                                           RefVector(multilinear_evaluations_unshifted),
                                           RefVector(multilinear_evaluations_shifted),
                                           RefVector(multilinear_polynomials),
                                           RefVector(multilinear_polynomials_to_be_shifted),
                                           RefVector(multilinear_commitments),
                                           RefVector(multilinear_commitments_to_be_shifted));
}

TYPED_TEST(GeminiTest, DoubleWithShiftAndConcatenation)
{
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

    const size_t n = 16;
    const size_t log_n = 4;

    auto u = this->random_evaluation_point(log_n);

    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, 1); // make 'shiftable'

    auto commitment1 = this->commit(poly1);
    auto commitment2 = this->commit(poly2);

    auto eval1 = poly1.evaluate_mle(u);
    auto eval2 = poly2.evaluate_mle(u);
    auto eval2_shift = poly2.evaluate_mle(u, true);

    // Collect multilinear polynomials evaluations, and commitments for input to prover/verifier
    std::vector<Fr> multilinear_evaluations_unshifted = { eval1, eval2 };
    std::vector<Fr> multilinear_evaluations_shifted = { eval2_shift };
    std::vector<Polynomial> multilinear_polynomials = { poly1.share(), poly2.share() };
    std::vector<Polynomial> multilinear_polynomials_to_be_shifted = { poly2.share() };
    std::vector<Commitment> multilinear_commitments = { commitment1, commitment2 };
    std::vector<Commitment> multilinear_commitments_to_be_shifted = { commitment2 };

    auto [concatenation_groups, concatenated_polynomials, c_evaluations, concatenation_groups_commitments] =
        generate_concatenation_inputs<TypeParam>(u, /*mun_concatenated=*/3, /*concatenation_index=*/2, this->ck());

    this->execute_gemini_and_verify_claims_with_concatenation(
        u,
        RefVector(multilinear_evaluations_unshifted),
        RefVector(multilinear_evaluations_shifted),
        RefVector(multilinear_polynomials),
        RefVector(multilinear_polynomials_to_be_shifted),
        RefVector(multilinear_commitments),
        RefVector(multilinear_commitments_to_be_shifted),
        RefVector(concatenated_polynomials),
        RefVector(c_evaluations),
        to_vector_of_ref_vectors(concatenation_groups),
        to_vector_of_ref_vectors(concatenation_groups_commitments));
}

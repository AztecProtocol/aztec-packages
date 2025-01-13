#include "barretenberg/commitment_schemes/utils/instance_witness_generator.hpp"
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
    static constexpr size_t n = 16;
    static constexpr size_t log_n = 4;

    using CK = CommitmentKey<Curve>;
    static std::shared_ptr<CK> ck;

    static void SetUpTestSuite() { ck = create_commitment_key<CK>(n); }

    void execute_gemini_and_verify_claims(std::vector<Fr>& multilinear_evaluation_point,
                                          InstanceWitnessGenerator<Curve> instance_witness)
    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(this->n,
                                                 RefVector(instance_witness.unshifted_polynomials),
                                                 RefVector(instance_witness.to_be_shifted_polynomials),
                                                 multilinear_evaluation_point,
                                                 this->ck,
                                                 prover_transcript);

        // Check that the Fold polynomials have been evaluated correctly in the prover
        this->verify_batch_opening_pair(prover_output);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

        // Compute:
        // - Single opening pair: {r, \hat{a}_0}
        // - 2 partially evaluated Fold polynomial commitments [Fold_{r}^(0)] and [Fold_{-r}^(0)]
        // Aggregate: d+1 opening pairs and d+1 Fold poly commitments into verifier claim
        auto verifier_claims =
            GeminiVerifier::reduce_verification(multilinear_evaluation_point,
                                                RefVector(instance_witness.unshifted_evals),
                                                RefVector(instance_witness.shifted_evals),
                                                RefVector(instance_witness.unshifted_commitments),
                                                RefVector(instance_witness.to_be_shifted_commitments),
                                                verifier_transcript);

        // Check equality of the opening pairs computed by prover and verifier
        for (auto [prover_claim, verifier_claim] : zip_view(prover_output, verifier_claims)) {
            this->verify_opening_claim(verifier_claim, prover_claim.polynomial);
            ASSERT_EQ(prover_claim.opening_pair, verifier_claim.opening_pair);
        }
    }

    void execute_gemini_and_verify_claims_with_concatenation(
        std::vector<Fr>& multilinear_evaluation_point,
        InstanceWitnessGenerator<Curve> instance_witness,
        RefSpan<Polynomial<Fr>> concatenated_polynomials = {},
        RefSpan<Fr> concatenated_evaluations = {},
        const std::vector<RefVector<Polynomial<Fr>>>& groups_to_be_concatenated = {},
        const std::vector<RefVector<Commitment>>& concatenation_group_commitments = {})

    {
        auto prover_transcript = NativeTranscript::prover_init_empty();

        // Compute:
        // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
        // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
        auto prover_output = GeminiProver::prove(this->n,
                                                 RefVector(instance_witness.unshifted_polynomials),
                                                 RefVector(instance_witness.to_be_shifted_polynomials),
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
        auto verifier_claims =
            GeminiVerifier::reduce_verification(multilinear_evaluation_point,
                                                RefVector(instance_witness.unshifted_evals),
                                                RefVector(instance_witness.shifted_evals),
                                                RefVector(instance_witness.unshifted_commitments),
                                                RefVector(instance_witness.to_be_shifted_commitments),
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
    auto u = this->random_evaluation_point(this->log_n);
    auto instance_witness = InstanceWitnessGenerator(this->n, 1, 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, instance_witness);
}

TYPED_TEST(GeminiTest, SingleShift)
{
    auto u = this->random_evaluation_point(this->log_n);

    auto instance_witness = InstanceWitnessGenerator(this->n, 0, 1, u, this->ck);

    this->execute_gemini_and_verify_claims(u, instance_witness);
}

TYPED_TEST(GeminiTest, Double)
{

    auto u = this->random_evaluation_point(this->log_n);

    auto instance_witness = InstanceWitnessGenerator(this->n, 2, 0, u, this->ck);

    this->execute_gemini_and_verify_claims(u, instance_witness);
}

TYPED_TEST(GeminiTest, DoubleWithShift)
{

    auto u = this->random_evaluation_point(this->log_n);

    auto instance_witness = InstanceWitnessGenerator(this->n, 2, 1, u, this->ck);

    this->execute_gemini_and_verify_claims(u, instance_witness);
}

TYPED_TEST(GeminiTest, DoubleWithShiftAndConcatenation)
{
    auto u = this->random_evaluation_point(this->log_n);

    auto instance_witness = InstanceWitnessGenerator(this->n, 2, 0, u, this->ck);

    auto [concatenation_groups, concatenated_polynomials, c_evaluations, concatenation_groups_commitments] =
        generate_concatenation_inputs<TypeParam>(u, /*mun_concatenated=*/3, /*concatenation_index=*/2, this->ck);

    this->execute_gemini_and_verify_claims_with_concatenation(
        u,
        instance_witness,
        RefVector(concatenated_polynomials),
        RefVector(c_evaluations),
        to_vector_of_ref_vectors(concatenation_groups),
        to_vector_of_ref_vectors(concatenation_groups_commitments));
}
template <class Curve> std::shared_ptr<typename GeminiTest<Curve>::CK> GeminiTest<Curve>::ck = nullptr;

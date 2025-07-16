
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
using namespace bb;

namespace {
using Curve = curve::Grumpkin;

class IPATest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename Curve::AffineElement;

    using ShplonkProver = ShplonkProver_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    static CK ck;
    static VK vk;

    // For edge cases
    static constexpr size_t log_n = 7;

    using PCS = IPA<curve::Grumpkin, log_n>;

    static constexpr size_t n = 1UL << log_n;

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(n);
        vk = create_verifier_commitment_key<VK>();
    }
};
} // namespace

#define IPA_TEST
#include "ipa.hpp"

TEST_F(IPATest, CommitOnManyZeroCoeffPolyWorks)
{
    constexpr size_t n = 4;
    Polynomial p(n);
    for (size_t i = 0; i < n - 1; i++) {
        p.at(i) = Fr::zero();
    }
    p.at(3) = Fr::one();
    GroupElement commitment = ck.commit(p);
    auto srs_elements = ck.srs->get_monomial_points();
    GroupElement expected = srs_elements[0] * p[0];
    // The SRS stored in the commitment key is the result after applying the pippenger point table so the
    // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
    // G_vec_local should use only the original SRS thus we extract only the even indices.
    for (size_t i = 1; i < n; i += 1) {
        expected += srs_elements[i] * p[i];
    }
    EXPECT_EQ(expected.normalize(), commitment.normalize());
}

// This test checks that we can correctly open a zero polynomial. Since we often have point at infinity troubles, it
// detects those.
TEST_F(IPATest, OpenZeroPolynomial)
{
    Polynomial poly(n);
    // Commit to a zero polynomial
    Commitment commitment = ck.commit(poly);
    EXPECT_TRUE(commitment.is_point_at_infinity());

    auto [x, eval] = this->random_eval(poly);
    EXPECT_EQ(eval, Fr::zero());
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    verifier_transcript->load_proof(prover_transcript->export_proof());

    bool result = PCS::reduce_verify(vk, opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}

// This test makes sure that even if the whole vector \vec{b} generated from the x, at which we open the polynomial,
// is zero, IPA behaves
TEST_F(IPATest, OpenAtZero)
{
    // generate a random polynomial, degree needs to be a power of two
    auto poly = Polynomial::random(n);
    const Fr x = Fr::zero();
    const Fr eval = poly.evaluate(x);
    const Commitment commitment = ck.commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    verifier_transcript->load_proof(prover_transcript->export_proof());

    bool result = PCS::reduce_verify(vk, opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}

namespace bb {
#if !defined(__wasm__)
// This test ensures that IPA throws or aborts when a challenge is zero, since it breaks the logic of the argument
TEST_F(IPATest, ChallengesAreZero)
{
    // generate a random polynomial, degree needs to be a power of two
    auto poly = Polynomial::random(n);
    auto [x, eval] = this->random_eval(poly);
    auto commitment = ck.commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize an empty mock transcript
    auto transcript = std::make_shared<MockTranscript>();
    const size_t num_challenges = numeric::get_msb(n) + 1;
    std::vector<uint256_t> random_vector(num_challenges);

    // Generate a random element vector with challenges
    for (size_t i = 0; i < num_challenges; i++) {
        random_vector[i] = Fr::random_element();
    }

    // Compute opening proofs several times, where each time a different challenge is equal to zero. Should cause
    // exceptions
    for (size_t i = 0; i < num_challenges; i++) {
        auto new_random_vector = random_vector;
        new_random_vector[i] = Fr::zero();
        transcript->initialize(new_random_vector);
        EXPECT_ANY_THROW(PCS::compute_opening_proof_internal(ck, { poly, opening_pair }, transcript));
    }
    // Fill out a vector of affine elements that the verifier receives from the prover with generators (we don't care
    // about them right now)
    std::vector<Curve::AffineElement> lrs(num_challenges * 2);
    for (size_t i = 0; i < num_challenges * 2; i++) {
        lrs[i] = Curve::AffineElement::one();
    }
    // Verify proofs several times, where each time a different challenge is equal to zero. Should cause
    // exceptions
    for (size_t i = 0; i < num_challenges; i++) {
        auto new_random_vector = random_vector;
        new_random_vector[i] = Fr::zero();
        transcript->initialize(new_random_vector, lrs, { uint256_t(n) });
        EXPECT_ANY_THROW(PCS::reduce_verify_internal_native(vk, opening_claim, transcript));
    }
}

// This test checks that if the vector \vec{a_new} becomes zero after one round, it doesn't break IPA.
TEST_F(IPATest, AIsZeroAfterOneRound)
{
    // generate a random polynomial of degree < n / 2
    auto poly = Polynomial(n);
    for (size_t i = 0; i < n / 2; i++) {
        poly.at(i) = Fr::random_element();
        poly.at(i + (n / 2)) = poly[i];
    }
    auto [x, eval] = this->random_eval(poly);
    auto commitment = ck.commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize an empty mock transcript
    auto transcript = std::make_shared<MockTranscript>();
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1159): Decouple constant from IPA.
    const size_t num_challenges = log_n + 1;
    std::vector<uint256_t> random_vector(num_challenges);

    // Generate a random element vector with challenges
    for (size_t i = 0; i < num_challenges; i++) {
        random_vector[i] = Fr::random_element();
    }
    // Substitute the first folding challenge with -1
    random_vector[1] = -Fr::one();

    // Put the challenges in the transcript
    transcript->initialize(random_vector);

    // Compute opening proof
    PCS::compute_opening_proof_internal(ck, { poly, opening_pair }, transcript);

    // Reset indices
    transcript->reset_indices();

    // Verify
    EXPECT_TRUE(PCS::reduce_verify_internal_native(vk, opening_claim, transcript));
}
#endif
} // namespace bb

TEST_F(IPATest, Commit)
{
    auto poly = Polynomial::random(n);
    const GroupElement commitment = ck.commit(poly);
    auto srs_elements = ck.srs->get_monomial_points();
    GroupElement expected = srs_elements[0] * poly[0];
    // The SRS stored in the commitment key is the result after applying the pippenger point table so the
    // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
    // G_vec_local should use only the original SRS thus we extract only the even indices.
    for (size_t i = 1; i < n; i += 1) {
        expected += srs_elements[i] * poly[i];
    }
    EXPECT_EQ(expected.normalize(), commitment.normalize());
}

TEST_F(IPATest, Open)
{
    // generate a random polynomial, degree needs to be a power of two
    auto poly = Polynomial::random(n);
    auto [x, eval] = this->random_eval(poly);
    auto commitment = ck.commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>();
    verifier_transcript->load_proof(prover_transcript->export_proof());

    auto result = PCS::reduce_verify(vk, opening_claim, verifier_transcript);
    EXPECT_TRUE(result);

    EXPECT_EQ(prover_transcript->get_manifest(), verifier_transcript->get_manifest());
}

TEST_F(IPATest, GeminiShplonkIPAWithShift)
{
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'

    MockClaimGenerator mock_claims(n,
                                   /*num_polynomials*/ 2,
                                   /*num_to_be_shifted*/ 0,
                                   /*num_to_be_right_shifted_by_k*/ 0,
                                   mle_opening_point,
                                   ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:
    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims =
        GeminiProver::prove(n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript);

    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    auto gemini_verifier_claim =
        GeminiVerifier::reduce_verification(mle_opening_point, mock_claims.claim_batcher, verifier_transcript);

    const auto shplonk_verifier_claim =
        ShplonkVerifier::reduce_verification(vk.get_g1_identity(), gemini_verifier_claim, verifier_transcript);
    auto result = PCS::reduce_verify(vk, shplonk_verifier_claim, verifier_transcript);

    EXPECT_EQ(result, true);
}
TEST_F(IPATest, ShpleminiIPAWithShift)
{
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    MockClaimGenerator mock_claims(n,
                                   /*num_polynomials*/ 2,
                                   /*num_to_be_shifted*/ 0,
                                   /*num_to_be_right_shifted_by_k*/ 0,
                                   mle_opening_point,
                                   ck);
    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims =
        GeminiProver::prove(n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript);
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    std::array<Fr, log_n> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    vk.get_g1_identity(),
                                                                                    verifier_transcript);

    auto result = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, vk, verifier_transcript);
    // auto result = PCS::reduce_verify(vk, shplonk_verifier_claim, verifier_transcript);

    EXPECT_EQ(result, true);
}
/**
 * @brief Test the behaviour of the method ShpleminiVerifier::remove_shifted_commitments
 *
 */
TEST_F(IPATest, ShpleminiIPAShiftsRemoval)
{
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    MockClaimGenerator mock_claims(n,
                                   /*num_polynomials*/ 4,
                                   /*num_to_be_shifted*/ 2,
                                   /*num_to_be_right_shifted_by_k*/ 0,
                                   mle_opening_point,
                                   ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims =
        GeminiProver::prove(n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript);

    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    // the index of the first commitment to a polynomial to be shifted in the union of unshifted_commitments and
    // shifted_commitments. in our case, it is poly2
    const size_t to_be_shifted_commitments_start = 2;
    // the index of the first commitment to a shifted polynomial in the union of unshifted_commitments and
    // shifted_commitments. in our case, it is the second occurence of poly2
    const size_t shifted_commitments_start = 4;
    // number of shifted polynomials
    const size_t num_shifted_commitments = 2;
    const RepeatedCommitmentsData repeated_commitments =
        RepeatedCommitmentsData(to_be_shifted_commitments_start, shifted_commitments_start, num_shifted_commitments);
    // since commitments to poly2, poly3 and their shifts are the same group elements, we simply combine the scalar
    // multipliers of commitment2 and commitment3 in one place and remove the entries of the commitments and scalars
    // vectors corresponding to the "shifted" commitment
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    std::array<Fr, log_n> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    vk.get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    repeated_commitments);

    auto result = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, vk, verifier_transcript);
    EXPECT_EQ(result, true);
}
typename IPATest::CK IPATest::ck;
typename IPATest::VK IPATest::vk;

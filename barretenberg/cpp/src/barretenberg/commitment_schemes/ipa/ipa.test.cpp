
#include "../gemini/gemini.hpp"
#include "../shplonk/shplemini.hpp"
#include "../shplonk/shplonk.hpp"
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/ecc/curves/bn254/fq12.hpp"
#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
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
    GroupElement commitment = this->commit(p);
    auto srs_elements = this->ck()->srs->get_monomial_points();
    GroupElement expected = srs_elements[0] * p[0];
    // The SRS stored in the commitment key is the result after applying the pippenger point table so the
    // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
    // G_vec_local should use only the original SRS thus we extract only the even indices.
    for (size_t i = 2; i < 2 * n; i += 2) {
        expected += srs_elements[i] * p[i >> 1];
    }
    EXPECT_EQ(expected.normalize(), commitment.normalize());
}

// This test checks that we can correctly open a zero polynomial. Since we often have point at infinity troubles, it
// detects those.
TEST_F(IPATest, OpenZeroPolynomial)
{
    using IPA = IPA<Curve>;
    constexpr size_t n = 4;
    Polynomial poly(n);
    // Commit to a zero polynomial
    GroupElement commitment = this->commit(poly);
    EXPECT_TRUE(commitment.is_point_at_infinity());

    auto [x, eval] = this->random_eval(poly);
    EXPECT_EQ(eval, Fr::zero());
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    IPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

    auto result = IPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}

// This test makes sure that even if the whole vector \vec{b} generated from the x, at which we open the polynomial,
// is zero, IPA behaves
TEST_F(IPATest, OpenAtZero)
{
    using IPA = IPA<Curve>;
    // generate a random polynomial, degree needs to be a power of two
    size_t n = 128;
    auto poly = Polynomial::random(n);
    Fr x = Fr::zero();
    auto eval = poly.evaluate(x);
    auto commitment = this->commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    IPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

    auto result = IPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}

namespace bb {
#if !defined(__wasm__)
// This test ensures that IPA throws or aborts when a challenge is zero, since it breaks the logic of the argument
TEST_F(IPATest, ChallengesAreZero)
{
    using IPA = IPA<Curve>;
    // generate a random polynomial, degree needs to be a power of two
    size_t n = 128;
    auto poly = Polynomial::random(n);
    auto [x, eval] = this->random_eval(poly);
    auto commitment = this->commit(poly);
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
        EXPECT_ANY_THROW(IPA::compute_opening_proof_internal(this->ck(), { poly, opening_pair }, transcript));
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
        EXPECT_ANY_THROW(IPA::reduce_verify_internal(this->vk(), opening_claim, transcript));
    }
}

// This test checks that if the vector \vec{a_new} becomes zero after one round, it doesn't break IPA.
TEST_F(IPATest, AIsZeroAfterOneRound)
{
    using IPA = IPA<Curve>;
    // generate a random polynomial, degree needs to be a power of two
    size_t n = 4;
    auto poly = Polynomial(n);
    for (size_t i = 0; i < n / 2; i++) {
        poly.at(i) = Fr::random_element();
        poly.at(i + (n / 2)) = poly[i];
    }
    auto [x, eval] = this->random_eval(poly);
    auto commitment = this->commit(poly);
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
    // Substitute the first folding challenge with -1
    random_vector[1] = -Fr::one();

    // Put the challenges in the transcript
    transcript->initialize(random_vector);

    // Compute opening proof
    IPA::compute_opening_proof_internal(this->ck(), { poly, opening_pair }, transcript);

    // Reset indices
    transcript->reset_indices();

    // Verify
    EXPECT_TRUE(IPA::reduce_verify_internal(this->vk(), opening_claim, transcript));
}
#endif
} // namespace bb

TEST_F(IPATest, Commit)
{
    constexpr size_t n = 128;
    auto poly = Polynomial::random(n);
    GroupElement commitment = this->commit(poly);
    auto srs_elements = this->ck()->srs->get_monomial_points();
    GroupElement expected = srs_elements[0] * poly[0];
    // The SRS stored in the commitment key is the result after applying the pippenger point table so the
    // values at odd indices contain the point {srs[i-1].x * beta, srs[i-1].y}, where beta is the endomorphism
    // G_vec_local should use only the original SRS thus we extract only the even indices.
    for (size_t i = 2; i < 2 * n; i += 2) {
        expected += srs_elements[i] * poly[i >> 1];
    }
    EXPECT_EQ(expected.normalize(), commitment.normalize());
}

TEST_F(IPATest, Open)
{
    using IPA = IPA<Curve>;
    // generate a random polynomial, degree needs to be a power of two
    size_t n = 128;
    auto poly = Polynomial::random(n);
    auto [x, eval] = this->random_eval(poly);
    auto commitment = this->commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // initialize empty prover transcript
    auto prover_transcript = std::make_shared<NativeTranscript>();
    IPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

    // initialize verifier transcript from proof data
    auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

    auto result = IPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
    EXPECT_TRUE(result);

    EXPECT_EQ(prover_transcript->get_manifest(), verifier_transcript->get_manifest());
}

TEST_F(IPATest, GeminiShplonkIPAWithShift)
{
    using IPA = IPA<Curve>;
    using ShplonkProver = ShplonkProver_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;

    const size_t n = 8;
    const size_t log_n = 3;

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, /*shiftable*/ 1);

    GroupElement commitment1 = this->commit(poly1);
    GroupElement commitment2 = this->commit(poly2);

    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval2_shift };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(
        n, RefArray{ poly1, poly2 }, RefArray{ poly2 }, mle_opening_point, this->ck(), prover_transcript);

    const auto opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    auto gemini_verifier_claim = GeminiVerifier::reduce_verification(mle_opening_point,
                                                                     multilinear_evaluations,
                                                                     RefArray{ commitment1, commitment2 },
                                                                     RefArray{ commitment2 },
                                                                     verifier_transcript);

    const auto shplonk_verifier_claim =
        ShplonkVerifier::reduce_verification(this->vk()->get_g1_identity(), gemini_verifier_claim, verifier_transcript);
    auto result = IPA::reduce_verify(this->vk(), shplonk_verifier_claim, verifier_transcript);

    EXPECT_EQ(result, true);
}
TEST_F(IPATest, ShpleminiIPAWithShift)
{
    using IPA = IPA<Curve>;
    using ShplonkProver = ShplonkProver_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;

    const size_t n = 8;
    const size_t log_n = 3;

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, /*shiftable*/ 1);
    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    std::vector<Commitment> unshifted_commitments = { commitment1, commitment2 };
    std::vector<Commitment> shifted_commitments = { commitment2 };
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(
        n, RefArray{ poly1, poly2 }, RefArray{ poly2 }, mle_opening_point, this->ck(), prover_transcript);

    const auto opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    IPA::compute_opening_proof(this->ck(), opening_claim, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(n,
                                                                                    RefVector(unshifted_commitments),
                                                                                    RefVector(shifted_commitments),
                                                                                    RefArray{ eval1, eval2 },
                                                                                    RefArray{ eval2_shift },
                                                                                    mle_opening_point,
                                                                                    this->vk()->get_g1_identity(),
                                                                                    verifier_transcript);

    auto result = IPA::reduce_verify_batch_opening_claim(batch_opening_claim, this->vk(), verifier_transcript);
    // auto result = IPA::reduce_verify(this->vk(), shplonk_verifier_claim, verifier_transcript);

    EXPECT_EQ(result, true);
}

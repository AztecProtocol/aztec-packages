
#include "kzg.hpp"
#include "../gemini/gemini.hpp"
#include "../shplonk/shplemini_verifier.hpp"
#include "../shplonk/shplonk.hpp"

#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"

#include "barretenberg/ecc/curves/bn254/g1.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace bb {

template <class Curve> class KZGTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;
};

TYPED_TEST_SUITE(KZGTest, CommitmentSchemeParams);

TYPED_TEST(KZGTest, single)
{
    const size_t n = 16;

    using KZG = KZG<TypeParam>;
    using Fr = typename TypeParam::ScalarField;

    auto witness = Polynomial<Fr>::random(n);
    g1::element commitment = this->commit(witness);

    auto challenge = Fr::random_element();
    auto evaluation = witness.evaluate(challenge);
    auto opening_pair = OpeningPair<TypeParam>{ challenge, evaluation };
    auto opening_claim = OpeningClaim<TypeParam>{ opening_pair, commitment };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    KZG::compute_opening_proof(this->ck(), { witness, opening_pair }, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    auto pairing_points = KZG::reduce_verify(opening_claim, verifier_transcript);

    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}

/**
 * @brief Test full PCS protocol: Gemini, Shplonk, KZG and pairing check
 * @details Demonstrates the full PCS protocol as it is used in the construction and verification
 * of a single Honk proof. (Expository comments included throughout).
 *
 */
TYPED_TEST(KZGTest, GeminiShplonkKzgWithShift)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using GeminiProver = GeminiProver_<TypeParam>;
    using GeminiVerifier = GeminiVerifier_<TypeParam>;
    using KZG = KZG<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using GroupElement = typename TypeParam::Element;
    using Polynomial = typename bb::Polynomial<Fr>;

    const size_t n = 16;
    const size_t log_n = 4;

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, 1); // make 'shiftable'

    GroupElement commitment1 = this->commit(poly1);
    GroupElement commitment2 = this->commit(poly2);

    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations for input to prover
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval2_shift };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(this->ck(),
                                                     mle_opening_point,
                                                     multilinear_evaluations,
                                                     RefArray{ poly1, poly2 },
                                                     RefArray{ poly2 },
                                                     prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(this->ck(), opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    auto gemini_verifier_claim = GeminiVerifier::reduce_verification(mle_opening_point,
                                                                     multilinear_evaluations,
                                                                     RefArray{ commitment1, commitment2 },
                                                                     RefArray{ commitment2 },
                                                                     verifier_transcript);

    // Shplonk verifier claim: commitment [Q] - [Q_z], opening point (z_challenge, 0)
    const auto shplonk_verifier_claim =
        ShplonkVerifier::reduce_verification(this->vk()->get_g1_identity(), gemini_verifier_claim, verifier_transcript);

    // KZG verifier:
    // aggregates inputs [Q] - [Q_z] and [W] into an 'accumulator' (can perform pairing check on result)
    auto pairing_points = KZG::reduce_verify(shplonk_verifier_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}

TYPED_TEST(KZGTest, ShpleminiKzgWithShift)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using GeminiProver = GeminiProver_<TypeParam>;
    using ShpleminiVerifier = ShpleminiVerifier_<TypeParam>;
    using KZG = KZG<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;

    const size_t n = 16;
    const size_t log_n = 4;
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

    // Collect multilinear evaluations for input to prover
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval2_shift };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(this->ck(),
                                                     mle_opening_point,
                                                     multilinear_evaluations,
                                                     RefArray{ poly1, poly2 },
                                                     RefArray{ poly2 },
                                                     prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(this->ck(), opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(log_n,
                                                                                    RefVector(unshifted_commitments),
                                                                                    RefVector(shifted_commitments),
                                                                                    RefVector(multilinear_evaluations),
                                                                                    mle_opening_point,
                                                                                    this->vk()->get_g1_identity(),
                                                                                    verifier_transcript);
    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}

} // namespace bb

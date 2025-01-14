
#include "kzg.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/test_utils.hpp"

namespace bb {

template <class Curve> class KZGTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
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
 * @brief Test opening proof of a polynomial given by its evaluations at \f$ i = 0, \ldots, n \f$. Should only be used
 * for small values of \f$ n \f$.
 *
 */
TYPED_TEST(KZGTest, SingleInLagrangeBasis)
{
    const size_t n = 4;

    using KZG = KZG<TypeParam>;
    using Fr = typename TypeParam::ScalarField;

    // create a random univariate (coefficients are in Lagrange basis)
    auto witness = bb::Univariate<Fr, n>::get_random();
    // define the interpolation domain
    std::array<Fr, 4> eval_points = { Fr(0), Fr(1), Fr(2), Fr(3) };
    // compute the monomial coefficients
    Polynomial<Fr> witness_polynomial(std::span<Fr>(eval_points), std::span<Fr>(witness), n);
    // commit to the polynomial in the monomial form
    g1::element commitment = this->commit(witness_polynomial);

    auto challenge = Fr::random_element();
    // evaluate the original univariate
    auto evaluation = witness.evaluate(challenge);
    auto opening_pair = OpeningPair<TypeParam>{ challenge, evaluation };
    auto opening_claim = OpeningClaim<TypeParam>{ opening_pair, commitment };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    KZG::compute_opening_proof(this->ck(), { witness_polynomial, opening_pair }, prover_transcript);

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
    using Commitment = typename TypeParam::AffineElement;
    using Polynomial = typename bb::Polynomial<Fr>;

    const size_t n = 16;
    const size_t log_n = 4;

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    auto mle_opening_point = this->random_evaluation_point(log_n); // sometimes denoted 'u'
    auto poly1 = Polynomial::random(n);
    auto poly2 = Polynomial::random(n, 1); // make 'shiftable'

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);

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
    auto prover_opening_claims = GeminiProver::prove(
        n, RefArray{ poly1, poly2 }, RefArray{ poly2 }, mle_opening_point, this->ck(), prover_transcript);

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
                                                                     RefArray{ eval1, eval2 },
                                                                     RefArray{ eval2_shift },
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
    auto poly1 = Polynomial::random(n, 1);
    auto poly2 = Polynomial::random(n);
    auto poly3 = Polynomial::random(n, 1);
    auto poly4 = Polynomial::random(n);

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    Commitment commitment3 = this->commit(poly3);
    Commitment commitment4 = this->commit(poly4);
    std::vector<Commitment> unshifted_commitments = { commitment1, commitment2, commitment3, commitment4 };
    std::vector<Commitment> shifted_commitments = { commitment1, commitment3 };
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval3 = poly3.evaluate_mle(mle_opening_point);
    auto eval4 = poly4.evaluate_mle(mle_opening_point);
    auto eval1_shift = poly1.evaluate_mle(mle_opening_point, true);
    auto eval3_shift = poly3.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations for input to prover
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval1_shift, eval3_shift };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(n,
                                                     RefArray{ poly1, poly2, poly3, poly4 },
                                                     RefArray{ poly1, poly3 },
                                                     mle_opening_point,
                                                     this->ck(),
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
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(unshifted_commitments),
                                                       RefVector(shifted_commitments),
                                                       RefArray{ eval1, eval2, eval3, eval4 },
                                                       RefArray{ eval1_shift, eval3_shift },
                                                       mle_opening_point,
                                                       this->vk()->get_g1_identity(),
                                                       verifier_transcript);
    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}

TYPED_TEST(KZGTest, ShpleminiKzgWithShiftAndConcatenation)
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
    auto poly1 = Polynomial::random(n, 1);
    auto poly2 = Polynomial::random(n);
    auto poly3 = Polynomial::random(n, 1);
    auto poly4 = Polynomial::random(n);

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    Commitment commitment3 = this->commit(poly3);
    Commitment commitment4 = this->commit(poly4);
    std::vector<Commitment> unshifted_commitments = { commitment1, commitment2, commitment3, commitment4 };
    std::vector<Commitment> shifted_commitments = { commitment1, commitment3 };
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval3 = poly3.evaluate_mle(mle_opening_point);
    auto eval4 = poly4.evaluate_mle(mle_opening_point);
    auto eval1_shift = poly1.evaluate_mle(mle_opening_point, true);
    auto eval3_shift = poly3.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations for input to prover
    std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval1_shift, eval3_shift };

    auto [concatenation_groups, concatenated_polynomials, c_evaluations, concatenation_groups_commitments] =
        generate_concatenation_inputs<TypeParam>(
            mle_opening_point, /*num_concatenated=*/3, /*concatenation_index=*/2, this->ck());

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(n,
                                                     RefArray{ poly1, poly2, poly3, poly4 },
                                                     RefArray{ poly1, poly3 },
                                                     mle_opening_point,
                                                     this->ck(),
                                                     prover_transcript,
                                                     RefVector(concatenated_polynomials),
                                                     to_vector_of_ref_vectors(concatenation_groups));

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
    bool consistency_checked = true;
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(unshifted_commitments),
                                                       RefVector(shifted_commitments),
                                                       RefArray{ eval1, eval2, eval3, eval4 },
                                                       RefArray{ eval1_shift, eval3_shift },
                                                       mle_opening_point,
                                                       this->vk()->get_g1_identity(),
                                                       verifier_transcript,
                                                       /* repeated commitments= */ {},
                                                       /* has zk = */ {},
                                                       &consistency_checked,
                                                       /* libra commitments = */ {},
                                                       /* libra evaluations = */ {},
                                                       {},
                                                       {},
                                                       to_vector_of_ref_vectors(concatenation_groups_commitments),
                                                       RefVector(c_evaluations));
    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}
TYPED_TEST(KZGTest, ShpleminiKzgShiftsRemoval)
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
    auto poly2 = Polynomial::random(n, 1);
    auto poly3 = Polynomial::random(n, 1);
    auto poly4 = Polynomial::random(n);

    Commitment commitment1 = this->commit(poly1);
    Commitment commitment2 = this->commit(poly2);
    Commitment commitment3 = this->commit(poly3);
    Commitment commitment4 = this->commit(poly4);
    std::vector<Commitment> unshifted_commitments = { commitment1, commitment2, commitment3, commitment4 };
    std::vector<Commitment> shifted_commitments = { commitment2, commitment3 };
    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval3 = poly3.evaluate_mle(mle_opening_point);
    auto eval4 = poly4.evaluate_mle(mle_opening_point);
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);
    auto eval3_shift = poly3.evaluate_mle(mle_opening_point, true);

    // Collect multilinear evaluations for input to prover
    // std::vector<Fr> multilinear_evaluations = { eval1, eval2, eval3, eval4, eval2_shift, eval3_shift };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(n,
                                                     RefArray{ poly1, poly2, poly3, poly4 },
                                                     RefArray{ poly2, poly3 },
                                                     mle_opening_point,
                                                     this->ck(),
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
    // the index of the first commitment to a polynomial to be shifted in the union of unshifted_commitments and
    // shifted_commitments. in our case, it is poly2
    const size_t to_be_shifted_commitments_start = 1;
    // the index of the first commitment to a shifted polynomial in the union of unshifted_commitments and
    // shifted_commitments. in our case, it is the second occurence of poly2
    const size_t shifted_commitments_start = 4;
    // number of shifted polynomials
    const size_t num_shifted_commitments = 2;
    // since commitments to poly2, poly3 and their shifts are the same group elements, we simply combine the scalar
    // multipliers of commitment2 and commitment3 in one place and remove the entries of the commitments and scalars
    // vectors corresponding to the "shifted" commitment
    const RepeatedCommitmentsData repeated_commitments =
        RepeatedCommitmentsData(to_be_shifted_commitments_start, shifted_commitments_start, num_shifted_commitments);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(unshifted_commitments),
                                                       RefVector(shifted_commitments),
                                                       RefArray{ eval1, eval2, eval3, eval4 },
                                                       RefArray{ eval2_shift, eval3_shift },
                                                       mle_opening_point,
                                                       this->vk()->get_g1_identity(),
                                                       verifier_transcript,
                                                       repeated_commitments);

    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
    EXPECT_EQ(this->vk()->pairing_check(pairing_points[0], pairing_points[1]), true);
}

} // namespace bb

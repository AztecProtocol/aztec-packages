
#include "kzg.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"

namespace bb {
using Curve = curve::BN254;

class KZGTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = KZG<curve::BN254>;

    using ShplonkProver = ShplonkProver_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;

    static constexpr size_t n = 16;
    static constexpr size_t log_n = 4;

    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    static CK ck;
    static VK vk;

    static constexpr Commitment g1_identity = Commitment::one();

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(n);
        vk = create_verifier_commitment_key<VK>();
    }

    static void prove_and_verify(const OpeningPair<Curve>& opening_pair, bb::Polynomial<Fr>& witness)
    {
        const Commitment commitment = ck.commit(witness);

        auto opening_claim = OpeningClaim<Curve>{ opening_pair, commitment };

        auto prover_transcript = NativeTranscript::prover_init_empty();

        PCS::compute_opening_proof(ck, { witness, opening_pair }, prover_transcript);

        auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
        const auto pairing_points = PCS::reduce_verify(opening_claim, verifier_transcript);

        EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
    }
};

TEST_F(KZGTest, Single)
{

    auto witness = bb::Polynomial<Fr>::random(n);
    const Fr challenge = Fr::random_element();
    const Fr evaluation = witness.evaluate(challenge);

    prove_and_verify({ challenge, evaluation }, witness);
}

TEST_F(KZGTest, ZeroEvaluation)
{

    auto witness = bb::Polynomial<Fr>::random(n);
    const Fr challenge = Fr::random_element();
    const Fr evaluation = witness.evaluate(challenge);

    // Modify witness to achieve zero evaluation
    witness.at(0) -= evaluation;

    prove_and_verify({ challenge, Fr::zero() }, witness);
}

TEST_F(KZGTest, ZeroPolynomial)
{
    static constexpr size_t POLY_SIZE = 10;
    bb::Polynomial<Fr> zero(POLY_SIZE);
    for (size_t idx = 0; idx < POLY_SIZE; ++idx) {
        zero.at(idx) = 0;
    }

    // Sanity check
    ASSERT_TRUE(zero.is_zero());

    const Fr challenge = Fr::random_element();
    const Fr evaluation = zero.evaluate(challenge);

    prove_and_verify({ challenge, evaluation }, zero);
}

TEST_F(KZGTest, ConstantPolynomial)
{
    auto constant = bb::Polynomial<Fr>::random(1);
    const Fr challenge = Fr::random_element();
    const Fr evaluation = constant.evaluate(challenge);

    prove_and_verify({ challenge, evaluation }, constant);
}

TEST_F(KZGTest, EmptyPolynomial)
{
    bb::Polynomial<Fr> empty_poly;
    const Fr challenge = Fr::random_element();
    const Fr evaluation = empty_poly.evaluate(challenge);

    prove_and_verify({ challenge, evaluation }, empty_poly);
}

/**
 * @brief Test opening proof of a polynomial given by its evaluations at \f$ i = 0, \ldots, n \f$. Should only be used
 * for small values of \f$ n \f$.
 *
 */
TEST_F(KZGTest, SingleInLagrangeBasis)
{
    const size_t n = 4;

    // create a random univariate (coefficients are in Lagrange basis)
    auto witness = bb::Univariate<Fr, n>::get_random();
    // define the interpolation domain
    std::array<Fr, 4> eval_points = { Fr(0), Fr(1), Fr(2), Fr(3) };
    // compute the monomial coefficients
    bb::Polynomial<Fr> witness_polynomial(std::span<Fr>(eval_points), std::span<Fr>(witness), n);
    // commit to the polynomial in the monomial form
    g1::element commitment = ck.commit(witness_polynomial);

    const Fr challenge = Fr::random_element();
    // evaluate the original univariate
    const Fr evaluation = witness.evaluate(challenge);
    auto opening_pair = OpeningPair<Curve>{ challenge, evaluation };
    auto opening_claim = OpeningClaim<Curve>{ opening_pair, commitment };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    PCS::compute_opening_proof(ck, { witness_polynomial, opening_pair }, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    auto pairing_points = PCS::reduce_verify(opening_claim, verifier_transcript);

    EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
}
/**
 * @brief Test full PCS protocol: Gemini, Shplonk, KZG and pairing check
 * @details Demonstrates the full PCS protocol as it is used in the construction and verification
 * of a single Honk proof. (Expository comments included throughout).
 *
 */
TEST_F(KZGTest, GeminiShplonkKzgWithShift)
{

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

    MockClaimGenerator mock_claims(n,
                                   /*num_polynomials*/ 2,
                                   /*num_to_be_shifted*/ 1,
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

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    auto gemini_verifier_claim =
        GeminiVerifier::reduce_verification(mle_opening_point, mock_claims.claim_batcher, verifier_transcript);

    // Shplonk verifier claim: commitment [Q] - [Q_z], opening point (z_challenge, 0)
    const auto shplonk_verifier_claim =
        ShplonkVerifier::reduce_verification(vk.get_g1_identity(), gemini_verifier_claim, verifier_transcript);

    // KZG verifier:
    // aggregates inputs [Q] - [Q_z] and [W] into an 'accumulator' (can perform pairing check on result)
    auto pairing_points = PCS::reduce_verify(shplonk_verifier_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
}

TEST_F(KZGTest, ShpleminiKzgWithShift)
{
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

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

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    std::array<Fr, log_n> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    vk.get_g1_identity(),
                                                                                    verifier_transcript);

    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
}

TEST_F(KZGTest, ShpleminiKzgWithShiftAndInterleaving)
{
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
    MockClaimGenerator mock_claims(n,
                                   /*num_polynomials*/ 4,
                                   /*num_to_be_shifted*/ 2,
                                   /*num_to_be_right_shifted_by_k*/ 0,
                                   mle_opening_point,
                                   ck,
                                   3,
                                   2);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims =
        GeminiProver::prove(n, mock_claims.polynomial_batcher, mle_opening_point, ck, prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    std::array<Fr, log_n> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    vk.get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    /* repeated commitments= */ {},
                                                                                    /* has zk = */ {},
                                                                                    nullptr,
                                                                                    /* libra commitments = */ {},
                                                                                    /* libra evaluations = */ {},
                                                                                    {},
                                                                                    {});
    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
}
TEST_F(KZGTest, ShpleminiKzgShiftsRemoval)
{
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a random
    // point.
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

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    PCS::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    // the index of the first commitment to a polynomial to be shifted in the union of unshifted_commitments and
    // shifted_commitments. in our case, it is poly2
    const size_t to_be_shifted_commitments_start = 2;
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
    std::array<Fr, log_n> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, Fr{ 1 });

    const auto batch_opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                    mock_claims.claim_batcher,
                                                                                    mle_opening_point,
                                                                                    vk.get_g1_identity(),
                                                                                    verifier_transcript,
                                                                                    repeated_commitments);

    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
    EXPECT_EQ(vk.pairing_check(pairing_points[0], pairing_points[1]), true);
}

} // namespace bb
typename bb::KZGTest::CK bb::KZGTest::ck;
typename bb::KZGTest::VK bb::KZGTest::vk;

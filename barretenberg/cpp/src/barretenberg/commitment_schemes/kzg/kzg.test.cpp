
#include "kzg.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/utils/instance_witness_generator.hpp"
#include "barretenberg/commitment_schemes/utils/test_utils.hpp"

namespace bb {
using Curve = curve::BN254;

class KZGTest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using KZG = KZG<Curve>;

    using ShplonkProver = ShplonkProver_<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;

    static constexpr size_t n = 16;
    static constexpr size_t log_n = 4;

    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    static std::shared_ptr<CK> ck;
    static std::shared_ptr<VK> vk;

    static constexpr Commitment g1_identity = Commitment::one();

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(n);
        vk = create_verifier_commitment_key<VK>();
    }
};

TEST_F(KZGTest, single)
{

    auto witness = bb::Polynomial<Fr>::random(n);
    const Commitment commitment = commit(witness);

    const Fr challenge = Fr::random_element();
    const Fr evaluation = witness.evaluate(challenge);
    auto opening_pair = OpeningPair<Curve>{ challenge, evaluation };
    auto opening_claim = OpeningClaim<Curve>{ opening_pair, commitment };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    KZG::compute_opening_proof(ck, { witness, opening_pair }, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    const auto pairing_points = KZG::reduce_verify(opening_claim, verifier_transcript);

    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}

/**
 * @brief Test opening proof of a polynomial given by its evaluations at \f$ i = 0, \ldots, n \f$. Should only be
 * used for small values of \f$ n \f$.
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
    g1::element commitment = commit(witness_polynomial);

    const Fr challenge = Fr::random_element();
    // evaluate the original univariate
    const Fr evaluation = witness.evaluate(challenge);
    auto opening_pair = OpeningPair<Curve>{ challenge, evaluation };
    auto opening_claim = OpeningClaim<Curve>{ opening_pair, commitment };

    auto prover_transcript = NativeTranscript::prover_init_empty();

    KZG::compute_opening_proof(ck, { witness_polynomial, opening_pair }, prover_transcript);

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    auto pairing_points = KZG::reduce_verify(opening_claim, verifier_transcript);

    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}
/**
 * @brief Test full PCS protocol: Gemini, Shplonk, KZG and pairing check
 * @details Demonstrates the full PCS protocol as it is used in the construction and verification
 * of a single Honk proof. (Expository comments included throughout).
 *
 */
TEST_F(KZGTest, GeminiShplonkKzgWithShift)
{

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a
    // random point.
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

    auto instance_witness = InstanceWitnessGenerator(n, 2, 1, mle_opening_point, ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(n,
                                                     RefVector(instance_witness.unshifted_polynomials),
                                                     RefVector(instance_witness.to_be_shifted_polynomials),
                                                     mle_opening_point,
                                                     ck,
                                                     prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    auto gemini_verifier_claim =
        GeminiVerifier::reduce_verification(mle_opening_point,
                                            RefVector(instance_witness.unshifted_evals),
                                            RefVector(instance_witness.shifted_evals),
                                            RefVector(instance_witness.unshifted_commitments),
                                            RefVector(instance_witness.to_be_shifted_commitments),
                                            verifier_transcript);

    // Shplonk verifier claim: commitment [Q] - [Q_z], opening point (z_challenge, 0)
    const auto shplonk_verifier_claim =
        ShplonkVerifier::reduce_verification(vk->get_g1_identity(), gemini_verifier_claim, verifier_transcript);

    // KZG verifier:
    // aggregates inputs [Q] - [Q_z] and [W] into an 'accumulator' (can perform pairing check on result)
    auto pairing_points = KZG::reduce_verify(shplonk_verifier_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}

TEST_F(KZGTest, ShpleminiKzgWithShift)
{
    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a
    // random point.
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

    auto instance_witness = InstanceWitnessGenerator(n, 4, 2, mle_opening_point, ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    auto prover_opening_claims = GeminiProver::prove(n,
                                                     RefVector(instance_witness.unshifted_polynomials),
                                                     RefVector(instance_witness.to_be_shifted_polynomials),
                                                     mle_opening_point,
                                                     ck,
                                                     prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(instance_witness.unshifted_commitments),
                                                       RefVector(instance_witness.to_be_shifted_commitments),
                                                       RefVector(instance_witness.unshifted_evals),
                                                       RefVector(instance_witness.shifted_evals),
                                                       mle_opening_point,
                                                       vk->get_g1_identity(),
                                                       verifier_transcript);
    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}

TEST_F(KZGTest, ShpleminiKzgWithShiftAndConcatenation)
{
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a
    // random point.
    auto instance_witness = InstanceWitnessGenerator(n, 4, 2, mle_opening_point, ck);

    auto [concatenation_groups, concatenated_polynomials, c_evaluations, concatenation_groups_commitments] =
        generate_concatenation_inputs<Curve>(mle_opening_point, /*num_concatenated=*/3, /*concatenation_index=*/2, ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    const auto prover_opening_claims = GeminiProver::prove(n,
                                                           RefVector(instance_witness.unshifted_polynomials),
                                                           RefVector(instance_witness.to_be_shifted_polynomials),
                                                           mle_opening_point,
                                                           ck,
                                                           prover_transcript,
                                                           RefVector(concatenated_polynomials),
                                                           to_vector_of_ref_vectors(concatenation_groups));

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(ck, opening_claim, prover_transcript);

    // Run the full verifier PCS protocol with genuine opening claims (genuine commitment, genuine evaluation)

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Gemini verifier output:
    // - claim: d+1 commitments to Fold_{r}^(0), Fold_{-r}^(0), Fold^(l), d+1 evaluations a_0_pos, a_l, l = 0:d-1
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(instance_witness.unshifted_commitments),
                                                       RefVector(instance_witness.to_be_shifted_commitments),
                                                       RefVector(instance_witness.unshifted_evals),
                                                       RefVector(instance_witness.shifted_evals),
                                                       mle_opening_point,
                                                       vk->get_g1_identity(),
                                                       verifier_transcript,
                                                       /* repeated commitments= */ {},
                                                       /* has zk = */ {},
                                                       nullptr,
                                                       /* libra commitments = */ {},
                                                       /* libra evaluations = */ {},
                                                       to_vector_of_ref_vectors(concatenation_groups_commitments),
                                                       RefVector(c_evaluations));
    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);
    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)

    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}
TEST_F(KZGTest, ShpleminiKzgShiftsRemoval)
{
    std::vector<Fr> mle_opening_point = random_evaluation_point(log_n); // sometimes denoted 'u'

    // Generate multilinear polynomials, their commitments (genuine and mocked) and evaluations (genuine) at a
    // random point.
    auto instance_witness = InstanceWitnessGenerator(n, 4, 2, mle_opening_point, ck);

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Run the full prover PCS protocol:

    // Compute:
    // - (d+1) opening pairs: {r, \hat{a}_0}, {-r^{2^i}, a_i}, i = 0, ..., d-1
    // - (d+1) Fold polynomials Fold_{r}^(0), Fold_{-r}^(0), and Fold^(i), i = 0, ..., d-1
    const auto prover_opening_claims = GeminiProver::prove(n,
                                                           RefVector(instance_witness.unshifted_polynomials),
                                                           RefVector(instance_witness.to_be_shifted_polynomials),
                                                           mle_opening_point,
                                                           ck,
                                                           prover_transcript);

    // Shplonk prover output:
    // - opening pair: (z_challenge, 0)
    // - witness: polynomial Q - Q_z
    const auto opening_claim = ShplonkProver::prove(ck, prover_opening_claims, prover_transcript);

    // KZG prover:
    // - Adds commitment [W] to transcript
    KZG::compute_opening_proof(ck, opening_claim, prover_transcript);

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
    const auto batch_opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(n,
                                                       RefVector(instance_witness.unshifted_commitments),
                                                       RefVector(instance_witness.to_be_shifted_commitments),
                                                       RefVector(instance_witness.unshifted_evals),
                                                       RefVector(instance_witness.shifted_evals),
                                                       mle_opening_point,
                                                       vk->get_g1_identity(),
                                                       verifier_transcript,
                                                       repeated_commitments);

    const auto pairing_points = KZG::reduce_verify_batch_opening_claim(batch_opening_claim, verifier_transcript);

    // Final pairing check: e([Q] - [Q_z] + z[W], [1]_2) = e([W], [x]_2)
    EXPECT_EQ(vk->pairing_check(pairing_points[0], pairing_points[1]), true);
}

} // namespace bb
std::shared_ptr<typename bb::KZGTest::CK> bb::KZGTest::ck = nullptr;
std::shared_ptr<typename bb::KZGTest::VK> bb::KZGTest::vk = nullptr;
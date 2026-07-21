
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/pcs_test_utils.hpp"
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

    static CK ck;
    static VK vk;

    static constexpr size_t log_n = 7;

    using PCS = IPA<curve::Grumpkin, log_n>;

    static constexpr size_t n = 1UL << log_n;

    // IPA round challenges are 127-bit limbs in production (transcript split_challenge). The mock
    // transcript bypasses that, so mask explicitly to honor batch_two_round_fold's precondition.
    static uint256_t random_127_bit_challenge()
    {
        uint256_t c = Fr::random_element();
        c.data[2] = 0;
        c.data[3] = 0;
        c.data[1] &= 0x7FFFFFFFFFFFFFFFULL;
        return c;
    }

    static void SetUpTestSuite()
    {
        ck = create_commitment_key<CK>(n);
        vk = create_verifier_commitment_key<VK>();
    }

    struct ProofData {
        OpeningClaim<Curve> claim;
        NativeTranscript::Proof proof_data;
    };

    static ProofData generate_proof(const Polynomial& poly, const Fr& x)
    {
        Commitment commitment = ck.commit(poly);
        auto eval = poly.evaluate(x);
        auto prover_transcript = std::make_shared<NativeTranscript>();
        PCS::compute_opening_proof(ck, { poly, { x, eval } }, prover_transcript);
        return { { { x, eval }, commitment }, prover_transcript->export_proof() };
    }

    static ProofData generate_random_proof() { return generate_proof(Polynomial::random(n), Fr::random_element()); }

    struct ResultOfProveVerify {
        bool result;
        std::shared_ptr<NativeTranscript> prover_transcript;
        std::shared_ptr<NativeTranscript> verifier_transcript;
    };

    static ResultOfProveVerify run_native_prove_verify(const Polynomial& poly, const Fr x)
    {
        Commitment commitment = ck.commit(poly);
        auto eval = poly.evaluate(x);
        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        PCS::compute_opening_proof(ck, { poly, { x, eval } }, prover_transcript);

        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->export_proof());
        // the native reduce_verify does a _complete_ IPA proof and returns whether or not the checks pass.
        bool result = PCS::reduce_verify(vk, { { x, eval }, commitment }, verifier_transcript);
        return { result, prover_transcript, verifier_transcript };
    }
};
} // namespace

#define IPA_TEST
#include "ipa.hpp"

// Opening tests, i.e., check completeness for prove-and-verify.
//
// poly is zero, point is random
TEST_F(IPATest, OpenZeroPolynomial)
{
    Polynomial poly(n);
    auto x = this->random_element();
    bool result = run_native_prove_verify(poly, x).result;
    EXPECT_TRUE(result);
}

TEST_F(IPATest, OpenManyZerosPolynomial)
{
    // polynomial with zero odd coefficients and random even coefficients
    Polynomial poly_even(n);
    // polynomial with zero even coefficients and random odd coefficients
    Polynomial poly_odd(n);
    for (size_t i = 0; i < n / 2; ++i) {
        poly_even.at(2 * i) = this->random_element();
        poly_odd.at(2 * i + 1) = this->random_element();
    }
    auto x = this->random_element();
    bool result_even = run_native_prove_verify(poly_even, x).result;
    bool result_odd = run_native_prove_verify(poly_odd, x).result;
    EXPECT_TRUE(result_even && result_odd);
}

// poly is random, point is zero
TEST_F(IPATest, OpenAtZero)
{
    // generate a random polynomial, degree needs to be a power of two
    auto poly = Polynomial::random(n);
    const Fr x = Fr::zero();
    bool result = run_native_prove_verify(poly, x).result;
    EXPECT_TRUE(result);
}

// poly and point are random
TEST_F(IPATest, Open)
{
    // generate a random polynomial, degree needs to be a power of two
    auto poly = Polynomial::random(n);
    auto x = this->random_element();
    auto result_of_prove_verify = run_native_prove_verify(poly, x);
    EXPECT_TRUE(result_of_prove_verify.result);

    EXPECT_EQ(result_of_prove_verify.prover_transcript->get_manifest(),
              result_of_prove_verify.verifier_transcript->get_manifest());
}

// poly and point are random, condition on the fact that the evaluation is zero.
TEST_F(IPATest, OpeningValueZero)
{
    // generate random polynomial
    auto poly = Polynomial::random(n);
    auto x = this->random_element();
    auto initial_evaluation = poly.evaluate(x);
    auto change_in_linear_coefficient = initial_evaluation / x;
    // change linear coefficient so that poly(x) == 0.
    poly.at(1) -= change_in_linear_coefficient;

    EXPECT_EQ(poly.evaluate(x), Fr::zero());
    bool result = run_native_prove_verify(poly, x).result;
    EXPECT_TRUE(result);
}

// Tests that "artificially" mutate the Transcript. This uses the type `MockTranscript`.

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
        random_vector[i] = random_127_bit_challenge();
    }

    // Compute opening proofs several times, where each time a different challenge is equal to zero. Should cause
    // exceptions
    for (size_t i = 0; i < num_challenges; i++) {
        auto new_random_vector = random_vector;
        new_random_vector[i] = Fr::zero();
        transcript->initialize(new_random_vector);
        EXPECT_ANY_THROW(PCS::compute_opening_proof<MockTranscript>(ck, { poly, opening_pair }, transcript));
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
        EXPECT_ANY_THROW(PCS::reduce_verify(vk, opening_claim, transcript));
    }
}

// This test checks that if the vector \vec{a_new} becomes zero after one round, it doesn't break IPA.
TEST_F(IPATest, AIsZeroAfterOneRound)
{
    // initialize a mock transcript with 127-bit challenges (production challenges are 127-bit limbs;
    // the fused SRS fold asserts that). Index 0 is the generator challenge, index 1 the first
    // folding challenge u.
    auto transcript = std::make_shared<MockTranscript>();
    const size_t num_challenges = log_n + 1;
    std::vector<uint256_t> random_vector(num_challenges);
    for (size_t i = 0; i < num_challenges; i++) {
        random_vector[i] = random_127_bit_challenge();
    }
    const Fr u = Fr(random_vector[1]);

    // Build the witness so a folds to zero after round 1: with a' = u^-1 a_lo + a_hi, set
    // a_hi = -u^-1 a_lo, giving a' = 0.
    const Fr neg_u_inv = -u.invert();
    auto poly = Polynomial(n);
    for (size_t i = 0; i < n / 2; i++) {
        poly.at(i) = Fr::random_element();
        poly.at(i + (n / 2)) = neg_u_inv * poly[i];
    }
    auto [x, eval] = this->random_eval(poly);
    auto commitment = ck.commit(poly);
    const OpeningPair<Curve> opening_pair = { x, eval };
    const OpeningClaim<Curve> opening_claim{ opening_pair, commitment };

    // Put the challenges in the transcript
    transcript->initialize(random_vector);

    // Compute opening proof
    PCS::compute_opening_proof<MockTranscript>(ck, { poly, opening_pair }, transcript);

    // Reset indices
    transcript->reset_indices();

    // Verify
    EXPECT_TRUE(PCS::reduce_verify(vk, opening_claim, transcript));
}
#endif
} // namespace bb

// Tests of batched MLPCS, where IPA is the final univariate commitment scheme.

// Batch IPA verification tests

TEST_F(IPATest, BatchVerifyTwoValidProofs)
{
    auto [claim1, proof1] = generate_random_proof();
    auto [claim2, proof2] = generate_random_proof();

    std::vector<OpeningClaim<Curve>> claims = { claim1, claim2 };
    std::vector<std::shared_ptr<NativeTranscript>> transcripts = { std::make_shared<NativeTranscript>(proof1),
                                                                   std::make_shared<NativeTranscript>(proof2) };

    EXPECT_TRUE(PCS::batch_reduce_verify(vk, claims, transcripts));
}

TEST_F(IPATest, BatchVerifySingleProof)
{
    // Degenerate case: batch verify with N=1 should match reduce_verify
    auto [claim, proof_data] = generate_random_proof();

    EXPECT_TRUE(PCS::reduce_verify(vk, claim, std::make_shared<NativeTranscript>(proof_data)));
    EXPECT_TRUE(PCS::batch_reduce_verify(vk, { claim }, { std::make_shared<NativeTranscript>(proof_data) }));
}

TEST_F(IPATest, BatchVerifyRejectsTamperedGZero)
{
    auto [claim, proof_data] = generate_random_proof();
    auto tampered_proof = proof_data;

    constexpr size_t commitment_size = FrCodec::template calc_num_fields<Commitment>();
    constexpr size_t g_zero_offset = 2 * log_n * commitment_size;
    static_assert(g_zero_offset + commitment_size + FrCodec::template calc_num_fields<Fr>() == 4 * log_n + 4);
    ASSERT_LE(g_zero_offset + commitment_size, tampered_proof.size());

    Commitment wrong_g_zero = Commitment::one() * Fr(7);
    auto wrong_g_zero_fields = FrCodec::serialize_to_fields<Commitment>(wrong_g_zero);
    std::copy(wrong_g_zero_fields.begin(),
              wrong_g_zero_fields.end(),
              tampered_proof.begin() + static_cast<std::ptrdiff_t>(g_zero_offset));

    EXPECT_FALSE(PCS::reduce_verify(vk, claim, std::make_shared<NativeTranscript>(tampered_proof)));
    EXPECT_FALSE(PCS::batch_reduce_verify(vk, { claim }, { std::make_shared<NativeTranscript>(tampered_proof) }));
}

TEST_F(IPATest, BatchVerifyRejectsTamperedAZero)
{
    auto [claim, proof_data] = generate_random_proof();
    auto tampered_proof = proof_data;

    constexpr size_t commitment_size = FrCodec::template calc_num_fields<Commitment>();
    constexpr size_t g_zero_offset = 2 * log_n * commitment_size;
    constexpr size_t a_zero_offset = g_zero_offset + commitment_size;
    static_assert(a_zero_offset + FrCodec::template calc_num_fields<Fr>() == 4 * log_n + 4);
    ASSERT_LT(a_zero_offset, tampered_proof.size());

    auto wrong_a_zero_fields = FrCodec::serialize_to_fields<Fr>(Fr(7));
    std::copy(wrong_a_zero_fields.begin(),
              wrong_a_zero_fields.end(),
              tampered_proof.begin() + static_cast<std::ptrdiff_t>(a_zero_offset));

    EXPECT_FALSE(PCS::reduce_verify(vk, claim, std::make_shared<NativeTranscript>(tampered_proof)));
    EXPECT_FALSE(PCS::batch_reduce_verify(vk, { claim }, { std::make_shared<NativeTranscript>(tampered_proof) }));
}

TEST_F(IPATest, BatchVerifyTamperedProof)
{
    auto [claim1, proof1] = generate_random_proof();
    auto [claim2, proof2] = generate_random_proof();

    // Tamper with the second claim's evaluation
    claim2.opening_pair.evaluation += Fr::one();

    std::vector<OpeningClaim<Curve>> claims = { claim1, claim2 };
    std::vector<std::shared_ptr<NativeTranscript>> transcripts = { std::make_shared<NativeTranscript>(proof1),
                                                                   std::make_shared<NativeTranscript>(proof2) };

    EXPECT_FALSE(PCS::batch_reduce_verify(vk, claims, transcripts));
}

TEST_F(IPATest, BatchVerifyRejectsClaimTranscriptMismatch)
{
    // Batch verification must bind each claim to its own transcript. Two individually valid proofs
    // should pass when correctly paired but fail when the transcripts are swapped, since each
    // transcript's round messages (L_j, R_j) are coupled to its claim's commitment in C_zero.
    auto [claim1, proof1] = generate_random_proof();
    auto [claim2, proof2] = generate_random_proof();

    std::vector<OpeningClaim<Curve>> claims = { claim1, claim2 };

    // Correct pairing: passes
    EXPECT_TRUE(PCS::batch_reduce_verify(
        vk, claims, { std::make_shared<NativeTranscript>(proof1), std::make_shared<NativeTranscript>(proof2) }));

    // Swapped pairing: fails
    EXPECT_FALSE(PCS::batch_reduce_verify(
        vk, claims, { std::make_shared<NativeTranscript>(proof2), std::make_shared<NativeTranscript>(proof1) }));
}

typename IPATest::CK IPATest::ck;
typename IPATest::VK IPATest::vk;

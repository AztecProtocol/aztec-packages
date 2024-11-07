
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/transcript/transcript.hpp"

using namespace bb;

namespace {
using NativeCurve = curve::Grumpkin;
using Builder = UltraCircuitBuilder;
using Curve = stdlib::grumpkin<Builder>;

class IPARecursiveTests : public CommitmentTest<NativeCurve> {
  public:
    using Fr = typename NativeCurve::ScalarField;
    using GroupElement = typename NativeCurve::Element;
    using CK = CommitmentKey<NativeCurve>;
    using VK = VerifierCommitmentKey<NativeCurve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename NativeCurve::AffineElement;
    using NativeIPA = IPA<NativeCurve>;
    using RecursiveIPA = IPA<Curve>;
    using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;

    std::pair<std::shared_ptr<StdlibTranscript>, OpeningClaim<Curve>> create_ipa_claim(Builder& builder, const size_t n)
    {
        // First generate an ipa proof
        auto poly = Polynomial::random(n);
        // Commit to a zero polynomial
        Commitment commitment = this->commit(poly);

        auto [x, eval] = this->random_eval(poly);
        const OpeningPair<NativeCurve> opening_pair = { x, eval };
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, commitment };

        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        NativeIPA::compute_opening_proof(this->ck(), { poly, opening_pair }, prover_transcript);

        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);

        // Recursively verify the proof
        auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
        auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
        auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
        OpeningClaim<Curve> stdlib_opening_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };

        // Construct stdlib verifier transcript
        auto recursive_verifier_transcript =
            std::make_shared<StdlibTranscript>(bb::convert_proof_to_witness(&builder, prover_transcript->proof_data));
        return { recursive_verifier_transcript, stdlib_opening_claim };
    }

    /**
     * @brief Tests IPA recursion
     * @details Creates an IPA claim and then runs the recursive IPA verification and checks that the circuit is valid.
     * @param POLY_LENGTH
     */
    void test_recursive_ipa(const size_t POLY_LENGTH)
    {
        Builder builder;
        auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, POLY_LENGTH, this->vk());
        auto [stdlib_transcript, stdlib_claim] = create_ipa_claim(builder, POLY_LENGTH);

        RecursiveIPA::reduce_verify(recursive_verifier_ck, stdlib_claim, stdlib_transcript);
        builder.finalize_circuit(/*ensure_nonzero=*/false);
        info("IPA Recursive Verifier num finalized gates = ", builder.get_num_finalized_gates());
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    /**
     * @brief Tests IPA accumulation by accumulating two IPA claims and proving the accumulated claim
     * @details Creates two IPA claims, and then two IPA accumulators through recursive verification. Proves the
     * accumulated claim and checks that it verifies.
     * @param POLY_LENGTH
     */
    void test_accumulation(const size_t POLY_LENGTH)
    {
        // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
        // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
        // contain the commitment and an opening claim.
        Builder builder;
        auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, POLY_LENGTH, this->vk());

        auto [transcript_1, claim_1] = create_ipa_claim(builder, POLY_LENGTH);
        auto [transcript_2, claim_2] = create_ipa_claim(builder, POLY_LENGTH);

        // Creates two IPA accumulators and accumulators from the two claims. Also constructs the accumulated h
        // polynomial.
        auto [output_claim, challenge_poly] =
            RecursiveIPA::accumulate(recursive_verifier_ck, transcript_1, claim_1, transcript_2, claim_2);
        builder.finalize_circuit(/*ensure_nonzero=*/false);
        info("Circuit with 2 IPA Recursive Verifiers and IPA Accumulation num finalized gates = ",
             builder.get_num_finalized_gates());

        EXPECT_TRUE(CircuitChecker::check(builder));

        // Run the IPA prover on this new accumulated claim.
        auto prover_transcript = std::make_shared<NativeTranscript>();
        const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_claim.opening_pair.challenge.get_value()),
                                                     bb::fq(output_claim.opening_pair.evaluation.get_value()) };
        Commitment native_comm = output_claim.commitment.get_value();
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, native_comm };

        NativeIPA::compute_opening_proof(this->ck(), { challenge_poly, opening_pair }, prover_transcript);

        EXPECT_EQ(challenge_poly.evaluate(opening_pair.challenge), opening_pair.evaluation);
        // Natively verify this proof to check it.
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);
    }
};
} // namespace

#define IPA_TEST

/**
 * @brief Tests IPA recursion with polynomial of length 4
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveSmall)
{
    test_recursive_ipa(/*POLY_LENGTH=*/4);
}

/**
 * @brief Tests IPA recursion with polynomial of length 1024
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveMedium)
{
    test_recursive_ipa(/*POLY_LENGTH=*/1024);
}

/**
 * @brief Tests IPA recursion with polynomial of length 1<<CONST_ECCVM_LOG_N
 * @details More details in test_recursive_ipa
 */
TEST_F(IPARecursiveTests, RecursiveLarge)
{
    test_recursive_ipa(/*POLY_LENGTH=*/1 << CONST_ECCVM_LOG_N);
}

/**
 * @brief Test accumulation with polynomials of length 4
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateSmall)
{
    test_accumulation(/*POLY_LENGTH=*/4);
}

/**
 * @brief Test accumulation with polynomials of length 1024
 * @details More details in test_accumulation
 */
TEST_F(IPARecursiveTests, AccumulateMedium)
{
    test_accumulation(/*POLY_LENGTH=*/1024);
}
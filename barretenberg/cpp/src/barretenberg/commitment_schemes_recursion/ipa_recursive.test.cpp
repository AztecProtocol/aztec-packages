
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

class IPATest : public CommitmentTest<NativeCurve> {
  public:
    using Fr = typename NativeCurve::ScalarField;
    using GroupElement = typename NativeCurve::Element;
    using CK = CommitmentKey<NativeCurve>;
    using VK = VerifierCommitmentKey<NativeCurve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename NativeCurve::AffineElement;
    using IpaAccumulator = stdlib::recursion::honk::IpaAccumulator<Curve>;
    using NativeIPA = IPA<NativeCurve>;
    using RecursiveIPA = IPA<Curve>;
    using StdlibTranscript = bb::stdlib::recursion::honk::UltraStdlibTranscript;

    std::pair<std::shared_ptr<StdlibTranscript>, IpaAccumulator> create_ipa_accumulator(Builder& builder,
                                                                                        const size_t n)
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
        IpaAccumulator acc{ stdlib_comm, stdlib_x, stdlib_eval };

        auto recursive_verifier_transcript =
            std::make_shared<StdlibTranscript>(bb::convert_proof_to_witness(&builder, prover_transcript->proof_data));
        return { recursive_verifier_transcript, acc };
    }

    void test_recursive_ipa(const size_t POLY_LENGTH)
    {
        Builder builder;
        auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, POLY_LENGTH, this->vk());
        auto [transcript_1, acc_1] = create_ipa_accumulator(builder, POLY_LENGTH);

        RecursiveIPA::reduce_verify(
            recursive_verifier_ck, { { acc_1.eval_point, acc_1.eval }, acc_1.comm }, transcript_1);
    }

    void test_accumulation(const size_t POLY_LENGTH)
    {
        // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
        // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
        // contain the commitment and an opening claim
        Builder builder;
        auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, POLY_LENGTH, this->vk());

        auto [transcript_1, acc_1] = create_ipa_accumulator(builder, POLY_LENGTH);
        auto [transcript_2, acc_2] = create_ipa_accumulator(builder, POLY_LENGTH);

        // Construct the accumulator and polynomial from the u_chals
        auto [output_acc, h_poly] =
            RecursiveIPA::accumulate(recursive_verifier_ck, transcript_1, acc_1, transcript_2, acc_2);

        // now make an ipa proof with this claim
        auto prover_transcript = std::make_shared<NativeTranscript>();
        const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_acc.eval_point.get_value()),
                                                     bb::fq(output_acc.eval.get_value()) };
        Commitment native_comm = output_acc.comm.get_value();
        const OpeningClaim<NativeCurve> opening_claim{ opening_pair, native_comm };

        NativeIPA::compute_opening_proof(this->ck(), { h_poly, opening_pair }, prover_transcript);
        // natively verify this proof to check it
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

        auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        EXPECT_TRUE(result);
    }
};
} // namespace

#define IPA_TEST

TEST_F(IPATest, RecursiveSmall)
{
    test_recursive_ipa(/*POLY_LENGTH=*/4);
}

TEST_F(IPATest, RecursiveMedium)
{
    test_recursive_ipa(/*POLY_LENGTH=*/1024);
}

/**
 * @brief Test accumulation with polynomials of length 4
 *
 */
TEST_F(IPATest, AccumulateSmall)
{
    test_accumulation(/*POLY_LENGTH=*/4);
}

/**
 * @brief Test accumulation with polynomials of length 789
 *
 */
TEST_F(IPATest, AccumulateMedium)
{
    test_accumulation(/*POLY_LENGTH=*/1024);
}

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

    std::pair<std::shared_ptr<StdlibTranscript>, IpaAccumulator> create_ipa_accumulator(Builder& builder)
    {
        // First generate an ipa proof
        constexpr size_t n = 4;
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
        // auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);
        // const OpeningClaim<NativeCurve> opening_claim = { { fq(stdlib_x.get_value()), fq(stdlib_eval.get_value()) },
        //                                                   stdlib_comm.get_value() };
        // auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
        // EXPECT_TRUE(result);

        auto recursive_verifier_transcript =
            std::make_shared<StdlibTranscript>(bb::convert_proof_to_witness(&builder, prover_transcript->proof_data));
        return { recursive_verifier_transcript, acc };
    }
};
} // namespace

#define IPA_TEST

TEST_F(IPATest, BasicRecursive)
{
    // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
    // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
    // contain the commitment and an opening claim
    Builder builder;
    auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, 4, this->vk());
    auto [transcript_1, acc_1] = create_ipa_accumulator(builder);

    RecursiveIPA::reduce_verify(recursive_verifier_ck, { { acc_1.eval_point, acc_1.eval }, acc_1.comm }, transcript_1);
}

TEST_F(IPATest, Accumulate)
{
    // We create a circuit that does two IPA verifications. However, we don't do the full verifications and instead
    // accumulate the claims into one claim. This accumulation is done in circuit. Create two accumulators, which
    // contain the commitment and an opening claim
    Builder builder;
    auto recursive_verifier_ck = std::make_shared<VerifierCommitmentKey<Curve>>(&builder, 4, this->vk());

    auto [transcript_1, acc_1] = create_ipa_accumulator(builder);
    auto [transcript_2, acc_2] = create_ipa_accumulator(builder);

    //
    // Construct the polynomial from the u_chals
    auto [output_acc, h_poly] =
        RecursiveIPA::accumulate(recursive_verifier_ck, transcript_1, acc_1, transcript_2, acc_2);

    // now make an ipa proof with this claim
    auto prover_transcript = std::make_shared<NativeTranscript>();
    const OpeningPair<NativeCurve> opening_pair{ bb::fq(output_acc.eval_point.get_value()),
                                                 bb::fq(output_acc.eval.get_value()) };
    Commitment native_comm = output_acc.comm.get_value();
    const OpeningClaim<NativeCurve> opening_claim{ opening_pair, native_comm };

    info("h_poly: ", h_poly.coeffs());
    for (auto c : h_poly.coeffs()) {
        info(c);
    }
    NativeIPA::compute_opening_proof(this->ck(), { h_poly, opening_pair }, prover_transcript);
    // natively verify this proof to check it
    auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->proof_data);

    auto result = NativeIPA::reduce_verify(this->vk(), opening_claim, verifier_transcript);
    EXPECT_TRUE(result);
}
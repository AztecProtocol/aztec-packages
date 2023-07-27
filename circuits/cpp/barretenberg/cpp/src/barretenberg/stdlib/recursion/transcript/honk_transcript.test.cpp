#include <gtest/gtest.h>

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/stdlib/recursion/transcript/honk_trancript.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {

// TODO(Cody): Testing only one circuit type.
using Builder = UltraCircuitBuilder;

using field_t = stdlib::field_t<Builder>;
using bool_t = stdlib::bool_t<Builder>;
using uint32 = stdlib::uint<Builder, uint32_t>;
using witness_t = stdlib::witness_t<Builder>;
using byte_array = stdlib::byte_array<Builder>;
using fq_t = stdlib::bigfield<Builder, barretenberg::Bn254FqParams>;
using group_t = stdlib::element<Builder, fq_t, field_t, barretenberg::g1>;
using transcript_ct = Transcript<Builder>;
using FF = barretenberg::fr;
using Commitment = barretenberg::g1::affine_element;
using Point = barretenberg::g1::element;
using ProverTranscript = ::proof_system::honk::ProverTranscript<FF>;
using VerifierTranscript = ::proof_system::honk::VerifierTranscript<FF>;

auto generate_mock_proof_data(auto prover_transcript)
{
    uint32_t data = 25;
    auto scalar = FF::random_element();
    auto commitment = Commitment::one();
    // auto univariate = Univariate(evaluations);

    // round 0
    prover_transcript.send_to_verifier("data", data);
    prover_transcript.get_challenge("alpha");

    // round 1
    prover_transcript.send_to_verifier("scalar", scalar);
    prover_transcript.send_to_verifier("commitment", commitment);
    prover_transcript.get_challenges("beta, gamma");

    return prover_transcript.proof_data;
}

void perform_mock_transcript_operations(auto transcript)
{
    transcript.template receive_from_prover<uint32_t>("data");
    transcript.get_challenge("alpha");

    transcript.template receive_from_prover<FF>("scalar");
    transcript.template receive_from_prover<Commitment>("commitment");
    transcript.get_challenges("beta, gamma");
}

TEST(stdlib_honk_transcript, basic_transcript_operations)
{
    // Instantiate a Prover Transcript and use it to generate some proof data
    ProverTranscript prover_transcript;
    auto proof_data = generate_mock_proof_data(prover_transcript);

    // Instantiate a (native) Verifier Transcript the proof data and perform some mock transcript operations
    VerifierTranscript native_transcript(proof_data);
    perform_mock_transcript_operations(native_transcript);

    // Confirm that Prover and Verifier transcripts have generated the same manifest via the operations performed
    EXPECT_EQ(prover_transcript.get_manifest(), native_transcript.get_manifest());

    // Instantiate a stdlib Transcript and perform the same operations
    Builder builder;
    Transcript<Builder> transcript{proof_data};
    perform_mock_transcript_operations(transcript);

    // Confirm that the native and stdlib transcripts have generated the same manifest
    EXPECT_EQ(transcript.get_manifest(), native_transcript.get_manifest());

}
} // namespace proof_system::plonk::stdlib::recursion::honk
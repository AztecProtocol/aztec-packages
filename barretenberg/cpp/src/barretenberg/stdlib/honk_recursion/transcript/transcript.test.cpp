#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

using Builder = UltraCircuitBuilder;
using UltraFlavor = UltraFlavor;
using UltraRecursiveFlavor = UltraRecursiveFlavor_<Builder>;
using FF = fr;
using NativeTranscript = NativeTranscript;
using StdlibTranscript = BaseTranscript<StdlibTranscriptParams<Builder>>;

/**
 * @brief Create some mock data; add it to the provided prover transcript in various mock rounds
 *
 * @param prover_transcript
 * @return auto proof_data
 */
template <class Flavor, size_t LENGTH> auto generate_mock_proof_data(auto prover_transcript)
{
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Univariate = typename bb::Univariate<FF, LENGTH>;

    // Create some mock data to be added to the transcript in several mock rounds
    uint32_t data = 25;
    auto scalar = FF::random_element();
    auto commitment = Commitment::one();

    std::array<FF, LENGTH> evaluations;
    for (auto& eval : evaluations) {
        eval = FF::random_element();
    }
    auto univariate = Univariate(evaluations);

    // round 0
    prover_transcript.send_to_verifier("data", data);
    prover_transcript.template get_challenge<FF>("alpha");

    // round 1
    prover_transcript.send_to_verifier("scalar", scalar);
    prover_transcript.send_to_verifier("commitment", commitment);
    prover_transcript.template get_challenges<FF>("beta, gamma");

    // round 2
    prover_transcript.send_to_verifier("univariate", univariate);
    prover_transcript.template get_challenges<FF>("gamma", "delta");

    return prover_transcript.proof_data;
}

/**
 * @brief Perform series of verifier transcript operations
 * @details Operations are designed to correspond to those performed by a prover transcript from which the verifier
 * transcript was initialized.
 *
 * @param transcript Either a native or stdlib verifier transcript
 * @tparam Flavor
 * @tparam LENGTH Length of Univariate to be serialized
 */
template <class Flavor, size_t LENGTH> void perform_mock_verifier_transcript_operations(auto transcript)
{
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Univariate = typename bb::Univariate<FF, LENGTH>;

    // round 0
    transcript.template receive_from_prover<FF>("data");
    transcript.template get_challenge<FF>("alpha");

    // round 1
    transcript.template receive_from_prover<FF>("scalar");
    transcript.template receive_from_prover<Commitment>("commitment");
    transcript.template get_challenges<FF>("beta, gamma");

    // round 2
    transcript.template receive_from_prover<Univariate>("univariate");
    transcript.template get_challenges<FF>("gamma", "delta");
}

/**
 * @brief Test basic transcript functionality and check circuit
 * @details Implicitly ensures stdlib interface is identical to native
 *
 */
TEST(RecursiveHonkTranscript, InterfacesMatch)
{
    Builder builder;

    constexpr size_t LENGTH = 8; // arbitrary length of Univariate to be serialized

    // Instantiate a Prover Transcript and use it to generate some mock proof data
    NativeTranscript prover_transcript;
    auto proof_data = generate_mock_proof_data<UltraFlavor, LENGTH>(prover_transcript);

    // Instantiate a (native) Verifier Transcript with the proof data and perform some mock transcript operations
    NativeTranscript native_transcript(proof_data);
    perform_mock_verifier_transcript_operations<UltraFlavor, LENGTH>(native_transcript);

    // Confirm that Prover and Verifier transcripts have generated the same manifest via the operations performed
    EXPECT_EQ(prover_transcript.get_manifest(), native_transcript.get_manifest());

    // Instantiate a stdlib Transcript and perform the same operations
    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof_data);
    StdlibTranscript transcript{ stdlib_proof };
    perform_mock_verifier_transcript_operations<UltraRecursiveFlavor, LENGTH>(transcript);

    // Confirm that the native and stdlib verifier transcripts have generated the same manifest
    EXPECT_EQ(transcript.get_manifest(), native_transcript.get_manifest());

    // TODO(#1351): The Honk stdlib transcript does not currently lay down contraints for fiat-shamir hashing so
    // check_circuit has limited value.
    EXPECT_TRUE(CircuitChecker::check(builder));
}

/**
 * @brief Check that native and stdlib verifier transcript functions produce equivalent outputs
 *
 */
TEST(RecursiveHonkTranscript, ReturnValuesMatch)
{
    using FF = fr;
    using Commitment = g1::affine_element;

    using field_ct = field_t<Builder>;
    using fq_ct = bigfield<Builder, bb::Bn254FqParams>;
    using element_ct = element<Builder, fq_ct, field_ct, bb::g1>;

    Builder builder;

    // Define some mock data for a mock proof
    auto scalar = FF::random_element();
    auto commitment = Commitment::one() * FF::random_element();

    const size_t LENGTH = 10; // arbitrary
    std::array<FF, LENGTH> evaluations;
    for (auto& eval : evaluations) {
        eval = FF::random_element();
    }

    // Construct a mock proof via the prover transcript
    NativeTranscript prover_transcript;
    prover_transcript.send_to_verifier("scalar", scalar);
    prover_transcript.send_to_verifier("commitment", commitment);
    prover_transcript.send_to_verifier("evaluations", evaluations);
    prover_transcript.template get_challenges<FF>("alpha, beta");
    auto proof_data = prover_transcript.proof_data;

    // Perform the corresponding operations with the native verifier transcript
    NativeTranscript native_transcript(proof_data);
    auto native_scalar = native_transcript.template receive_from_prover<FF>("scalar");
    auto native_commitment = native_transcript.template receive_from_prover<Commitment>("commitment");
    auto native_evaluations = native_transcript.template receive_from_prover<std::array<FF, LENGTH>>("evaluations");
    auto [native_alpha, native_beta] = native_transcript.template get_challenges<FF>("alpha", "beta");

    // Perform the same operations with the stdlib verifier transcript
    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof_data);
    StdlibTranscript stdlib_transcript{ stdlib_proof };
    auto stdlib_scalar = stdlib_transcript.template receive_from_prover<field_ct>("scalar");
    auto stdlib_commitment = stdlib_transcript.template receive_from_prover<element_ct>("commitment");
    auto stdlib_evaluations =
        stdlib_transcript.template receive_from_prover<std::array<field_ct, LENGTH>>("evaluations");
    auto [stdlib_alpha, stdlib_beta] = stdlib_transcript.template get_challenges<field_ct>("alpha", "beta");

    // Confirm that return values are equivalent
    EXPECT_EQ(native_scalar, stdlib_scalar.get_value());
    EXPECT_EQ(native_commitment, stdlib_commitment.get_value());
    for (size_t i = 0; i < LENGTH; ++i) {
        EXPECT_EQ(native_evaluations[i], stdlib_evaluations[i].get_value());
    }

    EXPECT_EQ(static_cast<FF>(native_alpha), stdlib_alpha.get_value());
    EXPECT_EQ(static_cast<FF>(native_beta), stdlib_beta.get_value());
}

/**
 * @brief Ensure that when encountering an infinity commitment results stay consistent in the recursive and native case
 * for Grumpkin and the native and stdlib transcripts produce the same challenge.
 * @todo(https://github.com/AztecProtocol/barretenberg/issues/1064)  Add more transcript tests for both curves
 */
TEST(RecursiveTranscript, InfinityConsistencyGrumpkin)
{
    using NativeCurve = curve::Grumpkin;
    using NativeCommitment = typename NativeCurve::AffineElement;
    using NativeFF = NativeCurve::ScalarField;

    using FF = bigfield<Builder, bb::Bn254FqParams>;
    using Commitment = cycle_group<Builder>;

    Builder builder;

    NativeCommitment infinity = NativeCommitment::infinity();

    NativeTranscript prover_transcript;
    prover_transcript.send_to_verifier("infinity", infinity);
    NativeFF challenge = prover_transcript.get_challenge<NativeFF>("challenge");
    auto proof_data = prover_transcript.proof_data;

    NativeTranscript verifier_transcript(proof_data);
    verifier_transcript.receive_from_prover<NativeCommitment>("infinity");
    auto verifier_challenge = verifier_transcript.get_challenge<NativeFF>("challenge");

    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof_data);
    StdlibTranscript stdlib_transcript{ stdlib_proof };
    auto stdlib_infinity = stdlib_transcript.receive_from_prover<Commitment>("infinity");
    EXPECT_TRUE(stdlib_infinity.is_point_at_infinity().get_value());
    auto stdlib_challenge = stdlib_transcript.get_challenge<FF>("challenge");

    EXPECT_EQ(challenge, verifier_challenge);
    EXPECT_EQ(verifier_challenge, NativeFF(stdlib_challenge.get_value() % FF::modulus));
}

/**
 * @brief Ensure that when encountering an infinity commitment results stay consistent in the recursive and native case
 * for BN254 and the native and stdlib transcripts produce the same challenge.
 * @todo(https://github.com/AztecProtocol/barretenberg/issues/1064)  Add more transcript tests for both curves
 */
TEST(RecursiveTranscript, InfinityConsistencyBN254)
{
    using NativeCurve = curve::BN254;
    using NativeCommitment = typename NativeCurve::AffineElement;
    using NativeFF = NativeCurve::ScalarField;

    using FF = field_t<Builder>;
    using BF = bigfield<Builder, bb::Bn254FqParams>;
    using Commitment = element<Builder, BF, FF, bb::g1>;

    Builder builder;

    NativeCommitment infinity = NativeCommitment::infinity();

    NativeTranscript prover_transcript;
    prover_transcript.send_to_verifier("infinity", infinity);
    NativeFF challenge = prover_transcript.get_challenge<NativeFF>("challenge");
    auto proof_data = prover_transcript.proof_data;

    NativeTranscript verifier_transcript(proof_data);
    verifier_transcript.receive_from_prover<NativeCommitment>("infinity");
    auto verifier_challenge = verifier_transcript.get_challenge<NativeFF>("challenge");

    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof_data);
    StdlibTranscript stdlib_transcript{ stdlib_proof };
    auto stdlib_commitment = stdlib_transcript.receive_from_prover<Commitment>("infinity");
    EXPECT_TRUE(stdlib_commitment.is_point_at_infinity().get_value());
    auto stdlib_challenge = stdlib_transcript.get_challenge<FF>("challenge");

    EXPECT_EQ(challenge, verifier_challenge);
    EXPECT_EQ(verifier_challenge, stdlib_challenge.get_value());
}
} // namespace bb::stdlib::recursion::honk
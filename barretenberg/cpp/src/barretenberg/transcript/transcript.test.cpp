#include "barretenberg/stdlib/transcript/transcript.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FF = bb::fr;
using Fr = bb::fr;
using Fq = bb::fq;

class TestTranscript : public NativeTranscript {
  public:
    void tamper_proof_data()
    {
        // Modify the integer value in the proof data.
        proof_data.back() += 1;
    }
};

/**
 * @brief Test sending, receiving, and exporting proofs
 *
 */
TEST(NativeTranscript, TwoProversTwoFields)
{
    const auto EXPECT_PROVER_STATE = [](const TestTranscript& transcript, size_t start, size_t written) {
        EXPECT_EQ(transcript.proof_start, static_cast<std::ptrdiff_t>(start));
        EXPECT_EQ(transcript.num_frs_written, written);
    };
    const auto EXPECT_VERIFIER_STATE =
        [](const TestTranscript& verifier_transcript, size_t read, size_t proof_size = 0) {
            EXPECT_EQ(verifier_transcript.num_frs_read, read);
            if (proof_size != 0) {
                EXPECT_EQ(verifier_transcript.num_frs_read, proof_size);
            }
        };

    TestTranscript prover_transcript;
    // state initializes to zero

    EXPECT_PROVER_STATE(prover_transcript, /*start*/ 0, /*written*/ 0);
    Fr elt_a = 1377;
    prover_transcript.send_to_verifier("a", elt_a);
    EXPECT_PROVER_STATE(prover_transcript, /*start*/ 0, /*written*/ 1);
    TestTranscript verifier_transcript;
    verifier_transcript.load_proof(prover_transcript.export_proof());
    // export resets read/write state and sets start in prep for next export
    EXPECT_PROVER_STATE(prover_transcript, /*start*/ 1, /*written*/ 0);
    // state initializes to zero
    EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 0);
    Fr received_a = verifier_transcript.receive_from_prover<Fr>("a");
    // receiving is reading frs input and writing them to an internal proof_data buffer
    EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 1, prover_transcript.size_proof_data());
    EXPECT_EQ(received_a, elt_a);

    { // send grumpkin::fr
        Fq elt_b = 773;
        prover_transcript.send_to_verifier("b", elt_b);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 1, /*written*/ 2);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 3, /*written*/ 0);
        // load proof is not an action by a prover or verifier, so it does not change read/write counts
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 1);
        Fq received_b = verifier_transcript.receive_from_prover<Fq>("b");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 3, prover_transcript.size_proof_data());
        EXPECT_EQ(received_b, elt_b);
    }
    { // send uint32_t
        uint32_t elt_c = 43;
        prover_transcript.send_to_verifier("c", elt_c);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 3, /*written*/ 1);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 4, /*written*/ 0);
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 3);
        auto received_c = verifier_transcript.receive_from_prover<uint32_t>("c");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 4, prover_transcript.size_proof_data());
        EXPECT_EQ(received_c, elt_c);
    }
    { // send curve::BN254::AffineElement
        curve::BN254::AffineElement elt_d = bb::g1::affine_one;
        prover_transcript.send_to_verifier("d", elt_d);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 4, /*written*/ 4);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 8, /*written*/ 0);
        auto received_d = verifier_transcript.receive_from_prover<curve::BN254::AffineElement>("d");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 8, prover_transcript.size_proof_data());
        EXPECT_EQ(received_d, elt_d);
    }
    { // send std::array<bb::fr, 4>
        std::array<bb::fr, 5> elt_e = { 1, 2, 3, 4, 5 };
        prover_transcript.send_to_verifier("e", elt_e);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 8, /*written*/ 5);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 13, /*written*/ 0);
        auto received_e = verifier_transcript.receive_from_prover<std::array<bb::fr, 5>>("e");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 13);
        EXPECT_EQ(received_e, elt_e);
    }
    { // send std::array<grumpkin::fr>
        std::array<grumpkin::fr, 7> elt_f = { 9, 12515, 1231, 745, 124, 6231, 957 };
        prover_transcript.send_to_verifier("f", elt_f);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 13, /*written*/ 14);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 27, /*written*/ 0);
        auto received_f = verifier_transcript.receive_from_prover<std::array<grumpkin::fr, 7>>("f");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 27);
        EXPECT_EQ(received_f, elt_f);
    }
    { // send Univariate<bb::fr>
        bb::Univariate<bb::fr, 4> elt_g{ std::array<bb::fr, 4>({ 5, 6, 7, 8 }) };
        prover_transcript.send_to_verifier("g", elt_g);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 27, /*written*/ 4);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 31, /*written*/ 0);
        auto received_g = verifier_transcript.receive_from_prover<bb::Univariate<bb::fr, 4>>("g");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 31);
        EXPECT_EQ(received_g, elt_g);
    }
    { // send Univariate<grumpkin::fr>
        bb::Univariate<grumpkin::fr, 3> elt_h{ std::array<grumpkin::fr, 3>({ 9, 10, 11 }) };
        prover_transcript.send_to_verifier("h", elt_h);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 31, /*written*/ 6);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 37, /*written*/ 0);
        auto received_h = verifier_transcript.receive_from_prover<bb::Univariate<grumpkin::fr, 3>>("h");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 37);
        EXPECT_EQ(received_h, elt_h);
    }
    { // send curve::Grumpkin::AffineElement
        curve::Grumpkin::AffineElement elt_i = grumpkin::g1::affine_one;
        prover_transcript.send_to_verifier("i", elt_i);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 37, /*written*/ 2);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 39, /*written*/ 0);
        auto received_i = verifier_transcript.receive_from_prover<curve::Grumpkin::AffineElement>("i");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 39);
        EXPECT_EQ(received_i, elt_i);
    }
    { // send curve::Grumpkin::AffineElement point at infinity
        curve::Grumpkin::AffineElement elt_j = grumpkin::g1::affine_one;
        elt_j.self_set_infinity();
        prover_transcript.send_to_verifier("j", elt_j);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 39, /*written*/ 2);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 41, /*written*/ 0);
        auto received_j = verifier_transcript.receive_from_prover<curve::Grumpkin::AffineElement>("j");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 41);
        EXPECT_TRUE(received_j.is_point_at_infinity());
        EXPECT_EQ(received_j, elt_j);
    }
    { // send curve::BN254::AffineElement point at infinity
        curve::BN254::AffineElement elt_k = bb::g1::affine_one;
        elt_k.self_set_infinity();
        prover_transcript.send_to_verifier("k", elt_k);
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 41, /*written*/ 4);
        verifier_transcript.load_proof(prover_transcript.export_proof());
        EXPECT_PROVER_STATE(prover_transcript, /*start*/ 45, /*written*/ 0);
        auto received_k = verifier_transcript.receive_from_prover<curve::BN254::AffineElement>("k");
        EXPECT_VERIFIER_STATE(verifier_transcript, /*read*/ 45);
        EXPECT_TRUE(received_k.is_point_at_infinity());
        EXPECT_EQ(received_k, elt_k);
    }
}

/**
 * @brief Test the add_to_hash_buffer functionality
 *
 */
TEST(NativeTranscript, ConsumeElement)
{
    TestTranscript prover_transcript, verifier_transcript;
    prover_transcript.add_to_hash_buffer("a", Fr(1));
    verifier_transcript.add_to_hash_buffer("a", Fr(1));
    auto prover_chal = prover_transcript.get_challenge<Fr>("alpha");
    auto verifier_chal = verifier_transcript.get_challenge<Fr>("alpha");
    EXPECT_EQ(prover_chal, verifier_chal);
}

/**
 * @brief Test the case when a transcript is shared by multiple provers using `add_to_hash_buffer()` method.
 *
 */
TEST(NativeTranscript, MultipleProversWithAddToHashBuffer)
{

    // Populate prover and verifier transcripts. Make sure that some elements are hashed without being placed into the
    // proof data, i.e. use `add_to_hash_buffer()` method.
    auto simulate_transcript_interaction_with_multiple_provers = [](const size_t num_proof_exports,
                                                                    TestTranscript& prover_transcript,
                                                                    TestTranscript& verifier_transcript,
                                                                    bool tampered_transcript = false) {
        for (size_t idx = 0; idx < num_proof_exports; idx++) {

            // Mock current prover transcript actions.
            prover_transcript.add_to_hash_buffer("vk_field", Fr(1));
            prover_transcript.send_to_verifier<uint32_t>("integer", 5);

            if (tampered_transcript) {
                // Modify the integer value in the proof data.
                prover_transcript.tamper_proof_data();
            }

            prover_transcript.send_to_verifier("random_field_element", Fr::random_element());
            prover_transcript.send_to_verifier("random_Grumpkin_point",
                                               curve::Grumpkin::AffineElement::random_element());
            prover_transcript.send_to_verifier("random_bn254_point", curve::BN254::AffineElement::random_element());

            const Fr prover_challenge = prover_transcript.get_challenge<Fr>("alpha");

            // Mock the verifier logic.
            verifier_transcript.load_proof(prover_transcript.export_proof());
            verifier_transcript.add_to_hash_buffer("vk_field", Fr(1));
            verifier_transcript.receive_from_prover<Fr>("random_field_element");
            verifier_transcript.receive_from_prover<uint32_t>("integer");
            const Fr verifier_challenge = verifier_transcript.get_challenge<Fr>("alpha");

            verifier_transcript.receive_from_prover<curve::Grumpkin::AffineElement>("random_Grumpkin_point");
            verifier_transcript.receive_from_prover<curve::BN254::AffineElement>("random_bn254_point");

            EXPECT_FALSE(prover_challenge == verifier_challenge);
        };
    };

    // Test valid transcript data
    for (size_t num_proof_exports = 2; num_proof_exports < 5; num_proof_exports++) {
        TestTranscript prover_transcript;
        TestTranscript verifier_transcript;
        simulate_transcript_interaction_with_multiple_provers(
            num_proof_exports, prover_transcript, verifier_transcript);
    }

    // Test tampered transcript data
    TestTranscript prover_transcript;
    TestTranscript verifier_transcript;
    simulate_transcript_interaction_with_multiple_provers(
        /*num_proof_exports=*/2, prover_transcript, verifier_transcript, true);
}

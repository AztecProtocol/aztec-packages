// Unified transcript tests - works for both native and stdlib transcripts
// Replaces: transcript.test.cpp and stdlib_transcript.test.cpp

#include "transcript_test_fixture.hpp"

namespace bb::test {

// Helper to extract Codec and HashFn from std::pair
template <typename T> struct TranscriptTests;
template <typename Codec, typename HashFn>
struct TranscriptTests<std::pair<Codec, HashFn>> : TranscriptTest<Codec, HashFn> {};

TYPED_TEST_SUITE(TranscriptTests, TranscriptTypes);

// ============================================================================
// Basic Type Send/Receive Tests
// ============================================================================

TYPED_TEST(TranscriptTests, ScalarSendReceive)
{
    this->test_scalar_send_receive();
}

TYPED_TEST(TranscriptTests, BasefieldSendReceive)
{
    this->test_basefield_send_receive();
}

TYPED_TEST(TranscriptTests, BN254CommitmentSendReceive)
{
    this->test_bn254_commitment_send_receive();
}

TYPED_TEST(TranscriptTests, GrumpkinCommitmentSendReceive)
{
    this->test_grumpkin_commitment_send_receive();
}

TYPED_TEST(TranscriptTests, ArraySendReceive)
{
    this->template test_array_send_receive<8>();
}

TYPED_TEST(TranscriptTests, GrumpkinFieldArraySendReceive)
{
    this->template test_grumpkin_field_array_send_receive<7>();
}

TYPED_TEST(TranscriptTests, UnivariateSendReceive)
{
    this->template test_univariate_send_receive<8>();
}

TYPED_TEST(TranscriptTests, GrumpkinUnivariateSendReceive)
{
    this->template test_grumpkin_univariate_send_receive<3>();
}

// ============================================================================
// Point at Infinity Tests
// ============================================================================

TYPED_TEST(TranscriptTests, BN254InfinityHandling)
{
    this->test_bn254_infinity_handling();
}

TYPED_TEST(TranscriptTests, GrumpkinInfinityHandling)
{
    this->test_grumpkin_infinity_handling();
}

// ============================================================================
// Test multiple Provers sharing a Transcript
// ============================================================================

TYPED_TEST(TranscriptTests, BasicMultiRoundProtocol)
{
    this->test_multi_round_protocol();
}

TYPED_TEST(TranscriptTests, ManifestConsistency)
{
    this->test_manifest_consistency();
}

// ============================================================================
// Challenge Generation Tests
// ============================================================================

TYPED_TEST(TranscriptTests, ChallengesNonZero)
{
    this->test_challenges_are_nonzero();
}

// ============================================================================
// Hash Buffer Tests
// ============================================================================

TYPED_TEST(TranscriptTests, HashBufferConsistency)
{
    this->test_hash_buffer_consistency();
}

// ============================================================================
// Native-Specific Tests
// ============================================================================

TYPED_TEST(TranscriptTests, ProverToVerifierConversion)
{
    this->test_prover_to_verifier_conversion();
}

TYPED_TEST(TranscriptTests, TamperingDetection)
{
    this->test_tampering_detection();
}

// ============================================================================
// Test Batch Challenge Generation
// ============================================================================

/**
 * @brief Test that getting multiple challenges at once works correctly
 */
TYPED_TEST(TranscriptTests, BatchChallengeGeneration)
{
    using FF = typename TestFixture::FF;

    NativeTranscript prover;
    prover.send_to_verifier("data", bb::fr::random_element());

    std::array<std::string, 3> labels = { "alpha", "beta", "gamma" };
    auto [p_alpha, p_beta, p_gamma] = prover.template get_challenges<bb::fr>(labels);

    typename TestFixture::Transcript verifier(this->export_proof(prover));
    verifier.template receive_from_prover<FF>("data");

    auto [v_alpha, v_beta, v_gamma] = verifier.template get_challenges<FF>(labels);

    EXPECT_EQ(p_alpha, this->to_native(v_alpha));
    EXPECT_EQ(p_beta, this->to_native(v_beta));
    EXPECT_EQ(p_gamma, this->to_native(v_gamma));

    this->check_circuit();
}

/**
 * @brief Test using vector of challenge labels
 */
TYPED_TEST(TranscriptTests, VectorChallengeGeneration)
{
    using FF = typename TestFixture::FF;

    NativeTranscript prover;
    // Need at least one piece of data before generating challenges
    prover.send_to_verifier("init", bb::fr(1));
    std::vector<std::string> labels = { "c1", "c2", "c3", "c4", "c5" };
    auto prover_challenges = prover.template get_challenges<bb::fr>(labels);

    typename TestFixture::Transcript verifier(this->export_proof(prover));
    verifier.template receive_from_prover<FF>("init");
    auto verifier_challenges = verifier.template get_challenges<FF>(labels);

    ASSERT_EQ(prover_challenges.size(), verifier_challenges.size());
    for (size_t i = 0; i < prover_challenges.size(); ++i) {
        EXPECT_EQ(prover_challenges[i], this->to_native(verifier_challenges[i]));
    }

    this->check_circuit();
}

/**
 * @brief Short (127-bit) challenges agree between prover and verifier.
 */
TYPED_TEST(TranscriptTests, ShortChallengeGeneration)
{
    using FF = typename TestFixture::FF;

    NativeTranscript prover;
    prover.send_to_verifier("data", bb::fr::random_element());
    std::array<std::string, 3> labels = { "alpha", "beta", "gamma" };
    auto [p_alpha, p_beta, p_gamma] = prover.template get_short_challenges<bb::fr>(labels);
    auto p_single = prover.template get_short_challenge<bb::fr>("delta");

    typename TestFixture::Transcript verifier(this->export_proof(prover));
    verifier.template receive_from_prover<FF>("data");
    auto [v_alpha, v_beta, v_gamma] = verifier.template get_short_challenges<FF>(labels);
    auto v_single = verifier.template get_short_challenge<FF>("delta");

    EXPECT_EQ(p_alpha, this->to_native(v_alpha));
    EXPECT_EQ(p_beta, this->to_native(v_beta));
    EXPECT_EQ(p_gamma, this->to_native(v_gamma));
    EXPECT_EQ(p_single, this->to_native(v_single));

    this->check_circuit();
}

/**
 * @brief The full challenge is the raw hash; the matching short challenge is its low 127-bit limb. From an
 * identical transcript state the two differ, and the short one fits in 127 bits.
 */
TEST(TranscriptShortVsFull, ShortIsLowLimbOfFull)
{
    NativeTranscript prover_full;
    NativeTranscript prover_short;
    const bb::fr data = bb::fr::random_element();
    prover_full.send_to_verifier("data", data);
    prover_short.send_to_verifier("data", data);

    const bb::fr full = prover_full.get_challenge<bb::fr>("c");
    const bb::fr short_challenge = prover_short.get_short_challenge<bb::fr>("c");

    // The short challenge is exactly the low limb of split_challenge applied to the full challenge.
    EXPECT_EQ(short_challenge, NativeTranscript::Codec::split_challenge(full)[0]);
    EXPECT_NE(short_challenge, full);
    EXPECT_LT(uint256_t(short_challenge).get_msb(), 127); // fits in 127 bits
}

} // namespace bb::test

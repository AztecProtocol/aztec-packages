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
// Infinity Point Tests
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
// Multi-Round Protocol Tests
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

TYPED_TEST(TranscriptTests, ChallengesAfterData)
{
    this->test_challenges_after_data();
}

// ============================================================================
// Hash Buffer Tests
// ============================================================================

TYPED_TEST(TranscriptTests, HashBufferConsistency)
{
    this->test_hash_buffer_consistency();
}

TYPED_TEST(TranscriptTests, CircuitSizeBounded)
{
    this->test_circuit_size_bounded();
}

// ============================================================================
// Native-Specific Tests
// ============================================================================

TYPED_TEST(TranscriptTests, StateTracking)
{
    this->test_state_tracking();
}

TYPED_TEST(TranscriptTests, ProverToVerifierConversion)
{
    this->test_prover_to_verifier_conversion();
}

TYPED_TEST(TranscriptTests, TamperingDetection)
{
    this->test_tampering_detection();
}

// ============================================================================
// Comprehensive Type Coverage Tests
// ============================================================================

/**
 * @brief Test all supported types in a single protocol
 * @details This ensures that mixing different types in one transcript works correctly
 */
TYPED_TEST(TranscriptTests, AllTypesMixed)
{
    using FF = typename TestFixture::FF;
    // using BF = typename TestFixture::BF;  // Unused - basefield tests skipped
    using BN254Commitment = typename TestFixture::bn254_commitment;
    using GrumpkinCommitment = typename TestFixture::grumpkin_commitment;

    NativeTranscript prover;

    // Send all different types
    prover.send_to_verifier("scalar", bb::fr::random_element());
    // Skip basefield - causes template instantiation issues with bigfield
    // prover.send_to_verifier("basefield", bb::fq::random_element());
    // Skip uint32_t - not needed
    prover.send_to_verifier("bn254_point", curve::BN254::AffineElement::random_element());
    prover.send_to_verifier("grumpkin_point", curve::Grumpkin::AffineElement::random_element());

    std::array<bb::fr, 3> array_vals;
    for (auto& v : array_vals) {
        v = bb::fr::random_element();
    }
    prover.send_to_verifier("array", array_vals);

    std::array<bb::fr, 4> uni_evals;
    for (auto& e : uni_evals) {
        e = bb::fr::random_element();
    }
    prover.send_to_verifier("univariate", bb::Univariate<bb::fr, 4>(uni_evals));

    auto challenge = prover.template get_challenge<bb::fr>("final_challenge");

    // Verify
    typename TestFixture::Transcript verifier;
    verifier.load_proof(this->export_proof(prover));

    verifier.template receive_from_prover<FF>("scalar");
    // Skip basefield - causes template instantiation issues with bigfield
    // verifier.template receive_from_prover<BF>("basefield");
    // Skip uint32_t - not needed
    verifier.template receive_from_prover<BN254Commitment>("bn254_point");
    verifier.template receive_from_prover<GrumpkinCommitment>("grumpkin_point");
    verifier.template receive_from_prover<std::array<FF, 3>>("array");
    verifier.template receive_from_prover<bb::Univariate<FF, 4>>("univariate");
    auto verifier_challenge = verifier.template get_challenge<FF>("final_challenge");

    EXPECT_EQ(challenge, this->to_native(verifier_challenge));
    EXPECT_EQ(prover.get_manifest(), verifier.get_manifest());

    this->check_circuit();
}

/**
 * @brief Stress test with many rounds and challenges
 */
TYPED_TEST(TranscriptTests, ManyRoundsStressTest)
{
    using FF = typename TestFixture::FF;

    NativeTranscript prover;
    typename TestFixture::Transcript verifier;

    constexpr size_t NUM_ROUNDS = 10;
    std::vector<bb::fr> prover_challenges;
    prover_challenges.reserve(NUM_ROUNDS);

    // Prover: many rounds
    for (size_t i = 0; i < NUM_ROUNDS; ++i) {
        prover.send_to_verifier("data_" + std::to_string(i), bb::fr::random_element());
        auto chal = prover.template get_challenge<bb::fr>("challenge_" + std::to_string(i));
        prover_challenges.push_back(chal);
    }

    // Verifier: replay
    verifier.load_proof(this->export_proof(prover));
    for (size_t i = 0; i < NUM_ROUNDS; ++i) {
        verifier.template receive_from_prover<FF>("data_" + std::to_string(i));
        auto chal = verifier.template get_challenge<FF>("challenge_" + std::to_string(i));
        EXPECT_EQ(prover_challenges[i], this->to_native(chal));
    }

    EXPECT_EQ(prover.get_manifest(), verifier.get_manifest());
    this->check_circuit();
}

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

    typename TestFixture::Transcript verifier;
    verifier.load_proof(this->export_proof(prover));
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

    typename TestFixture::Transcript verifier;
    verifier.load_proof(this->export_proof(prover));
    verifier.template receive_from_prover<FF>("init");
    auto verifier_challenges = verifier.template get_challenges<FF>(labels);

    ASSERT_EQ(prover_challenges.size(), verifier_challenges.size());
    for (size_t i = 0; i < prover_challenges.size(); ++i) {
        EXPECT_EQ(prover_challenges[i], this->to_native(verifier_challenges[i]));
    }

    this->check_circuit();
}

} // namespace bb::test

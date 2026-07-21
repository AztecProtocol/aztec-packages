/**
 * @file origin_tag.test.cpp
 * @brief Tests for OriginTag cross-round provenance checking.
 *
 * OriginTag tracks the provenance of values in recursive verification circuits.
 * The key security invariant: max(challenge_round) >= max(submitted_round).
 * This ensures all submitted data is bound by an appropriate Fiat-Shamir challenge.
 */

#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <gtest/gtest.h>

using namespace bb;

#ifndef AZTEC_NO_ORIGIN_TAGS

// Test that combining values from different rounds without proper challenge coverage throws
TEST(OriginTag, RejectsCrossRoundMixingWithoutChallenge)
{
    const size_t transcript_id = 0;

    // Round 0: prover submits c0, verifier responds with challenge α
    // Round 1: prover submits c1
    auto c0_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/true);
    auto alpha_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/false);
    auto c1_tag = OriginTag(transcript_id, /*round=*/1, /*is_submitted=*/true);

    // OK: c0 * alpha - round 0 data bound by round 0 challenge
    OriginTag c0_times_alpha;
    EXPECT_NO_THROW(c0_times_alpha = OriginTag(c0_tag, alpha_tag));

    // REJECT: (c0 * alpha) + c1
    // c1 (round 1 submitted) has no challenge binding it
    // max_submitted_round (1) > max_challenge_round (0)
    EXPECT_THROW(OriginTag(c0_times_alpha, c1_tag), std::runtime_error);

    // REJECT: c0 + c1 directly (different rounds, no challenges)
    EXPECT_THROW(OriginTag(c0_tag, c1_tag), std::runtime_error);
}

// Test that stale challenges don't provide coverage for later rounds
TEST(OriginTag, RejectsStaleChallengeCoverage)
{
    const size_t transcript_id = 0;

    // Timeline:
    // Round 0: verifier generates alpha
    // Round 1: prover submits c1 (after seeing alpha)
    // Round 2: prover submits c2 (after seeing alpha)
    //
    // Neither c1 nor c2 is bound by alpha since they were chosen after seeing it

    auto alpha_tag = OriginTag(transcript_id, /*round_number=*/0, /*is_submitted=*/false);
    auto c1_tag = OriginTag(transcript_id, /*round_number=*/1, /*is_submitted=*/true);
    auto c2_tag = OriginTag(transcript_id, /*round=*/2, /*is_submitted=*/true);

    // OK: c1 * alpha - alpha has no submitted data, so the cross-round check doesn't apply.
    // The check only triggers when mixing PROVER VALUES from different rounds.
    OriginTag c1_times_alpha;
    EXPECT_NO_THROW(c1_times_alpha = OriginTag(c1_tag, alpha_tag));

    // REJECT: (c1 * alpha) + c2
    // Now we're mixing prover values from rounds 1 and 2.
    // max_submitted = 2, max_challenge = 0 -> insufficient coverage
    EXPECT_THROW(OriginTag(c1_times_alpha, c2_tag), std::runtime_error);
}

// Test that proper challenge coverage allows cross-round combinations
TEST(OriginTag, AllowsProperlyBoundCrossRoundCombinations)
{
    const size_t transcript_id = 0;

    auto c0_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/true);
    auto alpha_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/false);
    auto c1_tag = OriginTag(transcript_id, /*round=*/1, /*is_submitted=*/true);
    auto beta_tag = OriginTag(transcript_id, /*round=*/1, /*is_submitted=*/false);

    // OK: c0 * alpha + c1 * beta - all data properly bound by challenges
    auto c0_times_alpha = OriginTag(c0_tag, alpha_tag);
    auto c1_times_beta = OriginTag(c1_tag, beta_tag);

    OriginTag result;
    EXPECT_NO_THROW(result = OriginTag(c0_times_alpha, c1_times_beta));

    // OK: c0 + c1 * beta - β (round 1 challenge) covers both c0 and c1
    // because β is derived from a hash chain that includes c0
    EXPECT_NO_THROW(result = OriginTag(c0_tag, c1_times_beta));
}

// Test that same-round combinations are allowed before any challenge
TEST(OriginTag, AllowsSameRoundCombinationsWithoutChallenge)
{
    const size_t transcript_id = 0;

    auto a_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/true);
    auto b_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/true);

    // OK: combining values from the same round doesn't require a challenge
    OriginTag result;
    EXPECT_NO_THROW(result = OriginTag(a_tag, b_tag));
}

// Test constant tags don't affect provenance
TEST(OriginTag, ConstantTagsAreNeutral)
{
    const size_t transcript_id = 0;

    auto submitted_tag = OriginTag(transcript_id, /*round=*/0, /*is_submitted=*/true);
    auto constant_tag = OriginTag::constant();

    // Combining with constant preserves the non-constant tag
    OriginTag result;
    EXPECT_NO_THROW(result = OriginTag(submitted_tag, constant_tag));
    EXPECT_EQ(result, submitted_tag);

    EXPECT_NO_THROW(result = OriginTag(constant_tag, submitted_tag));
    EXPECT_EQ(result, submitted_tag);
}

// Test instant death tags throw on any operation
TEST(OriginTag, InstantDeathTagsThrow)
{
    auto normal_tag = OriginTag::constant();
    auto death_tag = OriginTag::poisoned();

    EXPECT_THROW(OriginTag(normal_tag, death_tag), std::runtime_error);
    EXPECT_THROW(OriginTag(death_tag, normal_tag), std::runtime_error);
    EXPECT_THROW(OriginTag(death_tag, death_tag), std::runtime_error);
}

// Test different transcript indices cannot be combined
TEST(OriginTag, RejectsCrossTranscriptCombinations)
{
    auto tag_transcript_0 = OriginTag(/*transcript_id=*/0, /*round=*/0, /*is_submitted=*/true);
    auto tag_transcript_1 = OriginTag(/*transcript_id=*/1, /*round=*/0, /*is_submitted=*/true);

    EXPECT_THROW(OriginTag(tag_transcript_0, tag_transcript_1), std::runtime_error);
}

// Integration test using actual transcript and circuit types
TEST(OriginTag, TranscriptIntegration)
{
    using Builder = UltraCircuitBuilder;
    using FF = stdlib::field_t<Builder>;
    using Transcript = StdlibTranscript<Builder>;

    Builder builder;

    // Create a transcript (simulating recursive verifier)
    auto transcript = std::make_shared<Transcript>();

    // Simulate a proof being loaded
    std::vector<FF> fake_proof;
    for (size_t i = 0; i < 10; i++) {
        fake_proof.push_back(FF::from_witness(&builder, fr::random_element()));
    }
    transcript->load_proof(fake_proof);

    // Round 0: Verifier receives c0 from proof
    auto c0 = transcript->template receive_from_prover<FF>("c0");

    // Round 0: Verifier gets challenge alpha
    auto alpha = transcript->template get_challenge<FF>("alpha");

    // Round 1: Verifier receives c1 from proof
    auto c1 = transcript->template receive_from_prover<FF>("c1");

    // OK: c0 * alpha (round 0 data bound by round 0 challenge)
    FF c0_times_alpha = c0 * alpha;

    // REJECT: (c0 * alpha) + c1 - c1 has no challenge binding it
    EXPECT_THROW([[maybe_unused]] auto bad = c0_times_alpha + c1, std::runtime_error);

    // REJECT: c0 + c1 directly (different rounds, no challenges)
    EXPECT_THROW([[maybe_unused]] auto bad = c0 + c1, std::runtime_error);

    // Round 1: Get challenge beta
    auto beta = transcript->template get_challenge<FF>("beta");

    // OK: c0 * alpha + c1 * beta - properly bound
    FF c1_times_beta = c1 * beta;
    EXPECT_NO_THROW([[maybe_unused]] auto good = c0_times_alpha + c1_times_beta);
}

// Test that free witness tags cannot interact with transcript-tagged values
TEST(OriginTag, RejectsFreeWitnessInteraction)
{
    const size_t transcript_id = 0;

    auto transcript_tag = OriginTag(transcript_id, /*round_number=*/0, /*is_submitted=*/true);
    auto free_witness_tag = OriginTag::free_witness();

    // REJECT: free witness interacting with transcript-tagged value
    // Free witnesses are untracked values that shouldn't mix with protocol values
    EXPECT_THROW(OriginTag(transcript_tag, free_witness_tag), std::runtime_error);
    EXPECT_THROW(OriginTag(free_witness_tag, transcript_tag), std::runtime_error);

    // OK: free witnesses can combine with each other
    auto another_free_witness = OriginTag::free_witness();
    EXPECT_NO_THROW(OriginTag(free_witness_tag, another_free_witness));

    // OK: free witnesses can combine with constants
    auto constant_tag = OriginTag::constant();
    EXPECT_NO_THROW(OriginTag(free_witness_tag, constant_tag));
}

// Test demonstrating use of origin tags to "override" common false positive pattern in provenance checking.
TEST(OriginTag, RetaggingReflectsProtocolConstraints)
{
    const size_t transcript_id = 0;

    // Scenario: In a PCS protocol:
    // Round 0: Prover sends commitment C
    // Round 1: Verifier derives evaluation challenge z
    // Round 2: Prover sends evaluation v = f(z) and opening proof
    // Round 3: Verifier derives batching challenge for final check
    //
    // Naively, a combination like C * z + v would be rejected since the round provenance of z is less than the highest
    // summitted round (1). However, this is a false positive since v is actually bound to C via the PCS opening. The
    // pattern for signaling this to the tooling is to re-tag v with the challenge z that binds it after PCS
    // verification.

    auto commitment_tag = OriginTag(transcript_id, /*round_number=*/0, /*is_submitted=*/true);
    auto eval_challenge_tag = OriginTag(transcript_id, /*round_number=*/0, /*is_submitted=*/false);
    auto eval_tag = OriginTag(transcript_id, /*round_number=*/1, /*is_submitted=*/true);

    // False positive: Mixing commitment (round 0) with evaluation (round 1) using only round 0 challenge
    // The evaluation appears unbound from the verifier's perspective
    auto comm_times_challenge = OriginTag(commitment_tag, eval_challenge_tag);
    EXPECT_THROW(OriginTag(comm_times_challenge, eval_tag), std::runtime_error);

    // In reality, the evaluation is constrained by the PCS opening.
    // Re-tag the evaluation with the challenge that binds it (the one derived after
    // the commitment was fixed but before the evaluation was sent).
    // This reflects the protocol-level constraint: v must equal f(z) for committed f.
    const auto& eval_retagged = eval_challenge_tag;

    // OK: Now the "evaluation" is tagged as bound by the eval challenge
    EXPECT_NO_THROW(OriginTag(comm_times_challenge, eval_retagged));
}

// Test that unique per-object IDs are assigned
TEST(OriginTag, UniqueTagIds)
{
    auto tag_a = OriginTag(0, 0, true);
    auto tag_b = OriginTag(0, 0, true);

    // Each constructed tag gets a unique ID
    EXPECT_NE(tag_a.tag_id, tag_b.tag_id);

    // Copy preserves the ID
    auto tag_a_copy = tag_a;
    EXPECT_EQ(tag_a_copy.tag_id, tag_a.tag_id);

    // Merge produces a new ID
    auto merged = OriginTag(tag_a, tag_b);
    EXPECT_NE(merged.tag_id, tag_a.tag_id);
    EXPECT_NE(merged.tag_id, tag_b.tag_id);
}

#endif // AZTEC_NO_ORIGIN_TAGS

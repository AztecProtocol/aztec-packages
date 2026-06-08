/**
 * @file chonk_transcript_invariants.test.cpp
 * @brief Transcript isolation and counting invariants for Chonk IVC
 *
 * @details These tests verify critical transcript invariants that ensure security:
 *
 * 1. **Transcript Counting Invariants** - Pins the exact number of transcripts created
 *    during IVC accumulation and recursive verification. This detects structural changes
 *    in transcript management that could affect:
 *    - Transcript isolation between components
 *    - Fiat-Shamir challenge derivation
 *    - Public input propagation between kernels
 *
 * 2. **Atomic Index Progression** - Verifies that unique_transcript_index increments
 *    correctly through the IVC flow, ensuring:
 *    - Each transcript gets a unique identifier
 *    - Values from different transcripts cannot be mixed (OriginTag enforcement)
 *    - Parallel IVC instances have non-overlapping index ranges
 *
 * Why these invariants matter:
 * - Transcript isolation prevents cross-contamination of Fiat-Shamir challenges
 * - Counting stability catches unintended structural changes in recursive verification
 * - Index progression ensures OriginTag security guarantees hold
 */

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test fixture for Chonk transcript invariant tests
 */
class ChonkTranscriptInvariantTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Pin the exact number of transcripts created during IVC accumulation
 * @details This test ensures the transcript creation count during accumulation is a fixed constant.
 * Any change to this count indicates a structural change in how transcripts are managed, which
 * could have security implications (e.g., unexpected transcript isolation or sharing).
 *
 * The 4-app IVC flow creates 6 circuits: app0 -> app1 -> app2 -> kernel1 -> app3 -> kernel2 -> reset -> tail -> hiding
 *
 * Per-circuit transcript breakdown (from complete_kernel_circuit_logic). The per-kernel multilinear batching (and the
 * hiding kernel's decider) continue on the shared accumulation transcript, so they create no additional transcripts:
 * - App circuits (0, 1, 2): 0 transcripts - use native HN folding prover
 * - Init kernel (3): 3 transcripts:
 *     1. accumulation_recursive_transcript (also carries the batching sumcheck for multi-app init kernels)
 *     2. PairingPoints::aggregate_multiple - for batching pairing points with Fiat-Shamir separator
 *     3. hash_transcript - for computing accumulator hash to propagate in public inputs
 * - Intermediate kernel (5): 3 transcripts:
 *     1. accumulation_recursive_transcript - shared across recursive verification and the batching sumcheck
 *     2. PairingPoints::aggregate_multiple - for batching pairing points with Fiat-Shamir separator
 *     3. hash_transcript - for computing accumulator hash to propagate in public inputs
 * - Reset and tail kernels (6, 7): 2 transcripts each:
 *     1. accumulation_recursive_transcript (also carries the batching sumcheck)
 *     2. hash_transcript - for computing accumulator hash to propagate in public inputs
 * - Hiding kernel (8): 3 transcripts:
 *     1. accumulation_recursive_transcript (also carries the batching sumcheck and the decider)
 *     2. batch_merge_transcript - for final batch merge verification
 *     3. PairingPoints::aggregate_multiple
 *
 * Total: 0 + 0 + 0 + 3 + 0 + 3 + 2 + 2 + 3 = 13 transcripts
 */
TEST_F(ChonkTranscriptInvariantTests, AccumulationTranscriptCount)
{
    // Pinned expected transcript count for 4 app circuits
    constexpr size_t EXPECTED_TOTAL_TRANSCRIPTS = 13;
    constexpr size_t EXPECTED_NUM_CIRCUITS = 9;
    constexpr std::array<size_t, EXPECTED_NUM_CIRCUITS> EXPECTED_CIRCUIT_TRANSCRIPTS = { 0, 0, 0, 3, 0, 3, 2, 2, 3 };

    // Record transcript index before IVC
    size_t index_before_ivc = bb::unique_transcript_index.load();

    // Track indices at each circuit accumulation
    std::vector<size_t> indices_before_accumulation;
    std::vector<size_t> indices_after_accumulation;

    // Create IVC with 4 app circuits
    constexpr size_t NUM_APP_CIRCUITS = 4;
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    ASSERT_EQ(num_circuits, EXPECTED_NUM_CIRCUITS) << "Circuit count mismatch - test assumptions invalid";

    Chonk ivc{ num_circuits };

    for (size_t j = 0; j < num_circuits; ++j) {
        indices_before_accumulation.push_back(bb::unique_transcript_index.load());
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
        indices_after_accumulation.push_back(bb::unique_transcript_index.load());
    }

    size_t index_after_ivc = bb::unique_transcript_index.load();
    size_t total_transcripts = index_after_ivc - index_before_ivc;

    // Pin the total number of transcripts created during accumulation
    EXPECT_EQ(total_transcripts, EXPECTED_TOTAL_TRANSCRIPTS)
        << "Total transcript count during 4-app IVC accumulation changed. "
        << "If intentional, update EXPECTED_TOTAL_TRANSCRIPTS. "
        << "Unexpected changes may indicate security-relevant transcript isolation issues.";

    // Pin per-circuit transcript counts
    for (size_t i = 0; i < num_circuits; ++i) {
        size_t circuit_transcripts = indices_after_accumulation[i] - indices_before_accumulation[i];
        EXPECT_EQ(circuit_transcripts, EXPECTED_CIRCUIT_TRANSCRIPTS[i])
            << "Circuit " << i << " transcript count changed from " << EXPECTED_CIRCUIT_TRANSCRIPTS[i] << " to "
            << circuit_transcripts;
    }

    // Generate and verify proof
    auto proof = ivc.prove();
    auto vk_and_hash = ivc.get_hiding_kernel_vk_and_hash();
    ChonkNativeVerifier verifier(vk_and_hash);
    EXPECT_TRUE(verifier.verify(proof)) << "IVC proof should verify";
}

/**
 * @brief Pin the exact number of transcripts created during recursive Chonk verification
 * @details The recursive Chonk verifier creates transcripts that are tracked via unique_transcript_index
 * (which is incremented for each in-circuit transcript creation). This test pins the exact count
 * to detect any changes in transcript management that could affect security.
 *
 * Expected breakdown (4 transcripts total):
 * - 1 transcript: chonk_rec_verifier_transcript (shared across MegaVerifier and GoblinVerifier)
 * - 3 additional transcripts: created by PairingPoints::aggregate() for Fiat-Shamir recursion separators
 *   (one for MegaVerifier result aggregation, two for Goblin sub-verifier result aggregations)
 */
TEST_F(ChonkTranscriptInvariantTests, RecursiveVerificationTranscriptCount)
{
    using RecursiveVerifier = ChonkRecursiveVerifier;

    // Create a minimal IVC and generate proof
    constexpr size_t NUM_APP_CIRCUITS = 1;
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ num_circuits };

    for (size_t j = 0; j < num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    auto proof = ivc.prove();
    auto vk_and_hash = ivc.get_hiding_kernel_vk_and_hash();

    // Perform recursive verification and track transcript creation
    // unique_transcript_index is only incremented for in-circuit transcripts (in_circuit == true)
    UltraCircuitBuilder builder;
    size_t index_before_verify = bb::unique_transcript_index.load();

    // Create stdlib VK and hash from native VK
    auto stdlib_vk_and_hash = std::make_shared<RecursiveVerifier::VKAndHash>(builder, vk_and_hash->vk);

    RecursiveVerifier verifier(stdlib_vk_and_hash);
    ChonkStdlibProof stdlib_proof(builder, proof);
    [[maybe_unused]] auto output = verifier.verify(stdlib_proof);

    size_t index_after_verify = bb::unique_transcript_index.load();
    size_t transcripts_created = index_after_verify - index_before_verify;

    // Pin the exact number of transcripts created during recursive verification
    constexpr size_t EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY = 2;
    EXPECT_EQ(transcripts_created, EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY)
        << "ChonkRecursiveVerifier transcript count changed. "
        << "If intentional, update EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY. "
        << "Unexpected changes may indicate security-relevant transcript isolation issues.";
}

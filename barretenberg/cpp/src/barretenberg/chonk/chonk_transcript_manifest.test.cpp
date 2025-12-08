/**
 * @file chonk_transcript_manifest.test.cpp
 * @brief Transcript manifest pinning and atomic index invariant tests for Chonk IVC
 *
 * @details These tests ensure transcript structure stability and proper isolation
 * of transcript instances across the Chonk IVC flow. They verify:
 *
 * 1. Component Transcript Manifest Pinning - Pins the transcript structure for key
 *    Chonk components (Merge, ECCVM, Translator, etc.) to detect accidental changes
 *    that could break backwards compatibility or introduce security vulnerabilities.
 *
 * 2. Transcript Atomic Index Invariants - Verifies that the unique_transcript_index
 *    is correctly incremented through app-kernel transitions and trailing kernels,
 *    ensuring proper isolation between transcript instances.
 *
 * The transcript manifest captures:
 * - Round structure (what data is sent/received in each round)
 * - Challenge labels (what challenges are derived in each round)
 * - Element labels and sizes (what commitments/evaluations are sent)
 *
 * The atomic index ensures:
 * - Each transcript instance gets a unique index
 * - Values from different transcripts cannot be mixed (OriginTag enforcement)
 * - Parallel IVC instances have non-overlapping index ranges
 */

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/chonk_verifier/chonk_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test fixture for transcript index invariant tests
 */
class ChonkTranscriptIndexTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Pin the exact number of transcripts created during IVC accumulation of 2 app circuits
 * @details This test ensures the transcript creation count during accumulation is a fixed constant.
 * Any change to this count indicates a structural change in how transcripts are managed, which
 * could have security implications (e.g., unexpected transcript isolation or sharing).
 *
 * The 2-app IVC flow creates 7 circuits: app0 -> kernel0 -> app1 -> kernel1 -> reset -> tail -> hiding
 *
 * Per-circuit transcript breakdown (from complete_kernel_circuit_logic):
 * - App circuits (0, 2): 0 transcripts - use native HN folding prover
 * - Non-hiding kernels (1, 3, 4, 5): 3 transcripts each:
 *     1. accumulation_recursive_transcript - shared across HN/Merge recursive verification
 *     2. PairingPoints::aggregate_multiple - for batching pairing points with Fiat-Shamir separator
 *     3. hash_transcript - for computing accumulator hash to propagate in public inputs
 * - Hiding kernel (6): 2 transcripts (no hash_transcript since it doesn't propagate an accumulator):
 *     1. accumulation_recursive_transcript
 *     2. PairingPoints::aggregate_multiple
 *
 * Total: 0 + 3 + 0 + 3 + 3 + 3 + 2 = 14 transcripts
 */
TEST_F(ChonkTranscriptIndexTests, TranscriptCountDuringAccumulationPinned)
{
    // Pinned expected transcript count for 2 app circuits
    constexpr size_t EXPECTED_TOTAL_TRANSCRIPTS = 14;
    constexpr size_t EXPECTED_NUM_CIRCUITS = 7;
    constexpr std::array<size_t, EXPECTED_NUM_CIRCUITS> EXPECTED_CIRCUIT_TRANSCRIPTS = { 0, 3, 0, 3, 3, 3, 2 };

    // Record transcript index before IVC
    size_t index_before_ivc = bb::unique_transcript_index.load();

    // Track indices at each circuit accumulation
    std::vector<size_t> indices_before_accumulation;
    std::vector<size_t> indices_after_accumulation;

    // Create IVC with 2 app circuits
    constexpr size_t NUM_APP_CIRCUITS = 2;
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
        << "Total transcript count during 2-app IVC accumulation changed. "
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
    auto vk = ivc.get_vk();
    EXPECT_TRUE(Chonk::verify(proof, vk)) << "IVC proof should verify";
}

// ============================================================================
// COMPREHENSIVE CHONK RECURSIVE VERIFIER TRANSCRIPT PINNING
// ============================================================================
// This section contains comprehensive tests that pin the ENTIRE transcript
// structure for the Chonk recursive verification flow. The transcript is
// shared across multiple sub-protocols within a kernel circuit:
//
// For each circuit in the verification queue:
// 1. Oink Verifier - vk_hash, public inputs, witness commitments, challenges
// 2. Sumcheck Verifier - gate challenges, univariates, evaluations
// 3. MultilinearBatching Verifier (for folding) - accumulator data, batching sumcheck
// 4. Merge Verifier - shift_size, table commitments, evaluations, KZG proof
//
// For HN_FINAL only:
// 5. Decider/Shplemini Verifier - opening proof
//
// The approach is to test each sub-protocol's native transcript manifest
// separately, which mirrors what the recursive verifier does in-circuit.
// ============================================================================

/**
 * @brief Test class for comprehensive Chonk recursive verifier transcript pinning
 * @details Tests the native transcript structure of all sub-protocols that comprise
 * the Chonk recursive verification flow. These tests pin the exact transcript structure
 * that would be replicated in-circuit by the recursive verifiers.
 */
class ChonkRecursiveTranscriptPinningTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = MegaFlavor;
    using FF = typename Flavor::FF;
    using Builder = MegaCircuitBuilder;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    // Element size constants
    static constexpr size_t frs_per_Fr = 1;
    static constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
    static constexpr size_t frs_per_uint32 = 1;
    static constexpr size_t NUM_WIRES = MegaExecutionTraceBlocks::NUM_WIRES;

    /**
     * @brief Helper to create a simple MegaCircuitBuilder with some gates
     */
    static Builder create_simple_circuit()
    {
        Builder builder;
        bb::MockCircuits::add_arithmetic_gates(builder, 4);
        bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        bb::MockCircuits::add_lookup_gates(builder);
        return builder;
    }
};

/**
 * @brief Pin the exact number of transcripts created during ChonkRecursiveVerifier::verify
 * @details The recursive Chonk verifier creates transcripts that are tracked via unique_transcript_index
 * (which is incremented for each in-circuit transcript creation). This test pins the exact count
 * to detect any changes in transcript management that could affect security.
 *
 * Expected breakdown (4 transcripts total):
 * - 1 transcript: chonk_rec_verifier_transcript (shared across MegaVerifier and GoblinVerifier)
 * - 3 additional transcripts: created by PairingPoints::aggregate() for Fiat-Shamir recursion separators
 *   (one for MegaVerifier result aggregation, two for Goblin sub-verifier result aggregations)
 */
TEST_F(ChonkRecursiveTranscriptPinningTests, ChonkRecursiveVerifierTranscriptCountPinned)
{
    using RecursiveVerifier = bb::stdlib::recursion::honk::ChonkRecursiveVerifier;

    // Create a minimal IVC and generate proof
    constexpr size_t NUM_APP_CIRCUITS = 1;
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ num_circuits };

    for (size_t j = 0; j < num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    auto proof = ivc.prove();
    auto vk = ivc.get_vk();

    // Perform recursive verification and track transcript creation
    // unique_transcript_index is only incremented for in-circuit transcripts (in_circuit == true)
    UltraCircuitBuilder builder;
    size_t index_before_verify = bb::unique_transcript_index.load();

    RecursiveVerifier verifier(&builder, vk.mega);
    RecursiveVerifier::StdlibProof stdlib_proof(builder, proof);
    [[maybe_unused]] auto output = verifier.verify(stdlib_proof);

    size_t index_after_verify = bb::unique_transcript_index.load();
    size_t transcripts_created = index_after_verify - index_before_verify;

    // Pin the exact number of transcripts created during recursive verification
    constexpr size_t EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY = 4;
    EXPECT_EQ(transcripts_created, EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY)
        << "ChonkRecursiveVerifier transcript count changed. "
        << "If intentional, update EXPECTED_TRANSCRIPTS_DURING_RECURSIVE_VERIFY. "
        << "Unexpected changes may indicate security-relevant transcript isolation issues.";
}

/**
 * @file batched_honk_translator.test.cpp
 * @brief Tests for BatchedHonkTranslatorProver and BatchedHonkTranslatorVerifier_.
 *
 * @details Sets up a minimal-but-realistic proving environment:
 *   - A standalone TranslatorCircuitBuilder (op_queue with mixed ECC ops, random translation challenges).
 *   - A simple MegaZK circuit for the hiding kernel (independent op_queue).
 *
 * The ECCVM and merge proofs are intentionally omitted; the translation challenges
 * (batching_challenge_v, evaluation_input_x) are drawn uniformly at random and
 * the accumulated_result is read directly from the translator witness polynomials.
 * This suffices to test that the batched sumcheck + Shplemini/KZG mechanism is sound.
 */
#include "batched_honk_translator_prover.hpp"
#include "batched_honk_translator_verifier.hpp"

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

#include <gtest/gtest.h>

using namespace bb;

class BatchedHonkTranslatorTests : public ::testing::Test {
  public:
    using FF = TranslatorFlavor::FF;
    using Fq = TranslatorFlavor::BF; // BN254 base field (= Grumpkin scalar field)
    using G1 = TranslatorFlavor::Commitment;
    using Transcript = NativeTranscript;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // -------------------------------------------------------------------------
    // Translator helpers (adapted from translator.test.cpp)
    // -------------------------------------------------------------------------

    static void add_random_ops(std::shared_ptr<ECCOpQueue>& op_queue, size_t count)
    {
        for (size_t i = 0; i < count; i++) {
            op_queue->random_op_ultra_only();
        }
    }

    static void add_mixed_ops(std::shared_ptr<ECCOpQueue>& op_queue, size_t count = 100)
    {
        auto P1 = G1::random_element();
        auto P2 = G1::random_element();
        auto z = FF::random_element();
        for (size_t i = 0; i < count; i++) {
            op_queue->add_accumulate(P1);
            op_queue->mul_accumulate(P2, z);
        }
        op_queue->eq_and_reset();
    }

    /**
     * @brief Build a translator circuit on a fresh op queue with random challenges.
     * @details Mirrors TranslatorTests::generate_test_circuit. No ECCVM: challenges are random.
     */
    static std::shared_ptr<TranslatorProvingKey> build_translator_key(const Fq& batching_challenge_v,
                                                                      const Fq& evaluation_input_x,
                                                                      size_t circuit_size_param = 500)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();
        // Construct zk_columns
        op_queue->construct_zk_columns();
        // Table with correct final structure for translator
        add_mixed_ops(op_queue, circuit_size_param / 2);
        add_random_ops(op_queue, TranslatorCircuitBuilder::NUM_RANDOM_OPS_END);
        // Merge with fixed append
        op_queue->merge_fixed_append(op_queue->get_append_offset_for_prover());

        TranslatorCircuitBuilder circuit(batching_challenge_v, evaluation_input_x, op_queue);
        return std::make_shared<TranslatorProvingKey>(circuit);
    }

    /**
     * @brief Read accumulated_result from the translator witness polynomials.
     * @details Must be called after TranslatorProver has been constructed (which initialises the commitment key).
     */
    static Fq get_accumulated_result(const std::shared_ptr<TranslatorProvingKey>& key)
    {
        const size_t RESULT_ROW = TranslatorFlavor::RESULT_ROW;
        auto& polys = key->proving_key->polynomials;
        return Fq(uint256_t(polys.accumulators_binary_limbs_0[RESULT_ROW]) +
                  (uint256_t(polys.accumulators_binary_limbs_1[RESULT_ROW]) << 68) +
                  (uint256_t(polys.accumulators_binary_limbs_2[RESULT_ROW]) << 136) +
                  (uint256_t(polys.accumulators_binary_limbs_3[RESULT_ROW]) << 204));
    }

    /**
     * @brief Build the expected transcript manifest for a BatchedHonkTranslator proof.
     *
     * @details The manifest structure (27 rounds, 0-26):
     *   Round 0: MegaZK Oink — vk_hash, public inputs, masking commitment, wire/databus commitments → eta
     *   Round 1: lookup counts/tags/W_4 → beta, gamma
     *   Round 2: logderiv inverses + Z_PERM + translator Oink (vk_hash, masking, 10 wires) → beta, gamma
     *   Round 3: translator Z_PERM → Sumcheck:alpha + 17 gate challenges
     *   Round 4: Libra masking commitment + Sum → Libra:Challenge
     *   Rounds 5..4+JOINT_LOG_N: joint sumcheck rounds (one per round); MegaZK evals sent before
     *     the first virtual round univariate (round 5+mega_zk_log_n); minicircuit evals sent in
     *     round 5+LOG_MINI_CIRCUIT_SIZE
     *   Round 5+JOINT_LOG_N: MegaZK evals (if mega_zk_log_n==JOINT_LOG_N) + translator evals
     *     + Libra stuff → rho
     *   Round 6+JOINT_LOG_N: Gemini fold commitments → Gemini:r
     *   Round 7+JOINT_LOG_N: Gemini evals + Libra evals → Shplonk:nu
     *   Round 8+JOINT_LOG_N: Shplonk:Q → Shplonk:z
     *   Round 9+JOINT_LOG_N: KZG:W
     *
     * @param num_mega_zk_pub_inputs  number of MegaZK public inputs
     */
    static TranscriptManifest build_expected_batched_manifest(const size_t num_mega_zk_pub_inputs)
    {
        using MZK = MegaZKFlavor;
        using Trans = TranslatorFlavor;

        constexpr size_t G = FrCodec::calc_num_fields<MZK::Commitment>(); // 4
        constexpr size_t Fr = 1;
        constexpr size_t JOINT_LOG_N = Trans::CONST_TRANSLATOR_LOG_N; // 17
        constexpr size_t LOG_MINI = Trans::LOG_MINI_CIRCUIT_SIZE;     // 13

        TranscriptManifest m;
        size_t round = 0;

        // ── Round 0: MegaZK Oink ──────────────────────────────────────────────────
        m.add_entry(round, "vk_hash", Fr);
        for (size_t i = 0; i < num_mega_zk_pub_inputs; ++i) {
            m.add_entry(round, "public_input_" + std::to_string(i), Fr);
        }
        m.add_entry(round, "W_L", G);
        m.add_entry(round, "W_R", G);
        m.add_entry(round, "W_O", G);
        for (size_t i = 1; i <= 4; ++i) {
            m.add_entry(round, "ECC_OP_WIRE_" + std::to_string(i), G);
        }
        // MegaZK keeps the kernel_calldata bus (the only bus the hiding kernel needs):
        // the calldata column + its read_counts ride the oink batch alongside the wires.
        m.add_entry(round, "KERNEL_CALLDATA", G);
        m.add_entry(round, "KERNEL_CALLDATA_READ_COUNTS", G);
        // No "eta" challenge in MegaZK (no memory / log-derivative lookup relation), so W_4
        // stays in the same FS round as the prior wire/bus commitments — no round break here.
        m.add_entry(round, "W_4", G);
        m.add_challenge(round, std::array<std::string, 2>{ "beta", "gamma" });
        round++;

        // ── Round 1: MegaZK Z_PERM + bus inverses + translator Oink ──────────────
        // (LOOKUP_INVERSES dropped — MegaZK has no lookup relation.)
        m.add_entry(round, "KERNEL_CALLDATA_INVERSES", G);
        m.add_entry(round, "Z_PERM", G);
        // Translator Oink: vk_hash, masking commitment, 10 wire commitments
        m.add_entry(round, "vk_hash", Fr);
        m.add_entry(round, "Gemini:masking_poly_comm", G);
        for (size_t i = 0; i < 4; ++i) {
            m.add_entry(round, "CONCATENATED_RANGE_CONSTRAINTS_" + std::to_string(i), G);
        }
        m.add_entry(round, "CONCATENATED_NON_RANGE", G);
        for (size_t i = 0; i < 5; ++i) {
            m.add_entry(round, "ORDERED_RANGE_CONSTRAINTS_" + std::to_string(i), G);
        }
        m.add_challenge(round, std::array<std::string, 2>{ "beta", "gamma" });
        round++;

        // ── Round 3: translator Z_PERM, then joint alpha + gate challenges ────────
        m.add_entry(round, "Z_PERM", G);
        m.add_challenge(round, "Sumcheck:alpha");
        m.add_challenge(round, "Sumcheck:gate_challenge");
        round++;

        // ── Round 4: Libra masking commitment + Sum ───────────────────────────────
        m.add_entry(round, "Libra:concatenation_commitment", G);
        m.add_entry(round, "Libra:Sum", Fr);
        m.add_challenge(round, "Libra:Challenge");
        round++;

        // ── Rounds 5..4+JOINT_LOG_N: joint sumcheck ──────────────────────────────
        for (size_t i = 0; i < JOINT_LOG_N; ++i) {
            // Translator mini-circuit evaluations are sent after round LOG_MINI_CIRCUIT_SIZE-1
            // and appear before univariate_{LOG_MINI} in the manifest.
            if (i == LOG_MINI) {
                m.add_entry(round, "Sumcheck:minicircuit_evaluations", Trans::NUM_MINICIRCUIT_EVALUATIONS);
            }
            m.add_entry(round, "Sumcheck:univariate_comm_" + std::to_string(i), G);
            m.add_entry(round, "Sumcheck:univariate_" + std::to_string(i) + "_eval_0", Fr);
            m.add_entry(round, "Sumcheck:univariate_" + std::to_string(i) + "_eval_1", Fr);
            m.add_challenge(round, "Sumcheck:u_" + std::to_string(i));
            round++;
        }

        // ── Post-sumcheck evaluations ─────────────────────────────────────────────
        // MegaZK evaluations are sent after all sumcheck rounds (real + virtual).
        m.add_entry(round, "Sumcheck:evaluations", MZK::NUM_ALL_ENTITIES);
        m.add_entry(round, "Sumcheck:evaluations_translator", Trans::NUM_FULL_CIRCUIT_EVALUATIONS);
        m.add_entry(round, "Libra:claimed_evaluation", Fr);
        m.add_entry(round, "Libra:grand_sum_commitment", G);
        m.add_entry(round, "Libra:quotient_commitment", G);
        m.add_challenge(round, "rho");
        round++;

        // ── Gemini fold commitments ───────────────────────────────────────────────
        for (size_t i = 1; i < JOINT_LOG_N; ++i) {
            m.add_entry(round, "Gemini:FOLD_" + std::to_string(i), G);
        }
        m.add_challenge(round, "Gemini:r");
        round++;

        // ── Gemini evaluations + Libra evals ─────────────────────────────────────
        for (size_t i = 1; i <= JOINT_LOG_N; ++i) {
            m.add_entry(round, "Gemini:a_" + std::to_string(i), Fr);
        }
        m.add_entry(round, "Libra:concatenation_eval", Fr);
        m.add_entry(round, "Libra:shifted_grand_sum_eval", Fr);
        m.add_entry(round, "Libra:grand_sum_eval", Fr);
        m.add_entry(round, "Libra:quotient_eval", Fr);
        m.add_challenge(round, "Shplonk:nu");
        round++;

        // ── Shplonk:Q ────────────────────────────────────────────────────────────
        m.add_entry(round, "Shplonk:Q", G);
        m.add_challenge(round, "Shplonk:z");
        round++;

        // ── KZG opening ──────────────────────────────────────────────────────────
        m.add_entry(round, "KZG:W", G);

        return m;
    }

    /**
     * @brief Commit to the four op-queue wire polynomials.
     * @details Mirrors the merge protocol's job; called after the commitment key is initialised.
     */
    static std::array<TranslatorFlavor::Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> commit_op_queue_wires(
        const std::shared_ptr<TranslatorProvingKey>& key)
    {
        auto& ck = key->proving_key->commitment_key;
        auto& polys = key->proving_key->polynomials;
        return {
            ck.commit(polys.op), ck.commit(polys.x_lo_y_hi), ck.commit(polys.x_hi_z_1), ck.commit(polys.y_lo_z_2)
        };
    }
};

// =============================================================================
// BatchedHonkTranslatorTests::ProveAndVerify
// =============================================================================
TEST_F(BatchedHonkTranslatorTests, ProveAndVerify)
{
    using MegaZKFlavor = MegaZKFlavor;
    using MegaZKProverInst = ProverInstance_<MegaZKFlavor>;
    using MegaZKVK = MegaZKFlavor::VerificationKey;
    using MegaZKVKAndHash = MegaZKFlavor::VKAndHash;

    // -------------------------------------------------------------------------
    // 1. Translator inputs (random translation challenges — no ECCVM needed).
    // -------------------------------------------------------------------------
    const Fq batching_challenge_v = Fq::random_element();
    const Fq evaluation_input_x = Fq::random_element();

    auto translator_key = build_translator_key(batching_challenge_v, evaluation_input_x);

    // Initialise the translator commitment key (normally done by TranslatorProver ctor).
    {
        auto tmp = std::make_shared<Transcript>();
        TranslatorProver init_prover(translator_key, tmp); // side-effect: initialises commitment_key
    }
    const Fq accumulated_result = get_accumulated_result(translator_key);
    const auto op_queue_wire_commitments = commit_op_queue_wires(translator_key);

    // -------------------------------------------------------------------------
    // 2. Hiding kernel inputs: pad to JOINT_LOG_N = 17 so hiding_log_n == JOINT_LOG_N.
    // -------------------------------------------------------------------------
    MegaCircuitBuilder mega_zk_circuit;
    GoblinMockCircuits::construct_simple_circuit(mega_zk_circuit);
    // Pad so that hiding_log_n == JOINT_LOG_N.  We aim for JOINT_LOG_N-1 as the arithmetic
    // target because MegaCircuitBuilder's execution-trace overhead grows the dyadic size by one.
    static constexpr size_t JOINT_LOG_N = BatchedHonkTranslatorProver::JOINT_LOG_N;
    MockCircuits::construct_arithmetic_circuit(mega_zk_circuit, JOINT_LOG_N - 1, /*include_public_inputs=*/false);

    auto mega_zk_inst = std::make_shared<MegaZKProverInst>(mega_zk_circuit);
    auto mega_zk_vk = std::make_shared<MegaZKVK>(mega_zk_inst->get_precomputed());
    auto mega_zk_vk_and_hash = std::make_shared<MegaZKVKAndHash>(mega_zk_vk);

    // -------------------------------------------------------------------------
    // 3. Prove.
    // -------------------------------------------------------------------------
    auto prover_transcript = std::make_shared<Transcript>();
    BatchedHonkTranslatorProver prover(mega_zk_inst, mega_zk_vk, prover_transcript);

    auto mega_zk_proof = prover.prove_mega_zk_oink();
    auto joint_proof = prover.prove(translator_key);

    // -------------------------------------------------------------------------
    // 4. Verify.
    // -------------------------------------------------------------------------
    auto verifier_transcript = std::make_shared<Transcript>();
    BatchedHonkTranslatorVerifier verifier(mega_zk_vk_and_hash, verifier_transcript);
    verifier.verify_mega_zk_oink(mega_zk_proof);
    auto result = verifier.verify(
        joint_proof, evaluation_input_x, batching_challenge_v, accumulated_result, op_queue_wire_commitments);

    EXPECT_TRUE(result.reduction_succeeded);
    EXPECT_TRUE(result.pairing_points.check());
}

// =============================================================================
// BatchedHonkTranslatorTests::VerifierManifestConsistency
// Checks that the prover and verifier Fiat-Shamir transcripts produce the same
// manifest (same sequence of send/receive/challenge entries), which pins the
// joint proof structure and detects any prover/verifier protocol divergence.
// =============================================================================
TEST_F(BatchedHonkTranslatorTests, VerifierManifestConsistency)
{
    using MegaZKProverInst = ProverInstance_<MegaZKFlavor>;
    using MegaZKVK = MegaZKFlavor::VerificationKey;
    using MegaZKVKAndHash = MegaZKFlavor::VKAndHash;

    const Fq batching_challenge_v = Fq::random_element();
    const Fq evaluation_input_x = Fq::random_element();

    auto translator_key = build_translator_key(batching_challenge_v, evaluation_input_x);
    {
        auto tmp = std::make_shared<Transcript>();
        TranslatorProver init_prover(translator_key, tmp);
    }
    const Fq accumulated_result = get_accumulated_result(translator_key);
    const auto op_queue_wire_commitments = commit_op_queue_wires(translator_key);

    MegaCircuitBuilder mega_zk_circuit;
    GoblinMockCircuits::construct_simple_circuit(mega_zk_circuit);

    auto mega_zk_inst = std::make_shared<MegaZKProverInst>(mega_zk_circuit);
    auto mega_zk_vk = std::make_shared<MegaZKVK>(mega_zk_inst->get_precomputed());
    auto mega_zk_vk_and_hash = std::make_shared<MegaZKVKAndHash>(mega_zk_vk);

    // Prove with manifest tracking enabled.
    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->enable_manifest();
    BatchedHonkTranslatorProver prover(mega_zk_inst, mega_zk_vk, prover_transcript);
    auto mega_zk_proof = prover.prove_mega_zk_oink();
    auto joint_proof = prover.prove(translator_key);

    // Verify with manifest tracking enabled.
    auto verifier_transcript = std::make_shared<Transcript>();
    verifier_transcript->enable_manifest();
    BatchedHonkTranslatorVerifier verifier(mega_zk_vk_and_hash, verifier_transcript);
    verifier.verify_mega_zk_oink(mega_zk_proof);
    [[maybe_unused]] auto _ = verifier.verify(
        joint_proof, evaluation_input_x, batching_challenge_v, accumulated_result, op_queue_wire_commitments);

    auto prover_manifest = prover_transcript->get_manifest();
    auto verifier_manifest = verifier_transcript->get_manifest();

    ASSERT_GT(prover_manifest.size(), 0);
    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], verifier_manifest[round])
            << "Prover/verifier manifest discrepancy in round " << round;
    }
}

// =============================================================================
// BatchedHonkTranslatorTests::ProverManifestConsistency
// Pins the joint transcript structure by comparing the prover manifest against
// a hard-coded expected manifest built from flavor constants. Detects any
// structural change in the Fiat-Shamir transcript ordering.
// =============================================================================
TEST_F(BatchedHonkTranslatorTests, ProverManifestConsistency)
{
    using MegaZKProverInst = ProverInstance_<MegaZKFlavor>;
    using MegaZKVK = MegaZKFlavor::VerificationKey;

    const Fq batching_challenge_v = Fq::random_element();
    const Fq evaluation_input_x = Fq::random_element();

    auto translator_key = build_translator_key(batching_challenge_v, evaluation_input_x);
    {
        auto tmp = std::make_shared<Transcript>();
        TranslatorProver init_prover(translator_key, tmp);
    }

    MegaCircuitBuilder mega_zk_circuit;
    GoblinMockCircuits::construct_simple_circuit(mega_zk_circuit);
    auto mega_zk_inst = std::make_shared<MegaZKProverInst>(mega_zk_circuit);
    auto mega_zk_vk = std::make_shared<MegaZKVK>(mega_zk_inst->get_precomputed());

    const size_t num_mega_zk_pub_inputs = mega_zk_inst->num_public_inputs();

    // Prove with manifest tracking enabled.
    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->enable_manifest();
    BatchedHonkTranslatorProver prover(mega_zk_inst, mega_zk_vk, prover_transcript);
    [[maybe_unused]] auto _ = prover.prove_mega_zk_oink();
    [[maybe_unused]] auto __ = prover.prove(translator_key);

    auto prover_manifest = prover_transcript->get_manifest();
    auto expected_manifest = build_expected_batched_manifest(num_mega_zk_pub_inputs);

    ASSERT_EQ(prover_manifest.size(), expected_manifest.size()) << "Manifest round count mismatch";
    for (size_t round = 0; round < expected_manifest.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], expected_manifest[round]) << "Manifest discrepancy in round " << round;
    }
}

// =============================================================================
// BatchedHonkTranslatorTests::ProveAndVerifySmallHiding
// Tests the variable circuit size path: hiding_log_n < JOINT_LOG_N.
// =============================================================================
TEST_F(BatchedHonkTranslatorTests, ProveAndVerifySmallHiding)
{
    using MegaZKFlavor = MegaZKFlavor;
    using MegaZKProverInst = ProverInstance_<MegaZKFlavor>;
    using MegaZKVK = MegaZKFlavor::VerificationKey;
    using MegaZKVKAndHash = MegaZKFlavor::VKAndHash;

    const Fq batching_challenge_v = Fq::random_element();
    const Fq evaluation_input_x = Fq::random_element();

    auto translator_key = build_translator_key(batching_challenge_v, evaluation_input_x);
    {
        auto tmp = std::make_shared<Transcript>();
        TranslatorProver init_prover(translator_key, tmp);
    }
    const Fq accumulated_result = get_accumulated_result(translator_key);
    const auto op_queue_wire_commitments = commit_op_queue_wires(translator_key);

    // Use a small hiding circuit — NOT padded to JOINT_LOG_N.
    // hiding_log_n will be well below 17, exercising the variable-size code paths.
    MegaCircuitBuilder mega_zk_circuit;
    GoblinMockCircuits::construct_simple_circuit(mega_zk_circuit);

    auto mega_zk_inst = std::make_shared<MegaZKProverInst>(mega_zk_circuit);
    auto mega_zk_vk = std::make_shared<MegaZKVK>(mega_zk_inst->get_precomputed());
    auto mega_zk_vk_and_hash = std::make_shared<MegaZKVKAndHash>(mega_zk_vk);

    auto prover_transcript = std::make_shared<Transcript>();
    BatchedHonkTranslatorProver prover(mega_zk_inst, mega_zk_vk, prover_transcript);
    auto mega_zk_proof = prover.prove_mega_zk_oink();
    auto joint_proof = prover.prove(translator_key);

    auto verifier_transcript = std::make_shared<Transcript>();
    BatchedHonkTranslatorVerifier verifier(mega_zk_vk_and_hash, verifier_transcript);
    verifier.verify_mega_zk_oink(mega_zk_proof);
    auto result = verifier.verify(
        joint_proof, evaluation_input_x, batching_challenge_v, accumulated_result, op_queue_wire_commitments);

    EXPECT_TRUE(result.reduction_succeeded);
    EXPECT_TRUE(result.pairing_points.check());
}

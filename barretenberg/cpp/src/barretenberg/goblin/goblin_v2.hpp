#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/goblin/goblin_v2_types.hpp"
#include "barretenberg/goblin/poseidon2_merge_prover.hpp"
#include "barretenberg/goblin/poseidon2_merge_verifier.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/poseidon2_final/poseidon2_final_verifier.hpp"

namespace bb {

/**
 * @brief Extended Goblin with deferred Poseidon2 hash verification.
 *
 * @details Manages both the ECC op queue (inherited from Goblin) and a Poseidon2 op queue.
 * At each IVC iteration, both merge protocols run. At the end, the Poseidon2 final proof
 * verifies all accumulated hashes.
 *
 * IVC flow per iteration:
 *   1. Circuit creates gates (Poseidon2 hashes deferred to poseidon2_op_queue)
 *   2. OinkProver commits to all witness polynomials (including poseidon2_op_wires)
 *   3. ECC MergeProver proves ECC op subtable concatenation
 *   4. Poseidon2 MergeProver proves Poseidon2 op subtable concatenation
 *   5. HyperNova folding accumulates the circuit
 *
 * Final proof construction:
 *   1. ECC merge (APPEND mode for hiding kernel) → goblin_proof.merge_proof
 *   2. ECCVM + IPA → goblin_proof.eccvm_proof, ipa_proof
 *   3. Translator → goblin_proof.translator_proof
 *   4. Poseidon2 merge (APPEND mode) → poseidon2_merge_proof
 *   5. Poseidon2 final proof → poseidon2_final_proof
 */
class GoblinV2 : public Goblin {
  public:
    using Poseidon2MergeProof = Poseidon2MergeProver::MergeProof;
    using Poseidon2MergeRecursiveVerifier = stdlib::recursion::goblin::Poseidon2MergeRecursiveVerifier<MegaBuilder>;
    using Poseidon2TableCommitments = Poseidon2MergeVerifier::TableCommitments;
    using RecursivePoseidon2TableCommitments = Poseidon2MergeRecursiveVerifier::TableCommitments;
    using Poseidon2MergeCommitments = Poseidon2MergeVerifier::InputCommitments;
    using RecursivePoseidon2MergeCommitments = Poseidon2MergeRecursiveVerifier::InputCommitments;

    std::shared_ptr<Poseidon2OpQueue> poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>();

    GoblinV2Proof goblin_v2_proof;

    std::deque<Poseidon2MergeProof> poseidon2_merge_verification_queue;

    GoblinV2(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : Goblin(transcript)
    {}

    /**
     * @brief Construct a Poseidon2 merge proof and queue it for verification.
     */
    void prove_poseidon2_merge(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>(),
                               const MergeSettings merge_settings = MergeSettings::PREPEND)
    {
        BB_BENCH_NAME("GoblinV2::prove_poseidon2_merge");
        Poseidon2MergeProver merge_prover{ poseidon2_op_queue, transcript, merge_settings };
        poseidon2_merge_verification_queue.push_back(merge_prover.construct_proof());
    }

    /**
     * @brief Construct the final Poseidon2 proof verifying all accumulated hashes.
     * @details Uses UltraProver_<Poseidon2SingleRowFlavor> for the proof, then the
     * Poseidon2FinalVerifier substitutes op wire commitments for verification.
     */
    void prove_poseidon2_final()
    {
        BB_BENCH_NAME("GoblinV2::prove_poseidon2_final");
        // Build the Poseidon2SingleRowFlavor circuit from the op queue data
        MegaBuilder builder;
        auto all_ops = poseidon2_op_queue->get_all_ops();
        for (const auto& op : all_ops) {
            builder.create_poseidon2_single_row_gate(op.input);
        }

        // Prove using standard UltraProver pipeline
        using Poseidon2Prover = UltraProver_<Poseidon2SingleRowFlavor>;
        auto prover_instance = std::make_shared<ProverInstance_<Poseidon2SingleRowFlavor>>(builder);
        auto vk = std::make_shared<Poseidon2SingleRowFlavor::VerificationKey>(prover_instance->get_precomputed());
        Poseidon2Prover prover(prover_instance, vk);
        goblin_v2_proof.poseidon2_final_proof = prover.construct_proof();
    }

    /**
     * @brief Construct full GoblinV2 proof (Goblin proofs + Poseidon2 proofs).
     */
    GoblinV2Proof prove()
    {
        BB_BENCH_NAME("GoblinV2::prove");

        // Standard Goblin: ECC merge (APPEND) + ECCVM + Translator
        prove_merge(transcript, MergeSettings::APPEND);
        goblin_v2_proof.merge_proof = merge_verification_queue.back();

        prove_eccvm();
        goblin_v2_proof.eccvm_proof = goblin_proof.eccvm_proof;
        goblin_v2_proof.ipa_proof = goblin_proof.ipa_proof;

        prove_translator();
        goblin_v2_proof.translator_proof = goblin_proof.translator_proof;

        // Poseidon2: merge (APPEND) + final proof
        prove_poseidon2_merge(transcript, MergeSettings::APPEND);
        goblin_v2_proof.poseidon2_merge_proof = poseidon2_merge_verification_queue.back();

        prove_poseidon2_final();

        return goblin_v2_proof;
    }

    /**
     * @brief Recursively verify the next Poseidon2 merge proof in the queue.
     */
    std::pair<PairingPoints, RecursivePoseidon2TableCommitments> recursively_verify_poseidon2_merge(
        MegaBuilder& builder,
        const RecursivePoseidon2MergeCommitments& merge_commitments,
        const std::shared_ptr<RecursiveTranscript>& transcript,
        const MergeSettings merge_settings = MergeSettings::PREPEND)
    {
        BB_ASSERT(!poseidon2_merge_verification_queue.empty());
        const Poseidon2MergeProof& merge_proof = poseidon2_merge_verification_queue.front();
        const stdlib::Proof<MegaBuilder> stdlib_merge_proof(builder, merge_proof);

        Poseidon2MergeRecursiveVerifier merge_verifier{ merge_settings, transcript };
        auto merge_result = merge_verifier.reduce_to_pairing_check(stdlib_merge_proof, merge_commitments);

        poseidon2_merge_verification_queue.pop_front();

        return { merge_result.pairing_points, merge_result.merged_commitments };
    }
};

} // namespace bb

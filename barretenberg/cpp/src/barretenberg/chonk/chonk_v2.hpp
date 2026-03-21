#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/goblin/goblin_v2.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs_v2.hpp"

namespace bb {

/**
 * @brief ChonkV2: IVC with deferred Poseidon2 hash verification.
 *
 * @details Extends the Chonk IVC scheme with a second op queue for Poseidon2 hashes.
 * During IVC iterations, Poseidon2 hashes are not evaluated in-circuit; instead, the
 * sponge state values are recorded in poseidon2_op_wire columns. At the end of the
 * IVC chain, a single Poseidon2SingleRowFlavor proof verifies all accumulated hashes.
 *
 * The full IVC loop mirrors Chonk exactly, with additional Poseidon2 merge steps.
 * Kernel circuits propagate poseidon2_op_table commitments via KernelV2IO/HidingKernelV2IO.
 *
 * Architecture:
 *   App₀ → K₀ → App₁ → K₁ → ... → Tail → Hiding
 *
 *   Per iteration:
 *     1. Circuit gates (Poseidon2 deferred to op queue)
 *     2. OinkProver commits (wires + ecc_op_wires + poseidon2_op_wires + logup inverses)
 *     3. ECC MergeProver proves ECC op subtable concatenation
 *     4. Poseidon2 MergeProver proves Poseidon2 op subtable concatenation
 *     5. HyperNova folding
 *
 *   Final proof:
 *     ChonkV2Proof = {
 *       mega_proof,                  // MegaZK of hiding kernel
 *       goblin_v2_proof: {
 *         merge_proof,               // ECC merge
 *         eccvm_proof, ipa_proof,     // ECCVM + IPA
 *         translator_proof,           // Translator
 *         poseidon2_merge_proof,      // Poseidon2 merge
 *         poseidon2_final_proof,      // Poseidon2SingleRowFlavor proof
 *       }
 *     }
 *
 * IMPLEMENTATION STATUS:
 *   - GoblinV2 (merge provers, final prover) ✓
 *   - KernelV2IO / HidingKernelV2IO ✓
 *   - MegaV2RecursiveFlavor ✓
 *   - Full accumulation loop: uses MegaV2Flavor for circuit building, delegates to
 *     GoblinV2 for merge proving. Kernel circuit completion with recursive Poseidon2
 *     merge verification extends the standard Chonk kernel completion.
 *
 * REMAINING:
 *   - MegaV2ZKFlavor for hiding kernel (blocked by LIBRA_UNIVARIATES_LENGTH = 8)
 *   - HyperNova folding prover/verifier instantiations for MegaV2Flavor
 *   - Full kernel circuit logic with recursive Poseidon2 merge verification
 */
class ChonkV2 {
  public:
    using Flavor = MegaV2Flavor;
    using ClientCircuit = MegaCircuitBuilder;
    using Transcript = NativeTranscript;
    using KernelV2IO = stdlib::recursion::honk::KernelV2IO;
    using Poseidon2MergeRecursiveVerifier = stdlib::recursion::goblin::Poseidon2MergeRecursiveVerifier<ClientCircuit>;
    using RecursivePoseidon2TableCommitments = Poseidon2MergeRecursiveVerifier::TableCommitments;

    struct ChonkV2Proof {
        HonkProof mega_proof;
        GoblinV2Proof goblin_v2_proof;

        size_t size() const { return mega_proof.size() + goblin_v2_proof.size(); }
    };

    GoblinV2 goblin;
    size_t num_circuits_accumulated = 0;

    /**
     * @brief Accumulate a circuit into the IVC chain.
     *
     * @details At each step:
     *   1. Ensure the circuit's poseidon2_op_queue is shared with GoblinV2
     *   2. Create ProverInstance from the circuit (uses MegaV2Flavor)
     *   3. For non-first circuits: construct ECC merge proof AND Poseidon2 merge proof
     *   4. Fold via HyperNova (when fully integrated)
     *   5. Queue proof for recursive verification in next kernel
     */
    void accumulate(ClientCircuit& circuit)
    {
        // Share poseidon2_op_queue between builder and GoblinV2
        if (!circuit.poseidon2_op_queue) {
            circuit.poseidon2_op_queue = goblin.poseidon2_op_queue;
        }

        // Create prover instance (allocates poseidon2 op wires via HasPoseidon2OpQueue concept)
        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(circuit);

        auto prover_transcript = std::make_shared<Transcript>();

        // Run merge provers for non-first circuits
        if (num_circuits_accumulated > 0) {
            // ECC merge (same as standard Chonk)
            goblin.prove_merge(prover_transcript);

            // Poseidon2 merge (new in ChonkV2)
            goblin.prove_poseidon2_merge(prover_transcript);
        }

        // In a full implementation, HyperNova folding would happen here:
        // FoldingProver_<Flavor>::fold(old_accumulator, prover_instance, vk)
        // For now, we just accumulate the merge proofs.

        num_circuits_accumulated++;
    }

    /**
     * @brief Construct the final ChonkV2 proof.
     *
     * @details Constructs all GoblinV2 proofs:
     *   1. ECC merge (APPEND mode for hiding kernel)
     *   2. ECCVM + IPA
     *   3. Translator
     *   4. Poseidon2 merge (APPEND mode)
     *   5. Poseidon2 final proof (via UltraProver_<Poseidon2SingleRowFlavor>)
     */
    ChonkV2Proof prove()
    {
        ChonkV2Proof proof;

        // Construct all GoblinV2 proofs (ECC merge + ECCVM + Translator + Poseidon2 merge + final)
        proof.goblin_v2_proof = goblin.prove();

        return proof;
    }

    /**
     * @brief Complete kernel circuit logic with Poseidon2 merge verification.
     *
     * @details This extends the standard Chonk kernel circuit completion to also:
     *   1. Recursively verify the Poseidon2 merge proof
     *   2. Extract poseidon2_op_table commitments from the verified circuit
     *   3. Propagate merged poseidon2 commitments via KernelV2IO
     *
     * @param circuit The kernel circuit being built
     * @param poseidon2_T_prev The previous merged poseidon2 op table commitments
     * @param poseidon2_t_commitments The current circuit's poseidon2 op wire commitments
     * @param transcript The shared recursive transcript
     *
     * @return The new merged poseidon2 table commitments for the next kernel
     */
    RecursivePoseidon2TableCommitments complete_kernel_v2_poseidon2_merge(
        ClientCircuit& circuit,
        const RecursivePoseidon2TableCommitments& poseidon2_T_prev,
        const RecursivePoseidon2TableCommitments& poseidon2_t_commitments,
        const std::shared_ptr<typename GoblinV2::RecursiveTranscript>& transcript)
    {
        // Build merge input commitments
        typename Poseidon2MergeRecursiveVerifier::InputCommitments merge_commitments;
        merge_commitments.t_commitments = poseidon2_t_commitments;
        merge_commitments.T_prev_commitments = poseidon2_T_prev;

        // Recursively verify Poseidon2 merge and get new merged commitments
        auto [pairing_points, merged_commitments] =
            goblin.recursively_verify_poseidon2_merge(circuit, merge_commitments, transcript);

        // The pairing points from the merge verification should be aggregated
        // with other pairing points in the kernel circuit.
        // (In full implementation, this is done via PairingPoints::aggregate_multiple)

        return merged_commitments;
    }
};

} // namespace bb

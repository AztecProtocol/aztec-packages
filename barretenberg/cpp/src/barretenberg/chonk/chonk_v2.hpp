#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/goblin/goblin_v2.hpp"

namespace bb {

/**
 * @brief ChonkV2: IVC with deferred Poseidon2 hash verification.
 *
 * @details Extends the Chonk IVC scheme with a second op queue for Poseidon2 hashes.
 * During IVC iterations, Poseidon2 hashes are not evaluated in-circuit; instead, the
 * sponge state values are recorded in poseidon2_op_wire columns. At the end of the
 * IVC chain, a single Poseidon2SingleRowFlavor proof verifies all accumulated hashes.
 *
 * Key differences from Chonk:
 *   - Uses GoblinV2 instead of Goblin (manages both ECC + Poseidon2 op queues)
 *   - Each accumulate() step runs BOTH ECC merge AND Poseidon2 merge
 *   - prove() constructs the Poseidon2 final proof in addition to the Goblin proofs
 *   - Kernel circuits recursively verify BOTH merge protocols
 *   - Proof structure includes poseidon2_merge_proof and poseidon2_final_proof
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
 * NOTE: This is a skeleton implementation. Full integration requires:
 *   - MegaV2 recursive flavor (for recursive verification in kernels)
 *   - Extended KernelIO with poseidon2 op table commitments (Phase G)
 *   - Poseidon2 merge recursive verification in kernel circuits (Phase H)
 *   - MegaV2Flavor-based HyperNova folding prover/verifier
 *
 * The GoblinV2 class handles the proof construction; this class handles
 * the IVC accumulation loop and kernel circuit completion.
 */
class ChonkV2 {
  public:
    // The flavor used for IVC circuits. In the full implementation, this would be MegaV2Flavor.
    // For now, we use MegaFlavor since the folding infrastructure needs MegaV2 recursive types.
    using Flavor = MegaFlavor; // TODO: switch to MegaV2Flavor when recursive flavor is available
    using ClientCircuit = MegaCircuitBuilder;
    using Transcript = NativeTranscript;

    GoblinV2 goblin;

    size_t num_circuits_accumulated = 0;

    /**
     * @brief Accumulate a circuit into the IVC chain.
     *
     * @details In the full implementation, this would:
     *   1. Create ProverInstance from the circuit
     *   2. Run ECC merge (via goblin.prove_merge())
     *   3. Run Poseidon2 merge (via goblin.prove_poseidon2_merge())
     *   4. Fold via HyperNova
     *   5. Queue the proof for recursive verification in the next kernel
     */
    void accumulate(ClientCircuit& circuit)
    {
        // Initialize poseidon2_op_queue on the builder if not already done
        if (!circuit.poseidon2_op_queue) {
            circuit.poseidon2_op_queue = goblin.poseidon2_op_queue;
        }

        // TODO: Full accumulation logic (HyperNova folding, merge proving, etc.)
        // For now, just run the merge provers to accumulate op wire commitments
        auto prover_transcript = std::make_shared<Transcript>();

        if (num_circuits_accumulated > 0) {
            goblin.prove_merge(prover_transcript);
            goblin.prove_poseidon2_merge(prover_transcript);
        }

        num_circuits_accumulated++;
    }

    /**
     * @brief Construct the final ChonkV2 proof.
     *
     * @details Constructs:
     *   1. The hiding kernel's MegaZK proof (from standard Chonk flow)
     *   2. GoblinV2 proofs (ECC merge + ECCVM + Translator + Poseidon2 merge + Poseidon2 final)
     *
     * @return The complete proof containing all sub-proofs
     */
    struct ChonkV2Proof {
        HonkProof mega_proof;
        GoblinV2Proof goblin_v2_proof;

        size_t size() const { return mega_proof.size() + goblin_v2_proof.size(); }
    };

    ChonkV2Proof prove()
    {
        ChonkV2Proof proof;

        // TODO: Extract mega_proof from the hiding kernel accumulation
        // proof.mega_proof = ...

        // Construct all GoblinV2 proofs (ECC + Poseidon2)
        proof.goblin_v2_proof = goblin.prove();

        return proof;
    }
};

} // namespace bb

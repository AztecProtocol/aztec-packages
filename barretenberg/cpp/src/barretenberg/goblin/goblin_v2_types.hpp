#pragma once

#include "barretenberg/goblin/types.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"

namespace bb {

/**
 * @brief Extended proof structure for GoblinV2 (Goblin + deferred Poseidon2).
 *
 * @details Extends GoblinProof with the Poseidon2 merge proof and final proof.
 * The Poseidon2 merge proves correct concatenation of poseidon2_op_wire subtables
 * across IVC iterations. The final proof verifies all accumulated Poseidon2 hashes
 * via the Poseidon2SingleRowFlavor.
 */
struct GoblinV2Proof {
    // Standard Goblin sub-proofs
    HonkProof merge_proof;
    HonkProof eccvm_proof;
    HonkProof ipa_proof;
    HonkProof translator_proof;

    // Poseidon2-specific sub-proofs
    HonkProof poseidon2_merge_proof;
    HonkProof poseidon2_final_proof;

    size_t size() const
    {
        return merge_proof.size() + eccvm_proof.size() + ipa_proof.size() + translator_proof.size() +
               poseidon2_merge_proof.size() + poseidon2_final_proof.size();
    }

    bool operator==(const GoblinV2Proof& other) const = default;
};

} // namespace bb

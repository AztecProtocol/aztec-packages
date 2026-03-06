#pragma once

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"

namespace bb {

/**
 * @brief Batch verifier for multiple Chonk IVC proofs.
 * @details Runs all non-IPA verification (MegaZK, databus, Goblin) for each proof independently,
 * then batches the resulting IPA opening claims into a single IPA verification via random linear combination.
 * This replaces N separate large SRS MSMs with one, giving ~Nx speedup on the IPA bottleneck.
 */
class ChonkBatchVerifier {
  public:
    struct Input {
        ChonkProof proof;
        std::shared_ptr<MegaZKFlavor::VKAndHash> vk_and_hash;
    };

    /**
     * @brief Verify multiple Chonk proofs with batched IPA verification.
     * @details For each proof, performs all non-IPA verification (MegaZK, databus, Goblin).
     * If all pass, collects IPA claims and batch-verifies them with a single SRS MSM.
     * Returns true only if ALL proofs verify. On failure, does not identify which proof failed.
     *
     * @param inputs Span of (proof, vk_and_hash) pairs to verify
     * @return true if all proofs verify
     */
    static bool verify(std::span<const Input> inputs);
};

} // namespace bb

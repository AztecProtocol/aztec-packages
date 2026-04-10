#pragma once

#include "barretenberg/flavor/chonk_g_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

/**
 * @brief The output of the split Chonk prover: two small proofs replacing one large ChonkProof.
 *
 * @details Instead of transmitting a ChonkProof (~1330 FE) to the rollup, the client proves
 * two circuits (Chonk_B over BN254, Chonk_G over Grumpkin) and sends these proofs instead.
 *   - chonk_b_proof: UltraZK proof verifying field arithmetic (KZG/BN254, ~410 FE)
 *   - chonk_g_proof: ChonkG proof verifying EC operations (IPA/Grumpkin)
 *   - ipa_proof: ECCVM IPA proof (forwarded unchanged for deferred IPA verification)
 */
struct SplitChonkProof {
    HonkProof chonk_b_proof;
    HonkProof chonk_g_proof;
    HonkProof ipa_proof;

    std::shared_ptr<UltraZKFlavor::VerificationKey> chonk_b_vk;
    std::shared_ptr<ChonkGFlavor::VerificationKey> chonk_g_vk;

    size_t total_proof_size() const { return chonk_b_proof.size() + chonk_g_proof.size() + ipa_proof.size(); }
};

} // namespace bb

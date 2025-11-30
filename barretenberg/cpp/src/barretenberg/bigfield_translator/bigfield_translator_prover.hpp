// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/light_zk_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

namespace bb {

/**
 * @brief Prover for the bigfield-based translator circuit.
 *
 * @details Replaces the TranslatorProver with a simpler bigfield-based approach using LightZKFlavor.
 * The translator verifies that the ECCVM's accumulated result matches the op queue contents.
 */
class BigfieldTranslatorProver {
  public:
    using Flavor = LightZKFlavor;
    using FF = typename Flavor::FF;
    using BF = curve::BN254::BaseField; // Fq - the non-native field
    using Commitment = typename Flavor::Commitment;
    using Transcript = typename Flavor::Transcript;
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;

    /**
     * @brief Construct a BigfieldTranslatorProver.
     *
     * @param op_queue The ECC op queue containing the operation data
     * @param evaluation_input_x The evaluation point x from ECCVM
     * @param batching_challenge_v The batching challenge v from ECCVM
     * @param transcript Optional transcript (creates new one if not provided)
     */
    BigfieldTranslatorProver(const std::shared_ptr<ECCOpQueue>& op_queue,
                             const BF& evaluation_input_x,
                             const BF& batching_challenge_v,
                             const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    HonkProof construct_proof();

    std::shared_ptr<VerificationKey> get_verification_key() const { return verification_key; }

    BF get_accumulated_result() const { return accumulated_result; }

    std::shared_ptr<Transcript> transcript;

  private:
    std::shared_ptr<ProverInstance> prover_instance;
    std::shared_ptr<VerificationKey> verification_key;
    BF accumulated_result;
};

} // namespace bb

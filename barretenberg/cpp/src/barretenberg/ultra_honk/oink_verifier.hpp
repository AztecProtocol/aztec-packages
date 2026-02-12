// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Verifier class for all the pre-sumcheck rounds, which are shared between the folding verifier and ultra
 * verifier.
 *
 * Works with both native and recursive flavors. When instantiated with a recursive flavor (IsRecursiveFlavor<Flavor>),
 * automatically handles the differences in VK access and VK hash assertion.
 *
 * @tparam Flavor Native or recursive flavor
 */
template <typename Flavor> class OinkVerifier {
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Instance = bb::VerifierInstance_<Flavor>;

  public:
    OinkVerifier(const std::shared_ptr<Instance>& verifier_instance,
                 const std::shared_ptr<Transcript>& transcript,
                 size_t num_public_inputs)
        : transcript(transcript)
        , verifier_instance(verifier_instance)
        , num_public_inputs(num_public_inputs)
    {}

    void verify();

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Instance> verifier_instance;
    typename Flavor::CommitmentLabels comm_labels;
    bb::RelationParameters<FF> relation_parameters;
    WitnessCommitments witness_comms;
    size_t num_public_inputs;
    void receive_vk_hash_and_public_inputs();
    void receive_wire_commitments();
    void receive_lookup_counts_and_w4_commitments();
    void receive_logderiv_commitments();
    void receive_z_perm_commitment();
};
} // namespace bb

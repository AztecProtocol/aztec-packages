// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief The VerifierInstance encapsulates all the necessary information for a Honk Verifier to verify a
 * proof (sumcheck + Shplemini). In the context of folding, this is provided to the Hypernova verifier as an incoming
 * instance.
 * @details Works with both native and recursive flavors.
 */
template <typename Flavor_> class VerifierInstance_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using VKAndHash = typename Flavor::VKAndHash;

    std::shared_ptr<VKAndHash> vk_and_hash;

    std::vector<FF> public_inputs;

    FF alpha; // challenge whose powers batch subrelation contributions during Sumcheck
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;

    WitnessCommitments witness_commitments;

    Commitment gemini_masking_commitment; // ZK only: Gemini masking polynomial commitment

    explicit VerifierInstance_(std::shared_ptr<VKAndHash> vk_and_hash)
        : vk_and_hash(vk_and_hash)
    {}

    std::shared_ptr<VerificationKey> get_vk() const { return vk_and_hash->vk; }
};

} // namespace bb

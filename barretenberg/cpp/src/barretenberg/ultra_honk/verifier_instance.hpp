// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {

// Resolve the type for commitments received during Oink verification.
// BS=1: individual witness commitments (WitnessCommitments).
// BS>1: interleaved witness commitments (InterleavedCommitments).
template <typename Flavor, bool = IsMultiMegaFlavor<Flavor>> struct ReceivedCommitmentsOf {
    using type = typename Flavor::WitnessCommitments;
};
template <typename Flavor> struct ReceivedCommitmentsOf<Flavor, true> {
    using type = typename Flavor::InterleavedCommitments;
};

/**
 * @brief Encapsulates all information needed by a Honk verifier: VK, witness commitments, challenges.
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

    FF alpha;
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;

    // Commitments received during Oink verification.
    // For BS=1: individual witness commitments (WitnessCommitments).
    // For BS>1: interleaved witness commitments (InterleavedCommitments).
    // Both provide get_all() and get_shiftable().
    typename ReceivedCommitmentsOf<Flavor>::type received_commitments;

    Commitment gemini_masking_commitment; // ZK BS=1: Gemini masking polynomial commitment

    explicit VerifierInstance_(std::shared_ptr<VKAndHash> vk_and_hash)
        : vk_and_hash(vk_and_hash)
    {}

    std::shared_ptr<VerificationKey> get_vk() const { return vk_and_hash->vk; }
};

} // namespace bb

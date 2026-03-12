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

// Resolve InterleavedCommitments type: the real type for MultiMega flavors, empty struct otherwise
template <typename Flavor, bool = IsMultiMegaFlavor<Flavor>> struct InterleavedCommitmentsOf {
    struct type {};
};
template <typename Flavor> struct InterleavedCommitmentsOf<Flavor, true> {
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

    WitnessCommitments witness_commitments;

    // For MultiMega flavors (BATCH_SIZE > 1): stores interleaved witness commitments from oink
    typename InterleavedCommitmentsOf<Flavor>::type interleaved_commitments;

    Commitment gemini_masking_commitment; // ZK: Gemini masking polynomial commitment

    explicit VerifierInstance_(std::shared_ptr<VKAndHash> vk_and_hash)
        : vk_and_hash(vk_and_hash)
    {}

    std::shared_ptr<VerificationKey> get_vk() const { return vk_and_hash->vk; }
};

} // namespace bb

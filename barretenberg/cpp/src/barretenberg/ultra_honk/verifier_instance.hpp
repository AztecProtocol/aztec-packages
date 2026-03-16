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

/**
 * @brief Wraps WitnessCommitments with an additional masking commitment for ZK BS=1 flavors.
 * @details For ZK, the masking commitment is prepended to unshifted PCS commitments.
 *          The masking_commitment field and label are provided uniformly so that
 *          oink_verifier and build_pcs_commitments don't need to branch on BS.
 */
template <typename WitnessCommitments_, typename Commitment_> struct WitnessCommitmentsWithMasking
    : public WitnessCommitments_ {
    Commitment_ masking_commitment;
};

// Resolve the type for commitments received during Oink verification.
// BS=1 non-ZK: WitnessCommitments
// BS=1 ZK: WitnessCommitmentsWithMasking (wraps WitnessCommitments + masking field)
// BS>1: InterleavedCommitments (includes masking for ZK via interleaved_masking member)
template <typename Flavor, bool IsMulti = IsMultiMegaFlavor<Flavor>, bool HasZK = Flavor::HasZK>
struct ReceivedCommitmentsOf {
    using type = typename Flavor::WitnessCommitments; // BS=1, non-ZK
};
template <typename Flavor> struct ReceivedCommitmentsOf<Flavor, false, true> {
    using type =
        WitnessCommitmentsWithMasking<typename Flavor::WitnessCommitments, typename Flavor::Commitment>; // BS=1, ZK
};
template <typename Flavor, bool HasZK> struct ReceivedCommitmentsOf<Flavor, true, HasZK> {
    using type = typename Flavor::InterleavedCommitments; // BS>1 (ZK or not)
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
    // BS=1 non-ZK: individual witness commitments.
    // BS=1 ZK: witness commitments + masking commitment.
    // BS>1: interleaved witness commitments (includes masking for ZK).
    // All provide get_all() and get_shiftable().
    typename ReceivedCommitmentsOf<Flavor>::type received_commitments;

    explicit VerifierInstance_(std::shared_ptr<VKAndHash> vk_and_hash)
        : vk_and_hash(vk_and_hash)
    {}

    std::shared_ptr<VerificationKey> get_vk() const { return vk_and_hash->vk; }
};

} // namespace bb

#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief The DeciderVerificationKey encapsulates all the necessary information for a Mega Honk Verifier to verify a
 * proof (sumcheck + Shplemini). In the context of folding, this is returned by the Protogalaxy verifier with non-zero
 * target sum and gate challenges.
 *
 * @details This is ϕ in the paper.
 */
template <class Flavor, size_t NUM_ = 2> class DeciderVerificationKey_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;

    std::shared_ptr<VerificationKey> verification_key;

    bool is_accumulator = false;
    std::vector<FF> public_inputs;
    RelationSeparator alphas; // a challenge for each subrelation
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum{ 0 };

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    DeciderVerificationKey_() = default;
    DeciderVerificationKey_(std::shared_ptr<VerificationKey> vk)
        : verification_key(vk)
    {}

    MSGPACK_FIELDS(verification_key,
                   relation_parameters,
                   alphas,
                   is_accumulator,
                   public_inputs,
                   gate_challenges,
                   target_sum,
                   witness_commitments);
};
} // namespace bb
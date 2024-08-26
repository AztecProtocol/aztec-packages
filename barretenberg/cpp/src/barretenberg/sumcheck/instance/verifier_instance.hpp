#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief The VerifierInstance encapsulates all the necessary information for a Mega Honk Verifier to verify a
 * proof (sumcheck + Zeromorph). In the context of folding, this is returned by the Protogalaxy verifier with non-zero
 * target sum and gate challenges.
 *
 * @details This is ϕ in the paper.
 */
template <class Flavor, size_t NUM_ = 2> class VerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;

    std::shared_ptr<VerificationKey> verification_key;
    RelationParameters<FF> relation_parameters;
    RelationSeparator alphas;
    bool is_accumulator = false;
    std::vector<FF> public_inputs;

    // The folding parameters (\vec{β}, e) which are set for accumulators (i.e. relaxed instances).
    std::vector<FF> gate_challenges;
    FF target_sum{ 0 };

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    VerifierInstance_() = default;
    VerifierInstance_(std::shared_ptr<VerificationKey> vk)
        : verification_key(std::move(vk))
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
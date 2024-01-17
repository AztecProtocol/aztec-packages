#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"

namespace proof_system::honk {
template <class Flavor> class VerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;

    std::shared_ptr<VerificationKey> verification_key;
    std::vector<FF> public_inputs;
    size_t pub_inputs_offset = 0;
    size_t public_input_size;
    size_t instance_size;
    size_t log_instance_size;
    RelationParameters<FF> relation_parameters;
    RelationSeparator alphas;
    bool is_accumulator = false;

    // WORKTODO: why a vector?
    // The folding parameters (\vec{β}, e) which are set for accumulators (i.e. relaxed instances).
    std::vector<FF> gate_challenges;
    FF target_sum;

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    // WORKTODO: what should be set here?
    VerifierInstance_() = default;

    VerifierInstance_(const std::shared_ptr<ProverInstance_<Flavor>>& prover_instance)
        : public_inputs(std::move(prover_instance->public_inputs))
        , pub_inputs_offset(prover_instance->pub_inputs_offset)
        , public_input_size(prover_instance->public_inputs.size())
        , instance_size(prover_instance->instance_size)
        , log_instance_size(prover_instance->log_instance_size)
    {}
};
} // namespace proof_system::honk
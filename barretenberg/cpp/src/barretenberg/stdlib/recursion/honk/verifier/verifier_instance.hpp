#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
template <IsRecursiveFlavor Flavor> class VerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using CircuitBuilder = typename Flavor::CircuitBuilder;

    std::shared_ptr<VerificationKey> verification_key;
    std::vector<FF> public_inputs;
    size_t pub_inputs_offset = 0;
    size_t public_input_size;
    size_t instance_size;
    size_t log_instance_size;
    RelationParameters<FF> relation_parameters;
    RelationSeparator alphas;
    bool is_accumulator = false;

    // The folding parameters (\vec{β}, e) which are set for accumulators (i.e. relaxed instances).
    std::vector<FF> gate_challenges;
    FF target_sum;

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;
    VerifierInstance_(CircuitBuilder* builder, const std::shared_ptr<VerifierInstance_>& instance)
        : pub_inputs_offset(uint32_t(instance->pub_inputs_offset.get_value()))
        , public_input_size(uint32_t(instance->public_input_size.get_value()))
        , instance_size(uint32_t(instance->instance_size.get_value()))
        , log_instance_size(uint32_t(instance->log_instance_size.get_value()))
    {

        size_t public_input_idx = 0;
        public_inputs = std::vector<FF>(public_input_size);
        for (auto public_input : instance->public_inputs) {
            public_inputs[public_input_idx] = FF::from_witness(builder, public_input.get_value());
        }
        verification_key = std::make_shared<VerificationKey>(instance_size, public_input_size);
        for (auto [vk, other_vk] : zip_view(verification_key->get_all(), instance->verification_key->get_all())) {
            vk = Commitment::from_witness(builder, other_vk.get_value());
        }
    }
};
} // namespace bb
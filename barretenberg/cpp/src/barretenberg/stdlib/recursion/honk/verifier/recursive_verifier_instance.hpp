#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb::stdlib::recursion::honk {
template <IsRecursiveFlavor Flavor> class RecursiveVerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using Builder = typename Flavor::CircuitBuilder;

    Builder* builder;

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

    RecursiveVerifierInstance_() = default;

    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<NativeVerificationKey> vk)
        : builder(builder)
        , verification_key(std::make_shared<VerificationKey>(builder, vk))
    {}

    RecursiveVerifierInstance_(Builder* builder, const std::shared_ptr<RecursiveVerifierInstance_>& instance)
        : pub_inputs_offset((instance->pub_inputs_offset))
        , public_input_size((instance->public_input_size))
        , instance_size((instance->instance_size))
        , log_instance_size((instance->log_instance_size))
        , is_accumulator(bool(instance->is_accumulator))
    {

        size_t public_input_idx = 0;
        public_inputs = std::vector<FF>(public_input_size);
        for (auto public_input : instance->public_inputs) {
            public_inputs[public_input_idx] = FF::from_witness(builder, public_input.get_value());
        }
        verification_key = std::make_shared<VerificationKey>(instance_size, public_input_size);
        auto other_vks = instance->verification_key->get_all();
        size_t vk_idx = 0;
        for (auto& vk : verification_key->get_all()) {
            vk = Commitment::from_witness(builder, other_vks[vk_idx].get_value());
            vk_idx++;
        }
        for (size_t alpha_idx = 0; alpha_idx < alphas.size(); alpha_idx++) {
            alphas[alpha_idx] = FF::from_witness(builder, instance->alphas[alpha_idx].get_value());
        }

        auto other_comms = instance->witness_commitments.get_all();
        size_t comm_idx = 0;
        for (auto& comm : witness_commitments.get_all()) {
            comm = Commitment::from_witness(builder, other_comms[comm_idx].get_value());
            comm_idx++;
        }
        target_sum = FF::from_witness(builder, instance->target_sum.get_value());

        size_t challenge_idx = 0;
        gate_challenges = std::vector<FF>(instance->gate_challenges.size());
        for (auto& challenge : gate_challenges) {
            challenge = FF::from_witness(builder, instance->gate_challenges[challenge_idx].get_value());
            challenge_idx++;
        }
        relation_parameters.eta = FF::from_witness(builder, instance->relation_parameters.eta.get_value());
        relation_parameters.beta = FF::from_witness(builder, instance->relation_parameters.beta.get_value());
        relation_parameters.gamma = FF::from_witness(builder, instance->relation_parameters.gamma.get_value());
        relation_parameters.public_input_delta =
            FF::from_witness(builder, instance->relation_parameters.public_input_delta.get_value());
        relation_parameters.lookup_grand_product_delta =
            FF::from_witness(builder, instance->relation_parameters.lookup_grand_product_delta.get_value());
    }
};
} // namespace bb::stdlib::recursion::honk
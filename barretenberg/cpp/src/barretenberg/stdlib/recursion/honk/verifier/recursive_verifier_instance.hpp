#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/instance/verifier_instance.hpp"

namespace bb::stdlib::recursion::honk {
template <IsRecursiveFlavor Flavor> class RecursiveVerifierInstance_ {
  public:
    using FF = typename Flavor::FF;
    using NativeFF = typename Flavor::Curve::ScalarFieldNative;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using Builder = typename Flavor::CircuitBuilder;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using VerifierInstance = bb::VerifierInstance_<NativeFlavor>;

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

    RecursiveVerifierInstance_(Builder* builder)
        : builder(builder){};
    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<NativeVerificationKey> vk)
        : builder(builder)
        , verification_key(std::make_shared<VerificationKey>(builder, vk))
    {}

    RecursiveVerifierInstance_(Builder* builder, const std::shared_ptr<VerifierInstance>& instance)
        : pub_inputs_offset((instance->pub_inputs_offset))
        , public_input_size((instance->public_input_size))
        , instance_size((instance->instance_size))
        , log_instance_size((instance->log_instance_size))
        , is_accumulator(bool(instance->is_accumulator))
    {

        size_t public_input_idx = 0;
        public_inputs = std::vector<FF>(public_input_size);
        for (auto public_input : instance->public_inputs) {
            public_inputs[public_input_idx] = FF::from_witness(builder, public_input);
        }
        verification_key = std::make_shared<VerificationKey>(instance_size, public_input_size);
        auto other_vks = instance->verification_key->get_all();
        size_t vk_idx = 0;
        for (auto& vk : verification_key->get_all()) {
            vk = Commitment::from_witness(builder, other_vks[vk_idx]);
            vk_idx++;
        }
        for (size_t alpha_idx = 0; alpha_idx < alphas.size(); alpha_idx++) {
            alphas[alpha_idx] = FF::from_witness(builder, instance->alphas[alpha_idx]);
        }

        auto other_comms = instance->witness_commitments.get_all();
        size_t comm_idx = 0;
        for (auto& comm : witness_commitments.get_all()) {
            comm = Commitment::from_witness(builder, other_comms[comm_idx]);
            comm_idx++;
        }
        target_sum = FF::from_witness(builder, instance->target_sum);

        size_t challenge_idx = 0;
        gate_challenges = std::vector<FF>(instance->gate_challenges.size());
        for (auto& challenge : gate_challenges) {
            challenge = FF::from_witness(builder, instance->gate_challenges[challenge_idx]);
            challenge_idx++;
        }
        relation_parameters.eta = FF::from_witness(builder, instance->relation_parameters.eta);
        relation_parameters.eta_two = FF::from_witness(builder, instance->relation_parameters.eta_two);
        relation_parameters.eta_three = FF::from_witness(builder, instance->relation_parameters.eta_three);
        relation_parameters.beta = FF::from_witness(builder, instance->relation_parameters.beta);
        relation_parameters.gamma = FF::from_witness(builder, instance->relation_parameters.gamma);
        relation_parameters.public_input_delta =
            FF::from_witness(builder, instance->relation_parameters.public_input_delta);
        relation_parameters.lookup_grand_product_delta =
            FF::from_witness(builder, instance->relation_parameters.lookup_grand_product_delta);
    }

    VerifierInstance get_value()
    {
        VerifierInstance inst;
        inst.pub_inputs_offset = pub_inputs_offset;
        inst.public_input_size = public_input_size;
        inst.log_instance_size = log_instance_size;
        inst.instance_size = instance_size;
        inst.is_accumulator = is_accumulator;

        size_t public_input_idx = 0;
        inst.public_inputs = std::vector<NativeFF>(public_input_size);
        for (auto public_input : public_inputs) {
            inst.public_inputs[public_input_idx] = public_input.get_value();
        }
        inst.verification_key = std::make_shared<NativeVerificationKey>(instance_size, public_input_size);
        size_t vk_idx = 0;
        for (auto& vk : verification_key->get_all()) {
            inst.verification_key->get_all()[vk_idx] = vk.get_value();
            vk_idx++;
        }
        for (size_t alpha_idx = 0; alpha_idx < alphas.size(); alpha_idx++) {
            inst.alphas[alpha_idx] = alphas[alpha_idx].get_value();
        }

        size_t comm_idx = 0;
        for (auto& comm : witness_commitments.get_all()) {
            inst.witness_commitments.get_all()[comm_idx] = comm.get_value();
            comm_idx++;
        }
        inst.target_sum = target_sum.get_value();

        size_t challenge_idx = 0;
        inst.gate_challenges = std::vector<NativeFF>(gate_challenges.size());
        for (auto& challenge : inst.gate_challenges) {
            challenge = gate_challenges[challenge_idx].get_value();
            challenge_idx++;
        }
        inst.relation_parameters.eta = relation_parameters.eta.get_value();
        inst.relation_parameters.eta_two = relation_parameters.eta_two.get_value();
        inst.relation_parameters.eta_three = relation_parameters.eta_three.get_value();
        inst.relation_parameters.beta = relation_parameters.beta.get_value();
        inst.relation_parameters.gamma = relation_parameters.gamma.get_value();
        inst.relation_parameters.public_input_delta = relation_parameters.public_input_delta.get_value();
        inst.relation_parameters.lookup_grand_product_delta =
            relation_parameters.lookup_grand_product_delta.get_value();
        return inst;
    }
};
} // namespace bb::stdlib::recursion::honk
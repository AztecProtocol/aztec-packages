// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief The stdlib counterpart of DeciderVerificationKey, used in recursive folding verification.
 */
template <IsRecursiveFlavor Flavor> class RecursiveDeciderVerificationKey_ {
  public:
    using FF = typename Flavor::FF;
    using NativeFF = typename Flavor::Curve::ScalarFieldNative;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;
    using Builder = typename Flavor::CircuitBuilder;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using NativeVerificationKey = typename Flavor::NativeFlavor::VerificationKey;
    using NativeDeciderVerificationKey = bb::DeciderVerificationKey_<NativeFlavor>;
    using VerifierCommitmentKey = typename NativeFlavor::VerifierCommitmentKey;

    Builder* builder;

    std::shared_ptr<VKAndHash> vk_and_hash;

    bool is_accumulator = false;
    std::vector<FF> public_inputs;
    SubrelationSeparators alphas; // a challenge for each subrelation
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum{ 0 };

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    RecursiveDeciderVerificationKey_(Builder* builder)
        : builder(builder){};

    // Constructor from native vk
    RecursiveDeciderVerificationKey_(Builder* builder, std::shared_ptr<NativeVerificationKey> vk)
        : builder(builder)
        , vk_and_hash(std::make_shared<VKAndHash>(std::make_shared<VerificationKey>(builder, vk),
                                                  FF::from_witness(builder, vk->hash())))
    {}

    // Constructor from stdlib vk and hash
    RecursiveDeciderVerificationKey_(Builder* builder, std::shared_ptr<VKAndHash> vk_and_hash)
        : builder(builder)
        , vk_and_hash(vk_and_hash){};

    RecursiveDeciderVerificationKey_(Builder* builder, std::shared_ptr<NativeDeciderVerificationKey> verification_key)
        : RecursiveDeciderVerificationKey_(builder, verification_key->vk)
    {
        is_accumulator = verification_key->is_accumulator;
        if (is_accumulator) {

            for (auto [native_public_input] : zip_view(verification_key->public_inputs)) {
                public_inputs.emplace_back(FF::from_witness(builder, native_public_input));
            }
            for (size_t alpha_idx = 0; alpha_idx < alphas.size(); alpha_idx++) {
                alphas[alpha_idx] = FF::from_witness(builder, verification_key->alphas[alpha_idx]);
            }

            auto other_comms = verification_key->witness_commitments.get_all();
            size_t comm_idx = 0;
            for (auto& comm : witness_commitments.get_all()) {
                comm = Commitment::from_witness(builder, other_comms[comm_idx]);
                comm_idx++;
            }
            target_sum = FF::from_witness(builder, verification_key->target_sum);

            size_t challenge_idx = 0;
            gate_challenges = std::vector<FF>(verification_key->gate_challenges.size());
            for (auto& challenge : gate_challenges) {
                challenge = FF::from_witness(builder, verification_key->gate_challenges[challenge_idx]);
                challenge_idx++;
            }
            relation_parameters.eta = FF::from_witness(builder, verification_key->relation_parameters.eta);
            relation_parameters.eta_two = FF::from_witness(builder, verification_key->relation_parameters.eta_two);
            relation_parameters.eta_three = FF::from_witness(builder, verification_key->relation_parameters.eta_three);
            relation_parameters.beta = FF::from_witness(builder, verification_key->relation_parameters.beta);
            relation_parameters.gamma = FF::from_witness(builder, verification_key->relation_parameters.gamma);
            relation_parameters.public_input_delta =
                FF::from_witness(builder, verification_key->relation_parameters.public_input_delta);
            relation_parameters.lookup_grand_product_delta =
                FF::from_witness(builder, verification_key->relation_parameters.lookup_grand_product_delta);
        }
    }

    /**
     * @brief Return the underlying native DeciderVerificationKey.
     *
     * @details In the context of client IVC, we will have several iterations of recursive folding verification. The
     * RecursiveDeciderVerificationKey is tied to the builder in whose context it was created so in order to preserve
     * the accumulator values between several iterations we need to retrieve the native DeciderVerificationKey values.
     */
    NativeDeciderVerificationKey get_value()
    {
        using NativeVerificationKey = typename Flavor::NativeFlavor::VerificationKey;
        auto native_honk_vk = std::make_shared<NativeVerificationKey>(
            static_cast<uint64_t>(vk_and_hash->vk->circuit_size.get_value()),
            static_cast<uint64_t>(vk_and_hash->vk->num_public_inputs.get_value()));
        native_honk_vk->pub_inputs_offset = static_cast<uint64_t>(vk_and_hash->vk->pub_inputs_offset.get_value());
        native_honk_vk->pairing_inputs_public_input_key = vk_and_hash->vk->pairing_inputs_public_input_key;
        if constexpr (IsMegaFlavor<Flavor>) {
            native_honk_vk->databus_propagation_data = vk_and_hash->vk->databus_propagation_data;
        }

        for (auto [vk, final_decider_vk] : zip_view(vk_and_hash->vk->get_all(), native_honk_vk->get_all())) {
            final_decider_vk = vk.get_value();
        }

        NativeDeciderVerificationKey decider_vk(native_honk_vk);
        decider_vk.is_accumulator = is_accumulator;

        decider_vk.public_inputs = std::vector<NativeFF>(
            static_cast<size_t>(static_cast<uint32_t>(vk_and_hash->vk->num_public_inputs.get_value())));
        for (auto [public_input, inst_public_input] : zip_view(public_inputs, decider_vk.public_inputs)) {
            inst_public_input = public_input.get_value();
        }

        for (auto [alpha, inst_alpha] : zip_view(alphas, decider_vk.alphas)) {
            inst_alpha = alpha.get_value();
        }

        for (auto [comm, inst_comm] :
             zip_view(witness_commitments.get_all(), decider_vk.witness_commitments.get_all())) {
            inst_comm = comm.get_value();
        }
        decider_vk.target_sum = target_sum.get_value();

        decider_vk.gate_challenges = std::vector<NativeFF>(gate_challenges.size());
        for (auto [challenge, inst_challenge] : zip_view(gate_challenges, decider_vk.gate_challenges)) {
            inst_challenge = challenge.get_value();
        }

        decider_vk.relation_parameters.eta = relation_parameters.eta.get_value();
        decider_vk.relation_parameters.eta_two = relation_parameters.eta_two.get_value();
        decider_vk.relation_parameters.eta_three = relation_parameters.eta_three.get_value();
        decider_vk.relation_parameters.beta = relation_parameters.beta.get_value();
        decider_vk.relation_parameters.gamma = relation_parameters.gamma.get_value();
        decider_vk.relation_parameters.public_input_delta = relation_parameters.public_input_delta.get_value();
        decider_vk.relation_parameters.lookup_grand_product_delta =
            relation_parameters.lookup_grand_product_delta.get_value();
        return decider_vk;
    }
};
} // namespace bb::stdlib::recursion::honk

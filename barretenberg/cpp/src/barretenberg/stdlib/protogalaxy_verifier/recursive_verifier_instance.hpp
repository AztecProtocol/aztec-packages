// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief The stdlib counterpart of VerifierInstance, used in recursive folding verification.
 */
template <IsRecursiveFlavor Flavor_> class RecursiveVerifierInstance_ {
  public:
    using Flavor = Flavor_;
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
    using NativeVerifierInstance = bb::VerifierInstance_<NativeFlavor>;
    using VerifierCommitmentKey = typename NativeFlavor::VerifierCommitmentKey;
    using Transcript = typename Flavor::Transcript;

    Builder* builder;

    std::shared_ptr<VKAndHash> vk_and_hash;

    bool is_complete = false;      // whether this instance has been completely populated
    std::vector<FF> public_inputs; // to be extracted from the corresponding proof

    // An array {1, α₁, …, αₖ}, where k = NUM_SUBRELATIONS - 1.
    SubrelationSeparators alphas;
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum{ 0 };

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    RecursiveVerifierInstance_(Builder* builder)
        : builder(builder) {};

    // Constructor from native vk
    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<NativeVerificationKey> vk)
        : builder(builder)
        , vk_and_hash(std::make_shared<VKAndHash>(std::make_shared<VerificationKey>(builder, vk),
                                                  FF::from_witness(builder, vk->hash())))
    {}

    // Constructor from stdlib vk and hash
    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<VKAndHash> vk_and_hash)
        : builder(builder)
        , vk_and_hash(vk_and_hash) {};

    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<NativeVerifierInstance> verification_key)
        : RecursiveVerifierInstance_(builder, verification_key->vk)
    {
        is_complete = verification_key->is_complete;
        if (is_complete) {
            for (size_t alpha_idx = 0; alpha_idx < Flavor::NUM_SUBRELATIONS - 1; alpha_idx++) {
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
        }
    }

    /**
     * @brief Return the underlying native VerifierInstance.
     *
     * @details In the context of client IVC, we will have several iterations of recursive folding verification. The
     * RecursiveVerifierInstance is tied to the builder in whose context it was created so in order to preserve
     * the accumulator values between several iterations we need to retrieve the native VerifierInstance values.
     */
    NativeVerifierInstance get_value()
    {
        using NativeVerificationKey = typename Flavor::NativeFlavor::VerificationKey;
        auto native_honk_vk = std::make_shared<NativeVerificationKey>();
        native_honk_vk->log_circuit_size = static_cast<uint64_t>(vk_and_hash->vk->log_circuit_size.get_value());
        native_honk_vk->num_public_inputs = static_cast<uint64_t>(vk_and_hash->vk->num_public_inputs.get_value());
        native_honk_vk->pub_inputs_offset = static_cast<uint64_t>(vk_and_hash->vk->pub_inputs_offset.get_value());

        for (auto [vk, final_verifier_inst] : zip_view(vk_and_hash->vk->get_all(), native_honk_vk->get_all())) {
            final_verifier_inst = vk.get_value();
        }

        NativeVerifierInstance verifier_inst(native_honk_vk);
        verifier_inst.is_complete = is_complete;

        for (auto [alpha, inst_alpha] : zip_view(alphas, verifier_inst.alphas)) {
            inst_alpha = alpha.get_value();
        }

        for (auto [comm, inst_comm] :
             zip_view(witness_commitments.get_all(), verifier_inst.witness_commitments.get_all())) {
            inst_comm = comm.get_value();
        }
        verifier_inst.target_sum = target_sum.get_value();

        verifier_inst.gate_challenges = std::vector<NativeFF>(gate_challenges.size());
        for (auto [challenge, inst_challenge] : zip_view(gate_challenges, verifier_inst.gate_challenges)) {
            inst_challenge = challenge.get_value();
        }

        verifier_inst.relation_parameters.eta = relation_parameters.eta.get_value();
        verifier_inst.relation_parameters.eta_two = relation_parameters.eta_two.get_value();
        verifier_inst.relation_parameters.eta_three = relation_parameters.eta_three.get_value();
        verifier_inst.relation_parameters.beta = relation_parameters.beta.get_value();
        verifier_inst.relation_parameters.gamma = relation_parameters.gamma.get_value();
        verifier_inst.relation_parameters.public_input_delta = relation_parameters.public_input_delta.get_value();
        return verifier_inst;
    }

    FF hash_through_transcript(const std::string& domain_separator, Transcript& transcript) const
    {
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_log_circuit_size",
                                                  this->vk_and_hash->vk->log_circuit_size);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_num_public_inputs",
                                                  this->vk_and_hash->vk->num_public_inputs);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_pub_inputs_offset",
                                                  this->vk_and_hash->vk->pub_inputs_offset);

        for (const Commitment& commitment : this->vk_and_hash->vk->get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_precomputed_comm", commitment);
        }
        for (const Commitment& comm : witness_commitments.get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_wit_comm", comm);
        }
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_alphas", this->alphas);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_eta",
                                                  this->relation_parameters.eta);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_eta_two",
                                                  this->relation_parameters.eta_two);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_eta_three",
                                                  this->relation_parameters.eta_three);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_beta",
                                                  this->relation_parameters.beta);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_gamma",
                                                  this->relation_parameters.gamma);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_public_input_delta",
                                                  this->relation_parameters.public_input_delta);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_target_sum", this->target_sum);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_gate_challenges",
                                                  this->gate_challenges);

        return transcript.hash_independent_buffer();
    }
};
} // namespace bb::stdlib::recursion::honk

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief The VerifierInstance encapsulates all the necessary information for a Mega Honk Verifier to verify a
 * proof (sumcheck + Shplemini). In the context of folding, this is provided to the Hypernova verifier as an incoming
 * instance.
 */
template <IsUltraOrMegaHonk Flavor_> class VerifierInstance_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;
    using Transcript = typename Flavor::Transcript;

    std::shared_ptr<VerificationKey> vk;

    bool is_complete = false;      // whether this instance has been completely populated
    std::vector<FF> public_inputs; // to be extracted from the corresponding proof

    SubrelationSeparator alpha; // a challenge whose powers are used to batch subrelation contributions during Sumcheck
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    VerifierInstance_() = default;
    VerifierInstance_(std::shared_ptr<VerificationKey> vk)
        : vk(vk)
    {}

    /**
     * @brief Get the verification key
     * @return Verification key shared pointer
     */
    std::shared_ptr<VerificationKey> get_vk() const { return vk; }

    FF hash_through_transcript(const std::string& domain_separator, Transcript& transcript) const
    {
        BB_ASSERT_EQ(is_complete, true, "Trying to hash a verifier instance that has not been completed.");

        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_log_circuit_size",
                                                  this->vk->log_circuit_size);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_num_public_inputs",
                                                  this->vk->num_public_inputs);
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_pub_inputs_offset",
                                                  this->vk->pub_inputs_offset);

        for (const Commitment& commitment : this->vk->get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_precomputed_comm", commitment);
        }
        for (const Commitment& comm : witness_commitments.get_all()) {
            transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_wit_comm", comm);
        }
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_alpha", this->alpha);
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
        transcript.add_to_independent_hash_buffer(domain_separator + "verifier_inst_gate_challenges",
                                                  this->gate_challenges);

        return transcript.hash_independent_buffer();
    }

    MSGPACK_FIELDS(vk, relation_parameters, alpha, is_complete, gate_challenges, witness_commitments);
};

} // namespace bb

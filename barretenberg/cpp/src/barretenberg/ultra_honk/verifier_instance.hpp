// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {
/**
 * @brief The VerifierInstance encapsulates all the necessary information for a Mega Honk Verifier to verify a
 * proof (sumcheck + Shplemini). In the context of folding, this is returned by the Protogalaxy verifier with non-zero
 * target sum.
 *
 * @details This is \f$\phi\f$ in the Protogalaxy paper. It is the committed version of a ProverInstance_. With the
 * notation used in ProverInstance_, a prover instance is \f$\omega = (p_1, \dots, p_M, \theta_1, \dots, \theta_6,
 * \alpha_{1,1}, \dots, \alpha_{n,r_n})\f$ where the \f$p_i\f$'s are the prover polynomials, the \f$\theta_i\f$'s are
 * the relation parameters, and the \f$\alpha_{i,j}\f$'s are the subrelation batching parameters. Then, \f$\phi\f$ is
 * given by \f$\omega = ([p_1], \dots, [p_M], \theta_1, \dots, \theta_6, \alpha_{1,1}, \dots, \alpha_{n,r_n})\f$m where
 * [p_i] denotes the commitment to the i-th prover polynomial.
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
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accumulator
    FF target_sum{ 0 };

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

    /**
     * @brief Hash the verifier instance by tagging all components with origin tags and hashing directly.
     * @details Tags all instance components (VK, commitments, challenges) with transcript context to ensure
     * proper origin tag tracking for recursive verification.
     *
     * @param domain_separator (currently unused, kept for API compatibility)
     * @param transcript Used to extract tag context (transcript_index, round_index)
     * @return FF Hash of the verifier instance
     */
    FF hash_through_transcript([[maybe_unused]] const std::string& domain_separator, Transcript& transcript) const
    {
        BB_ASSERT_EQ(is_complete, true, "Trying to hash a verifier instance that has not been completed.");

        using Codec = typename Transcript::Codec;
        std::vector<FF> instance_elements;

        // Create origin tag for all instance components (securely extracts transcript state)
        const OriginTag tag = bb::create_transcript_tag(transcript);

        // Helper to tag, serialize, and append to instance_elements
        auto append_tagged = [&]<typename T>(const T& component) {
            auto frs = bb::tag_and_serialize<Transcript::in_circuit, Codec>(component, tag);
            instance_elements.insert(instance_elements.end(), frs.begin(), frs.end());
        };

        // Tag and serialize VK metadata
        append_tagged(this->vk->log_circuit_size);
        append_tagged(this->vk->num_public_inputs);
        append_tagged(this->vk->pub_inputs_offset);

        // Tag and serialize VK precomputed commitments
        for (const Commitment& commitment : this->vk->get_all()) {
            append_tagged(commitment);
        }

        // Tag and serialize witness commitments
        for (const Commitment& comm : witness_commitments.get_all()) {
            append_tagged(comm);
        }

        // Tag and serialize challenges and parameters
        append_tagged(this->alpha);
        append_tagged(this->relation_parameters.eta);
        append_tagged(this->relation_parameters.eta_two);
        append_tagged(this->relation_parameters.eta_three);
        append_tagged(this->relation_parameters.beta);
        append_tagged(this->relation_parameters.gamma);
        append_tagged(this->relation_parameters.public_input_delta);
        append_tagged(this->target_sum);
        append_tagged(this->gate_challenges);

        // Sanitize free witness tags before hashing
        bb::unset_free_witness_tags<Transcript::in_circuit, FF>(instance_elements);

        // Hash the tagged elements directly
        return Transcript::HashFunction::hash(instance_elements);
    }

    MSGPACK_FIELDS(vk, relation_parameters, alpha, is_complete, gate_challenges, target_sum, witness_commitments);
};

} // namespace bb

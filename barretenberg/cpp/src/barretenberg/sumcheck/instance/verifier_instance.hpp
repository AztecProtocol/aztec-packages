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
    RelationSeparator alphas;    // for folding flavor it's always going to be std::vector<FF>
    bool is_accumulator = false; // this is going to be a problem
    std::vector<FF> public_inputs;

    // The folding parameters (\vec{β}, e) which are set for accumulators (i.e. relaxed instances).
    std::vector<FF> gate_challenges;
    FF target_sum;

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    VerifierInstance_() = default;
    VerifierInstance_(std::shared_ptr<VerificationKey> vk)
        : verification_key(std::move(vk))
    {}

    std::vector<FF> to_buffer()
    {
        std::vector<FF> result;
        const auto insert = [&result](const std::vector<FF>& buf) {
            result.insert(result.end(), buf.begin(), buf.end());
        };

        auto serialised_vk = verification_key->to_field_elements();
        insert(serialised_vk);
        insert({ relation_parameters.eta,
                 relation_parameters.eta_two,
                 relation_parameters.eta_three,
                 relation_parameters.beta,
                 relation_parameters.gamma,
                 relation_parameters.public_input_delta,
                 relation_parameters.lookup_grand_product_delta }); // technically this should be enough?
        result.insert(result.end(), alphas.begin(), alphas.end());
        insert(public_inputs);
        insert(gate_challenges);
        result.emplace_back(target_sum);

        std::vector<FF> witness_commitments_as_field;
        for (auto comm : witness_commitments.get_all()) {
            std::vector<FF> comm_elements = bb::field_conversion::convert_to_bn254_frs(comm);
            witness_commitments_as_field.insert(
                witness_commitments_as_field.end(), comm_elements.begin(), comm_elements.end());
        }
        insert(witness_commitments_as_field);

        return result;
    }

    MSGPACK_FIELDS(
        verification_key, relation_parameters, alphas, public_inputs, gate_challenges, target_sum, witness_commitments);
};
} // namespace bb
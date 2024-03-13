#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/proof_system/library/grand_product_delta.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {

template <IsUltraFlavor Flavor> struct PreSumcheckOutput {
    bb::RelationParameters<typename Flavor::FF> relation_parameters;
    typename Flavor::VerifierCommitments commitments;
    uint32_t circuit_size;
    bool verified;
};

/**
 * @brief Verifier class for all the presumcheck rounds, which are shared between the folding verifier and ultra
 * verifier.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * @tparam Flavor
 */
template <IsUltraFlavor Flavor> class PreSumcheckVerifier {
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;

  public:
    PreSumcheckVerifier(const std::shared_ptr<VerificationKey>& verifier_key,
                        const std::shared_ptr<Transcript>& transcript,
                        std::string domain_separator = "")
        : transcript(transcript)
        , key(verifier_key)
        , domain_separator(std::move(domain_separator))
    {}

    void execute_preamble_round();

    void execute_wire_commitments_round();

    void execute_sorted_list_accumulator_round();

    void execute_log_derivative_inverse_round();

    void execute_grand_product_computation_round();

    PreSumcheckOutput<Flavor> execute_presumcheck_round()
    {
        using Commitment = typename Flavor::Commitment;
        using CommitmentLabels = typename Flavor::CommitmentLabels;

        bb::RelationParameters<FF> relation_parameters;
        VerifierCommitments commitments{ key };
        CommitmentLabels commitment_labels;

        // TODO(Adrian): Change the initialization of the transcript to take the VK hash?
        const auto circuit_size = transcript->template receive_from_prover<uint32_t>("circuit_size");
        const auto public_input_size = transcript->template receive_from_prover<uint32_t>("public_input_size");
        const auto pub_inputs_offset = transcript->template receive_from_prover<uint32_t>("pub_inputs_offset");

        ASSERT(circuit_size == key->circuit_size);
        ASSERT(public_input_size == key->num_public_inputs);
        ASSERT(pub_inputs_offset == key->pub_inputs_offset);

        std::vector<FF> public_inputs;
        for (size_t i = 0; i < public_input_size; ++i) {
            auto public_input_i = transcript->template receive_from_prover<FF>("public_input_" + std::to_string(i));
            public_inputs.emplace_back(public_input_i);
        }

        // Get commitments to first three wire polynomials
        commitments.w_l = transcript->template receive_from_prover<Commitment>(commitment_labels.w_l);
        commitments.w_r = transcript->template receive_from_prover<Commitment>(commitment_labels.w_r);
        commitments.w_o = transcript->template receive_from_prover<Commitment>(commitment_labels.w_o);

        // If Goblin, get commitments to ECC op wire polynomials and DataBus columns
        if constexpr (IsGoblinFlavor<Flavor>) {
            commitments.ecc_op_wire_1 =
                transcript->template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_1);
            commitments.ecc_op_wire_2 =
                transcript->template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_2);
            commitments.ecc_op_wire_3 =
                transcript->template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_3);
            commitments.ecc_op_wire_4 =
                transcript->template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_4);
            commitments.calldata = transcript->template receive_from_prover<Commitment>(commitment_labels.calldata);
            commitments.calldata_read_counts =
                transcript->template receive_from_prover<Commitment>(commitment_labels.calldata_read_counts);
        }

        // Get challenge for sorted list batching and wire four memory records
        FF eta = transcript->template get_challenge<FF>("eta");
        relation_parameters.eta = eta;

        // Get commitments to sorted list accumulator and fourth wire
        commitments.sorted_accum = transcript->template receive_from_prover<Commitment>(commitment_labels.sorted_accum);
        commitments.w_4 = transcript->template receive_from_prover<Commitment>(commitment_labels.w_4);

        // Get permutation challenges
        auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

        // If Goblin (i.e. using DataBus) receive commitments to log-deriv inverses polynomial
        if constexpr (IsGoblinFlavor<Flavor>) {
            commitments.lookup_inverses =
                transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_inverses);
        }

        const FF public_input_delta =
            compute_public_input_delta<Flavor>(public_inputs, beta, gamma, circuit_size, pub_inputs_offset);
        const FF lookup_grand_product_delta = compute_lookup_grand_product_delta<FF>(beta, gamma, circuit_size);

        relation_parameters.beta = beta;
        relation_parameters.gamma = gamma;
        relation_parameters.public_input_delta = public_input_delta;
        relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

        // Get commitment to permutation and lookup grand products
        commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);
        commitments.z_lookup = transcript->template receive_from_prover<Commitment>(commitment_labels.z_lookup);

        return PreSumcheckOutput<Flavor>{
            .relation_parameters = relation_parameters,
            .commitments = commitments,
            .circuit_size = circuit_size,
            .verified = true,
        };
    }

    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerificationKey> key;
    std::string domain_separator;
};
} // namespace bb
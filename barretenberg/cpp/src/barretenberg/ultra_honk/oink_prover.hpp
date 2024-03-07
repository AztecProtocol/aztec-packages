#pragma once
#include <utility>

#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Class for all the presumcheck rounds, which are shared between the folding prover and ultra prover.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * @tparam Flavor
 */
template <IsUltraFlavor Flavor> class OinkProver {
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Instance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;

  public:
    OinkProver(const std::shared_ptr<ProverInstance_<Flavor>>& inst,
               const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
               const std::shared_ptr<typename Flavor::Transcript>& transcript,
               std::string domain_separator = "")
        : instance(inst)
        , transcript(transcript)
        , commitment_key(commitment_key)
        , domain_separator(std::move(domain_separator))
    {
        instance->initialize_prover_polynomials();
    }

    void do_everything()
    {

        const auto instance_size = static_cast<uint32_t>(instance->proving_key->circuit_size);
        const auto num_public_inputs = static_cast<uint32_t>(instance->proving_key->num_public_inputs);
        transcript->send_to_verifier(domain_separator + "instance_size", instance_size);
        transcript->send_to_verifier(domain_separator + "public_input_size", num_public_inputs);

        for (size_t i = 0; i < instance->proving_key->public_inputs.size(); ++i) {
            auto public_input_i = instance->proving_key->public_inputs[i];
            transcript->send_to_verifier(domain_separator + "public_input_" + std::to_string(i), public_input_i);
        }
        transcript->send_to_verifier(domain_separator + "pub_inputs_offset",
                                     static_cast<uint32_t>(instance->proving_key->pub_inputs_offset));

        auto& witness_commitments = instance->witness_commitments;

        // Commit to the first three wire polynomials of the instance
        // We only commit to the fourth wire polynomial after adding memory recordss
        witness_commitments.w_l = commitment_key->commit(instance->proving_key->w_l);
        witness_commitments.w_r = commitment_key->commit(instance->proving_key->w_r);
        witness_commitments.w_o = commitment_key->commit(instance->proving_key->w_o);

        auto wire_comms = witness_commitments.get_wires();
        auto commitment_labels = instance->commitment_labels;
        auto wire_labels = commitment_labels.get_wires();
        for (size_t idx = 0; idx < 3; ++idx) {
            transcript->send_to_verifier(domain_separator + wire_labels[idx], wire_comms[idx]);
        }

        if constexpr (IsGoblinFlavor<Flavor>) {
            // Commit to Goblin ECC op wires
            witness_commitments.ecc_op_wire_1 = commitment_key->commit(instance->proving_key->ecc_op_wire_1);
            witness_commitments.ecc_op_wire_2 = commitment_key->commit(instance->proving_key->ecc_op_wire_2);
            witness_commitments.ecc_op_wire_3 = commitment_key->commit(instance->proving_key->ecc_op_wire_3);
            witness_commitments.ecc_op_wire_4 = commitment_key->commit(instance->proving_key->ecc_op_wire_4);

            auto op_wire_comms = instance->witness_commitments.get_ecc_op_wires();
            auto labels = commitment_labels.get_ecc_op_wires();
            for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
                transcript->send_to_verifier(domain_separator + labels[idx], op_wire_comms[idx]);
            }
            // Commit to DataBus columns
            witness_commitments.calldata = commitment_key->commit(instance->proving_key->calldata);
            witness_commitments.calldata_read_counts =
                commitment_key->commit(instance->proving_key->calldata_read_counts);
            transcript->send_to_verifier(domain_separator + commitment_labels.calldata,
                                         instance->witness_commitments.calldata);
            transcript->send_to_verifier(domain_separator + commitment_labels.calldata_read_counts,
                                         instance->witness_commitments.calldata_read_counts);
        }

        auto eta = transcript->template get_challenge<FF>(domain_separator + "eta");
        instance->compute_sorted_accumulator_polynomials(eta);

        // Commit to the sorted witness-table accumulator and the finalized (i.e. with memory records) fourth wire
        // polynomial
        witness_commitments.sorted_accum = commitment_key->commit(instance->prover_polynomials.sorted_accum);
        witness_commitments.w_4 = commitment_key->commit(instance->prover_polynomials.w_4);

        transcript->send_to_verifier(domain_separator + commitment_labels.sorted_accum,
                                     witness_commitments.sorted_accum);
        transcript->send_to_verifier(domain_separator + commitment_labels.w_4, witness_commitments.w_4);

        auto [beta, gamma] =
            transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");

        if constexpr (IsGoblinFlavor<Flavor>) {
            // Compute and commit to the logderivative inverse used in DataBus
            instance->compute_logderivative_inverse(beta, gamma);
            instance->witness_commitments.lookup_inverses =
                commitment_key->commit(instance->prover_polynomials.lookup_inverses);
            transcript->send_to_verifier(domain_separator + commitment_labels.lookup_inverses,
                                         instance->witness_commitments.lookup_inverses);
        }

        instance->compute_grand_product_polynomials(beta, gamma);

        witness_commitments.z_perm = commitment_key->commit(instance->prover_polynomials.z_perm);
        witness_commitments.z_lookup = commitment_key->commit(instance->prover_polynomials.z_lookup);

        transcript->send_to_verifier(domain_separator + commitment_labels.z_perm, instance->witness_commitments.z_perm);
        transcript->send_to_verifier(domain_separator + commitment_labels.z_lookup,
                                     instance->witness_commitments.z_lookup);
    }

    void execute_preamble_round();
    void execute_wire_commitments_round();
    void execute_sorted_list_accumulator_round();
    void execute_log_derivative_inverse_round();
    void execute_grand_product_computation_round();

    std::shared_ptr<Instance> instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<CommitmentKey> commitment_key;
    std::string domain_separator;
};
} // namespace bb
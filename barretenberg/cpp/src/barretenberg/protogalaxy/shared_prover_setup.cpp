#include "barretenberg/protogalaxy/shared_prover_setup.hpp"

namespace bb {

template <IsUltraFlavor Flavor>
void execute_preamble_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                             const std::shared_ptr<typename Flavor::Transcript>& transcript,
                             const std::string& domain_separator)
{
    const auto instance_size = static_cast<uint32_t>(instance->instance_size);
    const auto num_public_inputs = static_cast<uint32_t>(instance->public_inputs.size());
    transcript->send_to_verifier(domain_separator + "instance_size", instance_size);
    transcript->send_to_verifier(domain_separator + "public_input_size", num_public_inputs);
    transcript->send_to_verifier(domain_separator + "pub_inputs_offset",
                                 static_cast<uint32_t>(instance->pub_inputs_offset));

    ASSERT(instance->proving_key->num_public_inputs == instance->public_inputs.size());

    for (size_t i = 0; i < instance->public_inputs.size(); ++i) {
        auto public_input_i = instance->public_inputs[i];
        transcript->send_to_verifier(domain_separator + "public_input_" + std::to_string(i), public_input_i);
    }
}

template <IsUltraFlavor Flavor>
void execute_wire_commitments_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                     const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                     const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                     const std::string& domain_separator)
{
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
        witness_commitments.calldata_read_counts = commitment_key->commit(instance->proving_key->calldata_read_counts);
        transcript->send_to_verifier(domain_separator + commitment_labels.calldata,
                                     instance->witness_commitments.calldata);
        transcript->send_to_verifier(domain_separator + commitment_labels.calldata_read_counts,
                                     instance->witness_commitments.calldata_read_counts);
    }
}

template <IsUltraFlavor Flavor>
void execute_sorted_list_accumulator_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                            const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                            const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                            const std::string& domain_separator)
{
    auto& witness_commitments = instance->witness_commitments;
    const auto& commitment_labels = instance->commitment_labels;

    auto eta = transcript->template get_challenge<typename Flavor::FF>(domain_separator + "eta");
    instance->compute_sorted_accumulator_polynomials(eta);

    // Commit to the sorted witness-table accumulator and the finalized (i.e. with memory records) fourth wire
    // polynomial
    witness_commitments.sorted_accum = commitment_key->commit(instance->prover_polynomials.sorted_accum);
    witness_commitments.w_4 = commitment_key->commit(instance->prover_polynomials.w_4);

    transcript->send_to_verifier(domain_separator + commitment_labels.sorted_accum, witness_commitments.sorted_accum);
    transcript->send_to_verifier(domain_separator + commitment_labels.w_4, witness_commitments.w_4);
}

template <IsUltraFlavor Flavor>
void execute_log_derivative_inverse_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                           const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                           const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                           const std::string& domain_separator)
{
    const auto& commitment_labels = instance->commitment_labels;

    auto [beta, gamma] =
        transcript->template get_challenges<typename Flavor::FF>(domain_separator + "beta", domain_separator + "gamma");
    instance->relation_parameters.beta = beta;
    instance->relation_parameters.gamma = gamma;
    if constexpr (IsGoblinFlavor<Flavor>) {
        // Compute and commit to the logderivative inverse used in DataBus
        instance->compute_logderivative_inverse(beta, gamma);
        instance->witness_commitments.lookup_inverses =
            commitment_key->commit(instance->prover_polynomials.lookup_inverses);
        transcript->send_to_verifier(domain_separator + commitment_labels.lookup_inverses,
                                     instance->witness_commitments.lookup_inverses);
    }
}

template <IsUltraFlavor Flavor>
void execute_grand_product_computation_round_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                                              const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                                              const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                              const std::string& domain_separator)
{
    auto& witness_commitments = instance->witness_commitments;
    const auto& commitment_labels = instance->commitment_labels;

    instance->compute_grand_product_polynomials(instance->relation_parameters.beta,
                                                instance->relation_parameters.gamma);

    witness_commitments.z_perm = commitment_key->commit(instance->prover_polynomials.z_perm);
    witness_commitments.z_lookup = commitment_key->commit(instance->prover_polynomials.z_lookup);

    transcript->send_to_verifier(domain_separator + commitment_labels.z_perm, instance->witness_commitments.z_perm);
    transcript->send_to_verifier(domain_separator + commitment_labels.z_lookup, instance->witness_commitments.z_lookup);
}

template <IsUltraFlavor Flavor>
void prover_setup_(const std::shared_ptr<ProverInstance_<Flavor>>& instance,
                   const std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key,
                   const std::shared_ptr<typename Flavor::Transcript>& transcript,
                   const std::string& domain_separator)
{
    execute_preamble_round_(instance, transcript, domain_separator);
    execute_wire_commitments_round_(instance, commitment_key, transcript, domain_separator);
    execute_sorted_list_accumulator_round_(instance, commitment_key, transcript, domain_separator);
    execute_log_derivative_inverse_round_(instance, commitment_key, transcript, domain_separator);
    execute_grand_product_computation_round_(instance, commitment_key, transcript, domain_separator);
}

template void execute_preamble_round_<UltraFlavor>(const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
                                                   const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
                                                   const std::string& domain_separator);

template void execute_preamble_round_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_wire_commitments_round_<UltraFlavor>(
    const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
    const std::shared_ptr<typename UltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_wire_commitments_round_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_sorted_list_accumulator_round_<UltraFlavor>(
    const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
    const std::shared_ptr<typename UltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_sorted_list_accumulator_round_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_log_derivative_inverse_round_<UltraFlavor>(
    const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
    const std::shared_ptr<typename UltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_log_derivative_inverse_round_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_grand_product_computation_round_<UltraFlavor>(
    const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
    const std::shared_ptr<typename UltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void execute_grand_product_computation_round_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

template void prover_setup_<UltraFlavor>(const std::shared_ptr<ProverInstance_<UltraFlavor>>& instance,
                                         const std::shared_ptr<typename UltraFlavor::CommitmentKey>& commitment_key,
                                         const std::shared_ptr<typename UltraFlavor::Transcript>& transcript,
                                         const std::string& domain_separator);

template void prover_setup_<GoblinUltraFlavor>(
    const std::shared_ptr<ProverInstance_<GoblinUltraFlavor>>& instance,
    const std::shared_ptr<typename GoblinUltraFlavor::CommitmentKey>& commitment_key,
    const std::shared_ptr<typename GoblinUltraFlavor::Transcript>& transcript,
    const std::string& domain_separator);

} // namespace bb
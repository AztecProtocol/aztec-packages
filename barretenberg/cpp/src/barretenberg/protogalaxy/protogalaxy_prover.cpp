#include "protogalaxy_prover.hpp"
#include "barretenberg/flavor/flavor.hpp"
namespace proof_system::honk {
template <class ProverInstances>
void ProtoGalaxyProver_<ProverInstances>::finalise_and_send_instance(std::shared_ptr<Instance> instance,
                                                                     const std::string& domain_separator)
{
    instance->initialize_prover_polynomials();

    const auto instance_size = static_cast<uint32_t>(instance->instance_size);
    const auto num_public_inputs = static_cast<uint32_t>(instance->public_inputs.size());
    transcript->send_to_verifier(domain_separator + "_instance_size", instance_size);
    transcript->send_to_verifier(domain_separator + "_public_input_size", num_public_inputs);

    for (size_t i = 0; i < instance->public_inputs.size(); ++i) {
        auto public_input_i = instance->public_inputs[i];
        transcript->send_to_verifier(domain_separator + "_public_input_" + std::to_string(i), public_input_i);
    }
    transcript->send_to_verifier(domain_separator + "_pub_inputs_offset",
                                 static_cast<uint32_t>(instance->pub_inputs_offset));

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
        transcript->send_to_verifier(domain_separator + "_" + wire_labels[idx], wire_comms[idx]);
    }

    auto eta = transcript->get_challenge(domain_separator + "_eta");
    instance->compute_sorted_accumulator_polynomials(eta);

    // Commit to the sorted withness-table accumulator and the finalized (i.e. with memory records) fourth wire
    // polynomial
    witness_commitments.sorted_accum = commitment_key->commit(instance->prover_polynomials.sorted_accum);
    witness_commitments.w_4 = commitment_key->commit(instance->prover_polynomials.w_4);

    transcript->send_to_verifier(domain_separator + "_" + commitment_labels.sorted_accum,
                                 witness_commitments.sorted_accum);
    transcript->send_to_verifier(domain_separator + "_" + commitment_labels.w_4, witness_commitments.w_4);

    auto [beta, gamma] = transcript->get_challenges(domain_separator + "_beta", domain_separator + "_gamma");
    instance->compute_grand_product_polynomials(beta, gamma);

    witness_commitments.z_perm = commitment_key->commit(instance->prover_polynomials.z_perm);
    witness_commitments.z_lookup = commitment_key->commit(instance->prover_polynomials.z_lookup);

    transcript->send_to_verifier(domain_separator + "_" + commitment_labels.z_perm,
                                 instance->witness_commitments.z_perm);
    transcript->send_to_verifier(domain_separator + "_" + commitment_labels.z_lookup,
                                 instance->witness_commitments.z_lookup);

    instance->alpha = transcript->get_challenge(domain_separator + "_alpha");

    auto vk_view = instance->verification_key->get_all();
    auto labels = instance->commitment_labels.get_precomputed();
    for (size_t idx = 0; idx < labels.size(); idx++) {
        transcript->send_to_verifier(domain_separator + "_" + labels[idx], vk_view[idx]);
    }
}

template <class ProverInstances>
void ProtoGalaxyProver_<ProverInstances>::send_accumulator(std::shared_ptr<Instance> instance,
                                                           const std::string& domain_separator)
{
    const auto instance_size = static_cast<uint32_t>(instance->instance_size);
    const auto num_public_inputs = static_cast<uint32_t>(instance->public_inputs.size());
    transcript->send_to_verifier(domain_separator + "_instance_size", instance_size);
    transcript->send_to_verifier(domain_separator + "_public_input_size", num_public_inputs);

    for (size_t i = 0; i < instance->public_inputs.size(); ++i) {
        auto public_input_i = instance->public_inputs[i];
        transcript->send_to_verifier(domain_separator + "_public_input_" + std::to_string(i), public_input_i);
    }

    transcript->send_to_verifier(domain_separator + "_eta", instance->relation_parameters.eta);
    transcript->send_to_verifier(domain_separator + "_beta", instance->relation_parameters.beta);
    transcript->send_to_verifier(domain_separator + "_gamma", instance->relation_parameters.gamma);
    transcript->send_to_verifier(domain_separator + "_public_input_delta",
                                 instance->relation_parameters.public_input_delta);
    transcript->send_to_verifier(domain_separator + "_lookup_grand_product_delta",
                                 instance->relation_parameters.lookup_grand_product_delta);

    transcript->send_to_verifier(domain_separator + "_alpha", instance->alpha);

    auto folding_parameters = instance->folding_parameters;
    transcript->send_to_verifier(domain_separator + "_target_sum", folding_parameters.target_sum);
    for (size_t idx = 0; idx < folding_parameters.gate_challenges.size(); idx++) {
        transcript->send_to_verifier(domain_separator + "_gate_challenge_" + std::to_string(idx),
                                     folding_parameters.gate_challenges[idx]);
    }

    auto comm_view = instance->witness_commitments.get_all();
    auto witness_labels = instance->commitment_labels.get_witness();
    for (size_t idx = 0; idx < witness_labels.size(); idx++) {
        transcript->send_to_verifier(domain_separator + "_" + witness_labels[idx], comm_view[idx]);
    }

    auto vk_view = instance->verification_key->get_all();
    auto vk_labels = instance->commitment_labels.get_precomputed();
    for (size_t idx = 0; idx < vk_labels.size(); idx++) {
        transcript->send_to_verifier(domain_separator + "_" + vk_labels[idx], vk_view[idx]);
    }
}

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::prepare_for_folding()
{
    auto idx = 0;
    auto instance = instances[0];
    auto domain_separator = std::to_string(idx);
    transcript->send_to_verifier(domain_separator + "is_accumulator", instance->is_accumulator);
    if (instance->is_accumulator) {
        send_accumulator(instance, domain_separator);
    } else {
        finalise_and_send_instance(instance, domain_separator);
    }
    idx++;

    for (auto it = instances.begin() + 1; it != instances.end(); it++, idx++) {
        auto instance = *it;
        auto domain_separator = std::to_string(idx);
        finalise_and_send_instance(instance, domain_separator);
    }
}

// TODO(#https://github.com/AztecProtocol/barretenberg/issues/689): finalise implementation this function
template <class ProverInstances>
ProverFoldingResult<typename ProverInstances::Flavor> ProtoGalaxyProver_<ProverInstances>::fold_instances()
{
    prepare_for_folding();

    // TODO(#https://github.com/AztecProtocol/barretenberg/issues/740): Handle the case where we are folding for the
    // first time and accumulator is 0
    FF delta = transcript->get_challenge("delta");
    auto accumulator = get_accumulator();
    auto deltas = compute_round_challenge_pows(accumulator->log_instance_size, delta);

    auto perturbator = compute_perturbator(accumulator, deltas);
    for (size_t idx = 0; idx <= accumulator->log_instance_size; idx++) {
        transcript->send_to_verifier("perturbator_" + std::to_string(idx), perturbator[idx]);
    }
    assert(perturbator[0] == accumulator->folding_parameters.target_sum);
    auto perturbator_challenge = transcript->get_challenge("perturbator_challenge");
    instances.next_gate_challenges =
        update_gate_challenges(perturbator_challenge, accumulator->folding_parameters.gate_challenges, deltas);
    const auto pow_betas_star =
        compute_pow_polynomial_at_values(instances.next_gate_challenges, accumulator->instance_size);

    combine_relation_parameters(instances);
    combine_alpha(instances);
    auto combiner = compute_combiner(instances, pow_betas_star);

    auto compressed_perturbator = perturbator.evaluate(perturbator_challenge);
    auto combiner_quotient = compute_combiner_quotient(compressed_perturbator, combiner);

    for (size_t idx = ProverInstances::NUM; idx < ProverInstances::BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), combiner_quotient.value_at(idx));
    }
    auto combiner_challenge = transcript->get_challenge("combiner_quotient_challenge");

    ProverFoldingResult<Flavor> res;
    res.accumulator =
        compute_next_accumulator(instances, combiner_quotient, combiner_challenge, compressed_perturbator);
    res.folding_data = transcript->proof_data;

    return res;
}
template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::Ultra, 2>>;
template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk
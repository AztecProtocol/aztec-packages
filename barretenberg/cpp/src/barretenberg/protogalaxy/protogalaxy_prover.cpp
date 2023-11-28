#include "protogalaxy_prover.hpp"
#include "barretenberg/flavor/flavor.hpp"
namespace proof_system::honk {

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::prepare_for_folding()
{
    auto idx = 0;
    for (auto it = instances.begin(); it != instances.end(); it++, idx++) {
        auto instance = *it;
        auto domain_separator = std::to_string(idx);
        transcript.send_to_verifier(domain_separator + "is_accumulator", instance->is_accumulator);
        if (static_cast<bool>(instance->is_accumulator)) {
            const auto instance_size = static_cast<uint32_t>(instance->instance_size);
            const auto num_public_inputs = static_cast<uint32_t>(instance->public_inputs.size());

            transcript.send_to_verifier(domain_separator + "_instance_size", instance_size);
            transcript.send_to_verifier(domain_separator + "_public_input_size", num_public_inputs);

            for (size_t i = 0; i < instance->public_inputs.size(); ++i) {
                auto public_input_i = instance->public_inputs[i];
                transcript.send_to_verifier(domain_separator + "_public_input_" + std::to_string(i), public_input_i);
            }
            transcript.send_to_verifier(domain_separator + "_eta", instance->relation_parameters.eta);
            transcript.send_to_verifier(domain_separator + "_beta", instance->relation_parameters.beta);
            transcript.send_to_verifier(domain_separator + "_gamma", instance->relation_parameters.gamma);
            transcript.send_to_verifier(domain_separator + "_public_input_delta",
                                        instance->relation_parameters.public_input_delta);
            transcript.send_to_verifier(domain_separator + "_lookup_grand_product_delta",
                                        instance->relation_parameters.lookup_grand_product_delta);

            transcript.send_to_verifier(domain_separator + "_alpha", instance->alpha);

            auto folding_parameters = instance->folding_parameters;
            transcript.send_to_verifier(domain_separator + "_target_sum", folding_parameters.target_sum);
            for (size_t idx = 0; idx < folding_parameters.gate_separation_challenges.size(); idx++) {
                transcript.send_to_verifier(domain_separator + "_gate_challenge_" + std::to_string(idx),
                                            folding_parameters.gate_separation_challenges[idx]);
            }

        } else {
            instance->initialize_prover_polynomials();
            const auto instance_size = static_cast<uint32_t>(instance->instance_size);
            const auto num_public_inputs = static_cast<uint32_t>(instance->public_inputs.size());

            transcript.send_to_verifier(domain_separator + "_instance_size", instance_size);
            transcript.send_to_verifier(domain_separator + "_public_input_size", num_public_inputs);
            transcript.send_to_verifier(domain_separator + "_pub_inputs_offset",
                                        static_cast<uint32_t>(instance->pub_inputs_offset));

            for (size_t i = 0; i < num_public_inputs; ++i) {
                auto public_input_i = instance->public_inputs[i];
                transcript.send_to_verifier(domain_separator + "_public_input_" + std::to_string(i), public_input_i);
            }

            auto [eta, beta, gamma] = transcript.get_challenges(
                domain_separator + "_eta", domain_separator + "_beta", domain_separator + "_gamma");
            instance->compute_sorted_accumulator_polynomials(eta);
            instance->compute_grand_product_polynomials(beta, gamma);
            instance->alpha = transcript.get_challenge(domain_separator + "_alpha");
        }
        auto vk_view = instance->verification_key->pointer_view();
        auto labels = typename Flavor::CommitmentLabels().get_precomputed();
        for (size_t idx = 0; idx < labels.size(); idx++) {
            transcript.send_to_verifier(domain_separator + labels[idx], (*vk_view[idx]));
        }
    }

    fold_relation_parameters(instances);
    fold_alpha(instances);
}

// TODO(#https://github.com/AztecProtocol/barretenberg/issues/689): finalise implementation this function
template <class ProverInstances>
ProverFoldingResult<typename ProverInstances::Flavor> ProtoGalaxyProver_<ProverInstances>::fold_instances()
{
    prepare_for_folding();
    // TODO(#https://github.com/AztecProtocol/barretenberg/issues/740): Handle the case where we are folding for the
    // first time and accumulator is 0
    // TODO(#https://github.com/AztecProtocol/barretenberg/issues/763): Fold alpha
    auto delta = transcript.get_challenge("delta");
    info(delta);
    auto accumulator = get_accumulator();
    auto instance_size = accumulator->prover_polynomials.get_polynomial_size();
    const auto log_instance_size = static_cast<size_t>(numeric::get_msb(instance_size));
    auto deltas = compute_round_challenge_pows(log_instance_size, delta);

    auto perturbator = compute_perturbator(accumulator, deltas);
    for (size_t idx = 0; idx <= log_instance_size; idx++) {
        transcript.send_to_verifier("perturbator_" + std::to_string(idx), perturbator[idx]);
    }
    assert(perturbator[0] == accumulator->folding_parameters.target_sum);

    auto perturbator_challenge = transcript.get_challenge("perturbator_challenge");
    info("pc", perturbator_challenge);
    instances.betas_star = update_gate_separation_challenges(
        perturbator_challenge, accumulator->folding_parameters.gate_separation_challenges, deltas);

    auto combiner = compute_combiner(instances);

    auto compressed_perturbator = perturbator.evaluate(perturbator_challenge);
    auto combiner_quotient = compute_combiner_quotient(compressed_perturbator, combiner);

    for (size_t idx = ProverInstances::NUM; idx < ProverInstances::BATCHED_EXTENDED_LENGTH; idx++) {
        info(combiner_quotient.value_at(idx));
        transcript.send_to_verifier("combiner_quotient_" + std::to_string(idx), combiner_quotient.value_at(idx));
    }
    auto combiner_challenge = transcript.get_challenge("combiner_quotient_challenge");
    info("cc", combiner_challenge);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/764): Generalize these formulas as well as computation
    // of Lagrange basis

    auto thingy = compute_new_accumulator(instances, combiner_quotient, combiner_challenge, compressed_perturbator);

    ProverFoldingResult<Flavor> res;
    res.accumulator = thingy;
    res.folding_data = transcript.proof_data;
    return res;
}
template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::Ultra, 2>>;
// template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk
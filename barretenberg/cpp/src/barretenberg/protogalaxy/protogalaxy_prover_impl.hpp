#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "protogalaxy_prover.hpp"
namespace bb {
template <class ProverInstances>
void ProtoGalaxyProver_<ProverInstances>::finalise_and_send_instance(std::shared_ptr<Instance> instance,
                                                                     const std::string& domain_separator)
{
    OinkProver<Flavor> oink_prover(instance->proving_key, transcript, domain_separator + '_');

    auto [proving_key, relation_params, alphas] = oink_prover.prove();
    instance->proving_key = std::move(proving_key);
    instance->relation_parameters = std::move(relation_params);
    instance->alphas = std::move(alphas);
}

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::prepare_for_folding()
{
    auto idx = 0;
    auto instance = instances[0];
    auto domain_separator = std::to_string(idx);
    if (!instance->is_accumulator) {
        finalise_and_send_instance(instance, domain_separator);
        instance->target_sum = 0;
        instance->gate_challenges = std::vector<FF>(instance->proving_key.log_circuit_size, 0);
    }

    idx++;

    for (auto it = instances.begin() + 1; it != instances.end(); it++, idx++) {
        auto instance = *it;
        auto domain_separator = std::to_string(idx);
        finalise_and_send_instance(instance, domain_separator);
    }
}

template <class ProverInstances>
std::shared_ptr<typename ProverInstances::Instance> ProtoGalaxyProver_<ProverInstances>::compute_next_accumulator(
    ProverInstances& instances,
    Univariate<FF, ProverInstances::BATCHED_EXTENDED_LENGTH, ProverInstances::NUM>& combiner_quotient,
    FF& challenge,
    const FF& compressed_perturbator)
{
    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(challenge);

    // Given the challenge \gamma, compute Z(\gamma) and {L_0(\gamma),L_1(\gamma)}
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/764): Generalize the vanishing polynomial formula
    // and the computation of Lagrange basis for k instances
    FF vanishing_polynomial_at_challenge;
    std::array<FF, ProverInstances::NUM> lagranges;
    constexpr FF inverse_two = FF(2).invert();
    if constexpr (ProverInstances::NUM == 2) {
        vanishing_polynomial_at_challenge = challenge * (challenge - FF(1));
        lagranges = { FF(1) - challenge, challenge };
    } else if constexpr (ProverInstances::NUM == 3) {
        vanishing_polynomial_at_challenge = challenge * (challenge - FF(1)) * (challenge - FF(2));
        lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * inverse_two,
                      challenge * (FF(2) - challenge),
                      challenge * (challenge - FF(1)) / FF(2) };
    } else if constexpr (ProverInstances::NUM == 4) {
        constexpr FF inverse_six = FF(6).invert();
        vanishing_polynomial_at_challenge = challenge * (challenge - FF(1)) * (challenge - FF(2)) * (challenge - FF(3));
        lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * (FF(3) - challenge) * inverse_six,
                      challenge * (FF(2) - challenge) * (FF(3) - challenge) * inverse_two,
                      challenge * (challenge - FF(1)) * (FF(3) - challenge) * inverse_two,
                      challenge * (challenge - FF(1)) * (challenge - FF(2)) * inverse_six };
    }
    static_assert(ProverInstances::NUM < 5);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/881): bad pattern
    auto next_accumulator = std::move(instances[0]);
    next_accumulator->is_accumulator = true;

    // Compute the next target sum and send the next folding parameters to the verifier
    FF next_target_sum =
        compressed_perturbator * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;

    next_accumulator->target_sum = next_target_sum;
    next_accumulator->gate_challenges = instances.next_gate_challenges;

    // Initialize accumulator proving key polynomials
    auto accumulator_polys = next_accumulator->proving_key.polynomials.get_all();
    run_loop_in_parallel(Flavor::NUM_FOLDED_ENTITIES, [&](size_t start_idx, size_t end_idx) {
        for (size_t poly_idx = start_idx; poly_idx < end_idx; poly_idx++) {
            auto& acc_poly = accumulator_polys[poly_idx];
            for (auto& acc_el : acc_poly) {
                acc_el *= lagranges[0];
            }
        }
    });

    // Fold the proving key polynomials
    for (size_t inst_idx = 1; inst_idx < ProverInstances::NUM; inst_idx++) {
        auto input_polys = instances[inst_idx]->proving_key.polynomials.get_all();
        run_loop_in_parallel(Flavor::NUM_FOLDED_ENTITIES, [&](size_t start_idx, size_t end_idx) {
            for (size_t poly_idx = start_idx; poly_idx < end_idx; poly_idx++) {
                auto& acc_poly = accumulator_polys[poly_idx];
                auto& inst_poly = input_polys[poly_idx];
                for (auto [acc_el, inst_el] : zip_view(acc_poly, inst_poly)) {
                    acc_el += inst_el * lagranges[inst_idx];
                }
            }
        });
    }

    // Evaluate the combined batching  α_i univariate at challenge to obtain next α_i and send it to the
    // verifier, where i ∈ {0,...,NUM_SUBRELATIONS - 1}
    auto& folded_alphas = next_accumulator->alphas;
    for (size_t idx = 0; idx < NUM_SUBRELATIONS - 1; idx++) {
        folded_alphas[idx] = instances.alphas[idx].evaluate(challenge);
    }

    // Evaluate each relation parameter univariate at challenge to obtain the folded relation parameters and send to
    // the verifier
    auto& combined_relation_parameters = instances.relation_parameters;
    auto folded_relation_parameters = bb::RelationParameters<FF>{
        combined_relation_parameters.eta.evaluate(challenge),
        combined_relation_parameters.eta_two.evaluate(challenge),
        combined_relation_parameters.eta_three.evaluate(challenge),
        combined_relation_parameters.beta.evaluate(challenge),
        combined_relation_parameters.gamma.evaluate(challenge),
        combined_relation_parameters.public_input_delta.evaluate(challenge),
        combined_relation_parameters.lookup_grand_product_delta.evaluate(challenge),
    };
    next_accumulator->relation_parameters = folded_relation_parameters;
    next_accumulator->proving_key = std::move(instances[0]->proving_key);
    return next_accumulator;
}

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::preparation_round()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::preparation_round");
    prepare_for_folding();
};

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::perturbator_round()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::perturbator_round");
    state.accumulator = get_accumulator();
    FF delta = transcript->template get_challenge<FF>("delta");
    state.deltas = compute_round_challenge_pows(state.accumulator->proving_key.log_circuit_size, delta);
    state.perturbator =
        LegacyPolynomial<FF>(state.accumulator->proving_key.log_circuit_size + 1); // initialize to all zeros
    // compute perturbator only if this is not the first round and has an accumulator
    if (state.accumulator->is_accumulator) {
        state.perturbator = compute_perturbator(state.accumulator, state.deltas);
        // Prover doesn't send the constant coefficient of F because this is supposed to be equal to the target sum of
        // the accumulator which the folding verifier has from the previous iteration.
        for (size_t idx = 1; idx <= state.accumulator->proving_key.log_circuit_size; idx++) {
            transcript->send_to_verifier("perturbator_" + std::to_string(idx), state.perturbator[idx]);
        }
    }
};

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::combiner_quotient_round()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::combiner_quotient_round");
    auto perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");
    instances.next_gate_challenges =
        update_gate_challenges(perturbator_challenge, state.accumulator->gate_challenges, state.deltas);
    combine_relation_parameters(instances);
    combine_alpha(instances);
    auto pow_polynomial = PowPolynomial<FF>(instances.next_gate_challenges);
    auto combiner = compute_combiner(instances, pow_polynomial);

    state.compressed_perturbator = state.perturbator.evaluate(perturbator_challenge);
    state.combiner_quotient = compute_combiner_quotient(state.compressed_perturbator, combiner);

    for (size_t idx = ProverInstances::NUM; idx < ProverInstances::BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), state.combiner_quotient.value_at(idx));
    }
};

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::accumulator_update_round()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::accumulator_update_round");
    FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    std::shared_ptr<Instance> next_accumulator =
        compute_next_accumulator(instances, state.combiner_quotient, combiner_challenge, state.compressed_perturbator);
    state.result.proof = transcript->proof_data;
    state.result.accumulator = next_accumulator;
};

template <class ProverInstances>
FoldingResult<typename ProverInstances::Flavor> ProtoGalaxyProver_<ProverInstances>::fold_instances()
{
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver::fold_instances");
    // Ensure instances are all of the same size
    for (size_t idx = 0; idx < ProverInstances::NUM - 1; ++idx) {
        if (instances[idx]->proving_key.circuit_size != instances[idx + 1]->proving_key.circuit_size) {
            info("ProtogalaxyProver: circuit size mismatch!");
            info("Instance ", idx, " size = ", instances[idx]->proving_key.circuit_size);
            info("Instance ", idx + 1, " size = ", instances[idx + 1]->proving_key.circuit_size);
            ASSERT(false);
        }
    }
    preparation_round();
    perturbator_round();
    combiner_quotient_round();
    accumulator_update_round();

    return state.result;
}
} // namespace bb
#pragma once
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "protogalaxy_prover.hpp"

namespace bb {
template <class ProverInstances>
void ProtoGalaxyProver_<ProverInstances>::finalise_and_send_instance(std::shared_ptr<Instance> instance,
                                                                     const std::string& domain_separator)
{
    ZoneScopedN("ProtoGalaxyProver::finalise_and_send_instance");
    OinkProver<Flavor> oink_prover(instance, transcript, domain_separator + '_');

    oink_prover.prove();
}

/**
 * @brief Given the challenge \gamma, compute Z(\gamma) and {L_0(\gamma),L_1(\gamma)}
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/764): Generalize the vanishing polynomial formula
 * and the computation of Lagrange basis for k instances
 */
template <class ProverInstances>
std::shared_ptr<typename ProverInstances::Instance> ProtoGalaxyProver_<ProverInstances>::compute_next_accumulator(
    ProverInstances& instances,
    State::CombinerQuotient& combiner_quotient,
    State::OptimisedRelationParameters& univariate_relation_parameters,
    FF& challenge,
    const FF& perturbator_evaluation)
{
    using Fun = ProtogalaxyProverInternal<ProverInstances>;

    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(challenge);
    auto [vanishing_polynomial_at_challenge, lagranges] = Fun::compute_vanishing_polynomial_and_lagranges(challenge);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/881): bad pattern
    auto next_accumulator = std::move(instances[0]);
    next_accumulator->is_accumulator = true;

    // Compute the next target sum and send the next folding parameters to the verifier
    FF next_target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;

    next_accumulator->target_sum = next_target_sum; // WORKTODO: move out
    next_accumulator->gate_challenges = state.gate_challenges;

    // Initialize accumulator proving key polynomials
    auto accumulator_polys = next_accumulator->proving_key.polynomials.get_all();
    for (size_t poly_idx = 0; poly_idx < Flavor::NUM_FOLDED_ENTITIES; poly_idx++) {
        accumulator_polys[poly_idx] *= lagranges[0];
    }

    // Fold the proving key polynomials
    for (size_t inst_idx = 1; inst_idx < ProverInstances::NUM; inst_idx++) {
        auto input_polys = instances[inst_idx]->proving_key.polynomials.get_all();
        for (size_t poly_idx = 0; poly_idx < Flavor::NUM_FOLDED_ENTITIES; poly_idx++) {
            accumulator_polys[poly_idx].add_scaled(input_polys[poly_idx], lagranges[inst_idx]);
        }
    }

    // Evaluate the combined batching  α_i univariate at challenge to obtain next α_i and send it to the
    // verifier, where i ∈ {0,...,NUM_SUBRELATIONS - 1}
    auto& folded_alphas = next_accumulator->alphas;
    for (size_t idx = 0; idx < NUM_SUBRELATIONS - 1; idx++) {
        folded_alphas[idx] = state.alphas[idx].evaluate(challenge);
    }

    // Evaluate each relation parameter univariate at challenge to obtain the folded relation parameters and send to
    // the verifier. We could reuse the univariate relation parameters comuted before, but the computation is tiny and
    // we do this now to avoid passing that state through the ProverInstances.
    for (auto [univariate, value] :
         zip_view(univariate_relation_parameters.get_to_fold(), next_accumulator->relation_parameters.get_to_fold())) {
        value = univariate.evaluate(challenge);
    }
    next_accumulator->proving_key = std::move(instances[0]->proving_key);
    return next_accumulator;
}

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::run_oink_prover_on_each_instance()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::run_oink_prover_on_each_instance");
    auto idx = 0;
    auto instance = instances[0];
    auto domain_separator = std::to_string(idx);

    // WORKTODO: just do this on a longer
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
};

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::perturbator_round()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::perturbator_round");

    using Fun = ProtogalaxyProverInternal<ProverInstances>;
    state.accumulator = get_accumulator();
    FF delta = transcript->template get_challenge<FF>("delta");
    state.deltas = compute_round_challenge_pows(state.accumulator->proving_key.log_circuit_size, delta);
    state.perturbator =
        LegacyPolynomial<FF>(state.accumulator->proving_key.log_circuit_size + 1); // initialize to all zeros
    // compute perturbator only if this is not the first round and has an accumulator
    // WORKTODO: just check if accumulator is null
    if (state.accumulator->is_accumulator) {
        state.perturbator = Fun::compute_perturbator(state.accumulator, state.deltas);
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

    using Fun = ProtogalaxyProverInternal<ProverInstances>;

    auto perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");
    state.gate_challenges =
        update_gate_challenges(perturbator_challenge, state.accumulator->gate_challenges, state.deltas);
    state.alphas = Fun::compute_and_extend_alphas(instances);
    PowPolynomial<FF> pow_polynomial{ state.gate_challenges, instances[0]->proving_key.log_circuit_size };
    state.optimised_relation_parameters =
        Fun::template compute_extended_relation_parameters<typename State::OptimisedRelationParameters>(instances);
    auto combiner = Fun::compute_combiner(instances,
                                          pow_polynomial,
                                          state.optimised_relation_parameters,
                                          state.alphas,
                                          state.optimised_univariate_accumulators);

    state.perturbator_evaluation = state.perturbator.evaluate(perturbator_challenge);
    state.combiner_quotient = Fun::compute_combiner_quotient(state.perturbator_evaluation, combiner);

    for (size_t idx = ProverInstances::NUM; idx < ProverInstances::BATCHED_EXTENDED_LENGTH; idx++) {
        transcript->send_to_verifier("combiner_quotient_" + std::to_string(idx), state.combiner_quotient.value_at(idx));
    }
};

template <class ProverInstances> void ProtoGalaxyProver_<ProverInstances>::update_target_sum_and_fold()
{
    BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::update_target_sum_and_fold");
    FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    std::shared_ptr<Instance> next_accumulator = compute_next_accumulator(instances,
                                                                          state.combiner_quotient,
                                                                          state.optimised_relation_parameters,
                                                                          combiner_challenge,
                                                                          state.perturbator_evaluation);
    state.result.proof = transcript->proof_data;
    state.result.accumulator = next_accumulator;
};

template <class ProverInstances>
FoldingResult<typename ProverInstances::Flavor> ProtoGalaxyProver_<ProverInstances>::prove()
{
    ZoneScopedN("ProtogalaxyProver::prove");
    BB_OP_COUNT_TIME_NAME("ProtogalaxyProver::prove");
    // Ensure instances are all of the same size
    for (size_t idx = 0; idx < ProverInstances::NUM - 1; ++idx) {
        if (instances[idx]->proving_key.circuit_size != instances[idx + 1]->proving_key.circuit_size) {
            info("ProtogalaxyProver: circuit size mismatch!");
            info("Instance ", idx, " size = ", instances[idx]->proving_key.circuit_size);
            info("Instance ", idx + 1, " size = ", instances[idx + 1]->proving_key.circuit_size);
            ASSERT(false);
        }
    }
    /* instances =  */ run_oink_prover_on_each_instance(/* instances */);

    /* state.deltas, state.perturbator = */ perturbator_round(/* accumulator  */);

    /* state.*/
    /* gate_challenges, alphas, optimised_relation_parameters, perturbator_evaluation, combiner_quotient */
    /* = */ combiner_quotient_round(/* gate challenges, deltas, instances */);

    /* result =  */ update_target_sum_and_fold(
        /* instances, combiner_quotient, optimised_relation_parameters, perturbator_evaluation */);

    return state.result;
}
} // namespace bb